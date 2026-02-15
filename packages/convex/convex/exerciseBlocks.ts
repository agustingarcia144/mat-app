import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth } from './permissions'

/**
 * Create a new exercise block
 */
export const create = mutation({
  args: {
    workoutDayId: v.id('workoutDays'),
    name: v.string(),
    order: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const now = Date.now()

    return await ctx.db.insert('exerciseBlocks', {
      workoutDayId: args.workoutDayId,
      name: args.name,
      order: args.order,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update an exercise block
 */
export const update = mutation({
  args: {
    id: v.id('exerciseBlocks'),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const block = await ctx.db.get(args.id)
    if (!block) {
      throw new Error('Exercise block not found')
    }

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Reorder exercise blocks within a workout day
 */
export const reorder = mutation({
  args: {
    workoutDayId: v.id('workoutDays'),
    blockIds: v.array(v.id('exerciseBlocks')),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    // Verify all blocks belong to the workout day
    for (const blockId of args.blockIds) {
      const block = await ctx.db.get(blockId)
      if (!block || block.workoutDayId !== args.workoutDayId) {
        throw new Error('Invalid block ID or block does not belong to workout day')
      }
    }

    // Update order for each block
    for (let i = 0; i < args.blockIds.length; i++) {
      await ctx.db.patch(args.blockIds[i], {
        order: i,
        updatedAt: Date.now(),
      })
    }
  },
})

/**
 * Delete an exercise block
 * Note: This will fail if the block has exercises. Exercises must be moved or deleted first.
 */
export const remove = mutation({
  args: {
    id: v.id('exerciseBlocks'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const block = await ctx.db.get(args.id)
    if (!block) {
      throw new Error('Exercise block not found')
    }

    // Check if block has any exercises
    const exercises = await ctx.db
      .query('dayExercises')
      .withIndex('by_block', (q) => q.eq('blockId', args.id))
      .first()

    if (exercises) {
      throw new Error(
        'Cannot delete block that contains exercises. Move or delete exercises first.'
      )
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Get exercise blocks for a workout day
 */
export const getByWorkoutDay = query({
  args: {
    workoutDayId: v.id('workoutDays'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    return await ctx.db
      .query('exerciseBlocks')
      .withIndex('by_workout_day', (q) => q.eq('workoutDayId', args.workoutDayId))
      .order('asc')
      .collect()
  },
})

/**
 * Get all exercise blocks for all workout days of a planification
 */
export const getByPlanification = query({
  args: {
    planificationId: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const workoutDays = await ctx.db
      .query('workoutDays')
      .withIndex('by_planification', (q) =>
        q.eq('planificationId', args.planificationId)
      )
      .collect()

    const blocks: Awaited<ReturnType<typeof ctx.db.query<'exerciseBlocks'>>> = []
    for (const day of workoutDays) {
      const dayBlocks = await ctx.db
        .query('exerciseBlocks')
        .withIndex('by_workout_day_order', (q) =>
          q.eq('workoutDayId', day._id)
        )
        .order('asc')
        .collect()
      blocks.push(...dayBlocks)
    }
    return blocks
  },
})

/**
 * Get exercise block by ID
 */
export const getById = query({
  args: {
    id: v.id('exerciseBlocks'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
