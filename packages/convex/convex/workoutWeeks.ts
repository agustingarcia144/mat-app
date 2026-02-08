import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth } from './permissions'

/**
 * Create a new workout week
 */
export const create = mutation({
  args: {
    planificationId: v.id('planifications'),
    name: v.string(),
    order: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const now = Date.now()

    return await ctx.db.insert('workoutWeeks', {
      planificationId: args.planificationId,
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    return await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification', (q) =>
        q.eq('planificationId', args.planificationId)
      )
      .order('asc')
      .collect()
  },
})
