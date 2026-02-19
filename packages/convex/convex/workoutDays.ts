import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
} from './permissions'
import { resolveRevisionIdForPlanification } from './planificationRevisionHelpers'

/**
 * Create a new workout day
 */
export const create = mutation({
  args: {
    weekId: v.id('workoutWeeks'),
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
    name: v.string(),
    order: v.number(),
    dayOfWeek: v.optional(v.number()), // 1 = Monday … 7 = Sunday (ISO)
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const week = await ctx.db.get(args.weekId)
    if (!week) {
      throw new Error('Workout week not found')
    }
    if (week.planificationId !== args.planificationId) {
      throw new Error('Workout week does not belong to planification')
    }

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    const now = Date.now()
    const revisionId = await resolveRevisionIdForPlanification(
      ctx,
      args.planificationId,
      args.revisionId
    )

    return await ctx.db.insert('workoutDays', {
      weekId: args.weekId,
      planificationId: args.planificationId,
      revisionId,
      name: args.name,
      order: args.order,
      dayOfWeek: args.dayOfWeek,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update a workout day
 */
export const update = mutation({
  args: {
    id: v.id('workoutDays'),
    name: v.optional(v.string()),
    dayOfWeek: v.optional(v.number()), // 1 = Monday … 7 = Sunday (ISO)
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const day = await ctx.db.get(args.id)
    if (!day) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(day.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Reorder workout days within a week
 */
export const reorder = mutation({
  args: {
    weekId: v.id('workoutWeeks'),
    dayIds: v.array(v.id('workoutDays')),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const week = await ctx.db.get(args.weekId)
    if (!week) {
      throw new Error('Workout week not found')
    }
    const planification = await ctx.db.get(week.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    for (const dayId of args.dayIds) {
      const day = await ctx.db.get(dayId)
      if (!day || day.weekId !== args.weekId) {
        throw new Error('Invalid day order payload')
      }
    }

    // Update order for each day
    for (let i = 0; i < args.dayIds.length; i++) {
      await ctx.db.patch(args.dayIds[i], {
        order: i,
        updatedAt: Date.now(),
      })
    }
  },
})

/**
 * Delete a workout day
 */
export const remove = mutation({
  args: {
    id: v.id('workoutDays'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const day = await ctx.db.get(args.id)
    if (!day) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(day.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    if (day.revisionId) {
      const referencingAssignments = await ctx.db
        .query('planificationAssignments')
        .withIndex('by_planification_revision', (q) =>
          q.eq('planificationId', day.planificationId).eq('revisionId', day.revisionId)
        )
        .first()
      if (referencingAssignments) {
        throw new Error('Cannot delete days from a revision with assignment history')
      }
    }

    // Delete all exercises in this day
    const exercises = await ctx.db
      .query('dayExercises')
      .withIndex('by_workout_day', (q) => q.eq('workoutDayId', args.id))
      .collect()

    for (const exercise of exercises) {
      await ctx.db.delete(exercise._id)
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Get workout days for a planification
 */
export const getByPlanification = query({
  args: {
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) return []
    await requireOrganizationMembership(ctx, planification.organizationId)

    const revisionId = await resolveRevisionIdForPlanification(
      ctx,
      args.planificationId,
      args.revisionId
    )
    if (revisionId) {
      const revisionDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_planification_revision', (q) =>
          q.eq('planificationId', args.planificationId).eq('revisionId', revisionId)
        )
        .order('asc')
        .collect()
      if (revisionDays.length > 0) {
        return revisionDays
      }
    }

    return await ctx.db
      .query('workoutDays')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.planificationId))
      .order('asc')
      .collect()
  },
})

/**
 * Get workout days for a specific week
 */
export const getByWeek = query({
  args: {
    weekId: v.id('workoutWeeks'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const week = await ctx.db.get(args.weekId)
    if (!week) return []
    const planification = await ctx.db.get(week.planificationId)
    if (!planification) return []
    await requireOrganizationMembership(ctx, planification.organizationId)

    return await ctx.db
      .query('workoutDays')
      .withIndex('by_week', (q) => q.eq('weekId', args.weekId))
      .order('asc')
      .collect()
  },
})

/**
 * Get a workout day by id.
 */
export const getById = query({
  args: {
    id: v.id('workoutDays'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const day = await ctx.db.get(args.id)
    if (!day) return null
    const planification = await ctx.db.get(day.planificationId)
    if (!planification) return null
    await requireOrganizationMembership(ctx, planification.organizationId)
    return day
  },
})
