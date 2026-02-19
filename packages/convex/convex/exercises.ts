import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
} from './permissions'

/**
 * Create a new exercise
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    muscleGroups: v.array(v.string()),
    equipment: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const membership = await requireCurrentOrganizationMembership(ctx)

    await requireAdminOrTrainer(ctx, membership.organizationId)

    const now = Date.now()

    return await ctx.db.insert('exercises', {
      organizationId: membership.organizationId,
      name: args.name,
      description: args.description,
      category: args.category,
      muscleGroups: args.muscleGroups,
      equipment: args.equipment,
      videoUrl: args.videoUrl,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update an exercise
 */
export const update = mutation({
  args: {
    id: v.id('exercises'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    muscleGroups: v.optional(v.array(v.string())),
    equipment: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const exercise = await ctx.db.get(args.id)
    if (!exercise) {
      throw new Error('Exercise not found')
    }

    await requireAdminOrTrainer(ctx, exercise.organizationId)

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Delete an exercise
 */
export const remove = mutation({
  args: {
    id: v.id('exercises'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const exercise = await ctx.db.get(args.id)
    if (!exercise) {
      throw new Error('Exercise not found')
    }

    await requireAdminOrTrainer(ctx, exercise.organizationId)

    // Check if exercise is used in any day exercises
    const usedInDays = await ctx.db
      .query('dayExercises')
      .withIndex('by_exercise', (q) => q.eq('exerciseId', args.id))
      .first()

    if (usedInDays) {
      throw new Error(
        'Cannot delete exercise: it is being used in workout planifications'
      )
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Get all exercises for the current user's organization
 */
export const getByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const membership = await requireCurrentOrganizationMembership(ctx).catch(
      () => null
    )
    if (!membership) return []

    const exercises = await ctx.db
      .query('exercises')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    return exercises.sort((a, b) => a.name.localeCompare(b.name))
  },
})

/**
 * Search exercises by name in the current user's organization
 */
export const search = query({
  args: {
    searchTerm: v.string(),
    category: v.optional(v.string()),
    equipment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const membership = await requireCurrentOrganizationMembership(ctx).catch(
      () => null
    )
    if (!membership) return []

    let exercises = await ctx.db
      .query('exercises')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()
    // Filter by category if provided
    if (args.category && args.category !== 'all') {
      exercises = exercises.filter((e) => e.category === args.category)
    }
    if (args.equipment && args.equipment !== 'all') {
      exercises = exercises.filter((e) => e.equipment === args.equipment)
    }
    if (args.searchTerm) {
      const term = args.searchTerm.toLowerCase()

      exercises = exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          e.description?.toLowerCase().includes(term) ||
          e.muscleGroups.some((m) => m.toLowerCase().includes(term))
      )
    }
    return exercises.sort((a, b) => a.name.localeCompare(b.name))
  },
})

/**
 * List distinct categories and equipment for the current org (for filter badges)
 */
export const listFacets = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity)
      return { categories: [] as string[], equipment: [] as string[] }

    const membership = await requireCurrentOrganizationMembership(ctx).catch(
      () => null
    )
    if (!membership)
      return { categories: [] as string[], equipment: [] as string[] }

    const exercises = await ctx.db
      .query('exercises')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    const categories = Array.from(
      new Set(
        exercises.map((e) => e.category).filter((v): v is string => Boolean(v))
      )
    ).sort()

    const equipment = Array.from(
      new Set(
        exercises.map((e) => e.equipment).filter((v): v is string => Boolean(v))
      )
    ).sort()

    return { categories, equipment }
  },
})

/**
 * Get exercise by ID
 */
export const getById = query({
  args: {
    id: v.id('exercises'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const exercise = await ctx.db.get(args.id)
    if (!exercise) return null

    await requireOrganizationMembership(ctx, exercise.organizationId)
    return exercise
  },
})
