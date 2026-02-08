import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth, requireAdminOrTrainer } from './permissions'

/**
 * Create a new planification
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    // Get user's organization
    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .first()

    if (!membership) {
      throw new Error('User is not a member of any organization')
    }

    await requireAdminOrTrainer(ctx, membership.organizationId)

    const now = Date.now()

    return await ctx.db.insert('planifications', {
      organizationId: membership.organizationId,
      name: args.name,
      description: args.description,
      folderId: args.folderId,
      isTemplate: args.isTemplate,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update a planification
 */
export const update = mutation({
  args: {
    id: v.id('planifications'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
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
 * Delete a planification and all related data
 */
export const remove = mutation({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    // Delete all workout weeks
    const workoutWeeks = await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()

    for (const week of workoutWeeks) {
      // Delete all workout days in this week
      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_week', (q) => q.eq('weekId', week._id))
        .collect()

      for (const day of workoutDays) {
        // Delete day exercises
        const dayExercises = await ctx.db
          .query('dayExercises')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()

        for (const exercise of dayExercises) {
          await ctx.db.delete(exercise._id)
        }

        await ctx.db.delete(day._id)
      }

      await ctx.db.delete(week._id)
    }

    // Delete assignments
    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()

    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id)
    }

    // Delete the planification
    await ctx.db.delete(args.id)
  },
})

/**
 * Duplicate a planification
 */
export const duplicate = mutation({
  args: {
    id: v.id('planifications'),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const original = await ctx.db.get(args.id)
    if (!original) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, original.organizationId)

    const now = Date.now()

    // Create new planification
    const newPlanificationId = await ctx.db.insert('planifications', {
      organizationId: original.organizationId,
      name: args.name || `${original.name} (copia)`,
      description: original.description,
      folderId: original.folderId,
      isTemplate: original.isTemplate,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    // Duplicate workout weeks
    const workoutWeeks = await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()

    for (const week of workoutWeeks) {
      const newWeekId = await ctx.db.insert('workoutWeeks', {
        planificationId: newPlanificationId,
        name: week.name,
        order: week.order,
        notes: week.notes,
        createdAt: now,
        updatedAt: now,
      })

      // Duplicate workout days
      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_week', (q) => q.eq('weekId', week._id))
        .collect()

      for (const day of workoutDays) {
        const newDayId = await ctx.db.insert('workoutDays', {
          weekId: newWeekId,
          planificationId: newPlanificationId,
          name: day.name,
          order: day.order,
          notes: day.notes,
          createdAt: now,
          updatedAt: now,
        })

        // Duplicate day exercises
        const dayExercises = await ctx.db
          .query('dayExercises')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()

        for (const exercise of dayExercises) {
          await ctx.db.insert('dayExercises', {
            workoutDayId: newDayId,
            exerciseId: exercise.exerciseId,
            order: exercise.order,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
            notes: exercise.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    return newPlanificationId
  },
})

/**
 * Get planification by ID
 */
export const getById = query({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Get all planifications for the current user's organization
 */
export const getByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    // Get user's organization
    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .first()

    if (!membership) return []

    return await ctx.db
      .query('planifications')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()
  },
})

/**
 * Get planifications by folder for the current user's organization.
 * When folderId is undefined (root "Todas" selected), returns all planifications.
 */
export const getByFolder = query({
  args: {
    folderId: v.optional(v.id('folders')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    // Get user's organization
    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .first()

    if (!membership) return []

    // Root level (Todas): return all planifications for the organization
    if (args.folderId === undefined) {
      return await ctx.db
        .query('planifications')
        .withIndex('by_organization', (q) =>
          q.eq('organizationId', membership.organizationId)
        )
        .collect()
    }

    return await ctx.db
      .query('planifications')
      .withIndex('by_organization_folder', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('folderId', args.folderId)
      )
      .collect()
  },
})
