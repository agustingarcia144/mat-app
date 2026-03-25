import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
} from './permissions'
import { resolveRevisionIdForPlanification } from './planificationRevisionHelpers'

/**
 * Create a new day exercise
 */
export const create = mutation({
  args: {
    workoutDayId: v.id('workoutDays'),
    exerciseId: v.id('exercises'),
    blockId: v.optional(v.id('exerciseBlocks')),
    order: v.number(),
    sets: v.number(),
    reps: v.string(),
    weight: v.optional(v.string()),
    prPercentage: v.optional(v.number()),
    timeSeconds: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const workoutDay = await ctx.db.get(args.workoutDayId)
    if (!workoutDay) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    const exercise = await ctx.db.get(args.exerciseId)
    if (!exercise) {
      throw new Error('Exercise not found')
    }
    if (
      exercise.organizationId !== planification.organizationId &&
      !exercise.isStandard
    ) {
      throw new Error('Exercise does not belong to this organization')
    }

    // If blockId is provided, verify it belongs to the workout day
    if (args.blockId) {
      const block = await ctx.db.get(args.blockId)
      if (!block || block.workoutDayId !== args.workoutDayId) {
        throw new Error(
          'Invalid block ID or block does not belong to workout day'
        )
      }
    }

    const now = Date.now()

    return await ctx.db.insert('dayExercises', {
      workoutDayId: args.workoutDayId,
      revisionId: workoutDay.revisionId,
      exerciseId: args.exerciseId,
      blockId: args.blockId,
      order: args.order,
      sets: args.sets,
      reps: args.reps,
      weight: args.weight,
      prPercentage: args.prPercentage,
      timeSeconds: args.timeSeconds,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update a day exercise
 */
export const update = mutation({
  args: {
    id: v.id('dayExercises'),
    blockId: v.optional(v.union(v.id('exerciseBlocks'), v.null())),
    sets: v.optional(v.number()),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    prPercentage: v.optional(v.number()),
    timeSeconds: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const dayExercise = await ctx.db.get(args.id)
    if (!dayExercise) {
      throw new Error('Day exercise not found')
    }
    const workoutDay = await ctx.db.get(dayExercise.workoutDayId)
    if (!workoutDay) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    // If blockId is being updated, verify it belongs to the workout day
    if (args.blockId !== undefined && args.blockId !== null) {
      const block = await ctx.db.get(args.blockId)
      if (!block || block.workoutDayId !== dayExercise.workoutDayId) {
        throw new Error(
          'Invalid block ID or block does not belong to workout day'
        )
      }
    }

    const { id, blockId, ...updates } = args

    const patchData: any = {
      ...updates,
      updatedAt: Date.now(),
    }

    if (blockId !== undefined) {
      patchData.blockId = blockId === null ? undefined : blockId
    }

    await ctx.db.patch(id, patchData)
  },
})

/**
 * Reorder exercises in a workout day
 */
export const reorder = mutation({
  args: {
    workoutDayId: v.id('workoutDays'),
    exerciseIds: v.array(v.id('dayExercises')),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const workoutDay = await ctx.db.get(args.workoutDayId)
    if (!workoutDay) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    for (const exerciseId of args.exerciseIds) {
      const dayExercise = await ctx.db.get(exerciseId)
      if (!dayExercise || dayExercise.workoutDayId !== args.workoutDayId) {
        throw new Error('Invalid exercise order payload')
      }
    }

    // Update order for each exercise
    for (let i = 0; i < args.exerciseIds.length; i++) {
      await ctx.db.patch(args.exerciseIds[i], {
        order: i,
        updatedAt: Date.now(),
      })
    }
  },
})

/**
 * Delete a day exercise
 */
export const remove = mutation({
  args: {
    id: v.id('dayExercises'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const dayExercise = await ctx.db.get(args.id)
    if (!dayExercise) {
      throw new Error('Day exercise not found')
    }
    const workoutDay = await ctx.db.get(dayExercise.workoutDayId)
    if (!workoutDay) {
      throw new Error('Workout day not found')
    }
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    await requireAdminOrTrainer(ctx, planification.organizationId)

    await ctx.db.delete(args.id)
  },
})

/**
 * Get a single day exercise by ID (e.g. for notes on exercise detail screen)
 */
export const getById = query({
  args: {
    id: v.id('dayExercises'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const dayExercise = await ctx.db.get(args.id)
    if (!dayExercise) return null
    const workoutDay = await ctx.db.get(dayExercise.workoutDayId)
    if (!workoutDay) return null
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) return null
    await requireOrganizationMembership(ctx, planification.organizationId)
    return dayExercise
  },
})

/**
 * Get exercises for a workout day
 */
export const getByWorkoutDay = query({
  args: {
    workoutDayId: v.id('workoutDays'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const workoutDay = await ctx.db.get(args.workoutDayId)
    if (!workoutDay) return []
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) return []
    await requireOrganizationMembership(ctx, planification.organizationId)

    const dayExercises = await ctx.db
      .query('dayExercises')
      .withIndex('by_workout_day', (q) =>
        q.eq('workoutDayId', args.workoutDayId)
      )
      .order('asc')
      .collect()

    // Fetch exercise details for each
    const exercisesWithDetails = await Promise.all(
      dayExercises.map(async (dayEx) => {
        const exercise = await ctx.db.get(dayEx.exerciseId)
        return {
          ...dayEx,
          exercise,
        }
      })
    )

    return exercisesWithDetails
  },
})

/**
 * Get exercises for a specific block
 */
export const getByBlock = query({
  args: {
    blockId: v.id('exerciseBlocks'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const block = await ctx.db.get(args.blockId)
    if (!block) return []
    const workoutDay = await ctx.db.get(block.workoutDayId)
    if (!workoutDay) return []
    const planification = await ctx.db.get(workoutDay.planificationId)
    if (!planification) return []
    await requireOrganizationMembership(ctx, planification.organizationId)

    const dayExercises = await ctx.db
      .query('dayExercises')
      .withIndex('by_block', (q) => q.eq('blockId', args.blockId))
      .order('asc')
      .collect()

    // Fetch exercise details for each
    const exercisesWithDetails = await Promise.all(
      dayExercises.map(async (dayEx) => {
        const exercise = await ctx.db.get(dayEx.exerciseId)
        return {
          ...dayEx,
          exercise,
        }
      })
    )

    return exercisesWithDetails
  },
})

/**
 * Get all exercises for a planification (grouped by day)
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
    // Get all days for this planification/revision
    let workoutDays = revisionId
      ? await ctx.db
          .query('workoutDays')
          .withIndex('by_planification_revision', (q) =>
            q
              .eq('planificationId', args.planificationId)
              .eq('revisionId', revisionId)
          )
          .collect()
      : await ctx.db
          .query('workoutDays')
          .withIndex('by_planification', (q) =>
            q.eq('planificationId', args.planificationId)
          )
          .collect()
    if (revisionId && workoutDays.length === 0) {
      workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_planification', (q) =>
          q.eq('planificationId', args.planificationId)
        )
        .collect()
    }

    const dayIds = workoutDays.map((d) => d._id)

    // Get all exercises for all days
    const allExercises = await ctx.db.query('dayExercises').collect()
    const relevantExercises = allExercises.filter((ex) =>
      dayIds.includes(ex.workoutDayId)
    )

    // Fetch exercise details
    const exercisesWithDetails = await Promise.all(
      relevantExercises.map(async (dayEx) => {
        const exercise = await ctx.db.get(dayEx.exerciseId)
        return {
          ...dayEx,
          exercise,
        }
      })
    )

    return exercisesWithDetails
  },
})
