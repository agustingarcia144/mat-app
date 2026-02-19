import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
} from './permissions'
import { resolveRevisionIdForPlanification } from './planificationRevisionHelpers'

/**
 * Create a new workout week
 */
export const create = mutation({
  args: {
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
    name: v.string(),
    order: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

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

    return await ctx.db.insert('workoutWeeks', {
      planificationId: args.planificationId,
      revisionId,
      name: args.name,
      order: args.order,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update a workout week
 */
export const update = mutation({
  args: {
    id: v.id('workoutWeeks'),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const week = await ctx.db.get(args.id)
    if (!week) {
      throw new Error('Workout week not found')
    }
    const planification = await ctx.db.get(week.planificationId)
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
 * Reorder workout weeks
 */
export const reorder = mutation({
  args: {
    planificationId: v.id('planifications'),
    weekIds: v.array(v.id('workoutWeeks')),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    for (const weekId of args.weekIds) {
      const week = await ctx.db.get(weekId)
      if (!week || week.planificationId !== args.planificationId) {
        throw new Error('Invalid week order payload')
      }
    }

    // Update order for each week
    for (let i = 0; i < args.weekIds.length; i++) {
      await ctx.db.patch(args.weekIds[i], {
        order: i,
        updatedAt: Date.now(),
      })
    }
  },
})

/**
 * Delete a workout week and all its days
 */
export const remove = mutation({
  args: {
    id: v.id('workoutWeeks'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const week = await ctx.db.get(args.id)
    if (!week) {
      throw new Error('Workout week not found')
    }
    const planification = await ctx.db.get(week.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    if (week.revisionId) {
      const referencingAssignments = await ctx.db
        .query('planificationAssignments')
        .withIndex('by_planification_revision', (q) =>
          q.eq('planificationId', week.planificationId).eq('revisionId', week.revisionId)
        )
        .first()
      if (referencingAssignments) {
        throw new Error('Cannot delete weeks from a revision with assignment history')
      }
    }

    // Delete all days in this week
    const days = await ctx.db
      .query('workoutDays')
      .withIndex('by_week', (q) => q.eq('weekId', args.id))
      .collect()

    for (const day of days) {
      // Delete all exercises in this day
      const exercises = await ctx.db
        .query('dayExercises')
        .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
        .collect()

      for (const exercise of exercises) {
        await ctx.db.delete(exercise._id)
      }

      await ctx.db.delete(day._id)
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Get workout weeks for a planification
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
      const revisionWeeks = await ctx.db
        .query('workoutWeeks')
        .withIndex('by_planification_revision', (q) =>
          q.eq('planificationId', args.planificationId).eq('revisionId', revisionId)
        )
        .order('asc')
        .collect()
      if (revisionWeeks.length > 0) {
        return revisionWeeks
      }
    }

    return await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.planificationId))
      .order('asc')
      .collect()
  },
})
