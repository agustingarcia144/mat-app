import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth } from './permissions'

/**
 * Create a new workout day
 */
export const create = mutation({
  args: {
    weekId: v.id('workoutWeeks'),
    planificationId: v.id('planifications'),
    name: v.string(),
    order: v.number(),
    dayOfWeek: v.optional(v.number()), // 1 = Monday … 7 = Sunday (ISO)
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const now = Date.now()

    return await ctx.db.insert('workoutDays', {
      weekId: args.weekId,
      planificationId: args.planificationId,
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    return await ctx.db
      .query('workoutDays')
      .withIndex('by_planification', (q) =>
        q.eq('planificationId', args.planificationId)
      )
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

    return await ctx.db
      .query('workoutDays')
      .withIndex('by_week', (q) => q.eq('weekId', args.weekId))
      .order('asc')
      .collect()
  },
})
