import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth } from './permissions'

/**
 * Create a new day exercise
 */
export const create = mutation({
  args: {
    workoutDayId: v.id('workoutDays'),
    exerciseId: v.id('exercises'),
    order: v.number(),
    sets: v.number(),
    reps: v.string(),
    weight: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const now = Date.now()

    return await ctx.db.insert('dayExercises', {
      workoutDayId: args.workoutDayId,
      exerciseId: args.exerciseId,
      order: args.order,
      sets: args.sets,
      reps: args.reps,
      weight: args.weight,
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
    sets: v.optional(v.number()),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const dayExercise = await ctx.db.get(args.id)
    if (!dayExercise) {
      throw new Error('Day exercise not found')
    }

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
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

    await ctx.db.delete(args.id)
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
