import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth, requireAdminOrTrainer } from './permissions'

/**
 * Create a single class schedule
 */
export const create = mutation({
  args: {
    classId: v.id('classes'),
    startTime: v.number(),
    endTime: v.number(),
    capacity: v.optional(v.number()), // Override class capacity
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    const now = Date.now()

    return await ctx.db.insert('classSchedules', {
      classId: args.classId,
      organizationId: classTemplate.organizationId,
      startTime: args.startTime,
      endTime: args.endTime,
      capacity: args.capacity ?? classTemplate.capacity,
      currentReservations: 0,
      status: 'scheduled',
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update a class schedule
 */
export const update = mutation({
  args: {
    id: v.id('classSchedules'),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    capacity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId)

    // If reducing capacity, check that we don't have more reservations
    if (args.capacity !== undefined && args.capacity < schedule.currentReservations) {
      throw new Error(
        `Cannot reduce capacity below current reservations (${schedule.currentReservations})`
      )
    }

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Cancel a specific class occurrence
 */
export const cancel = mutation({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId)

    // Cancel all reservations for this schedule
    const reservations = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule_status', (q) =>
        q.eq('scheduleId', args.id).eq('status', 'confirmed')
      )
      .collect()

    const now = Date.now()
    for (const reservation of reservations) {
      await ctx.db.patch(reservation._id, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch(args.id, {
      status: 'cancelled',
      updatedAt: now,
    })
  },
})

/**
 * Get schedule by ID
 */
export const getById = query({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Get all schedules for a specific class
 */
export const getByClass = query({
  args: {
    classId: v.id('classes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('classSchedules')
      .withIndex('by_class', (q) => q.eq('classId', args.classId))
      .collect()
  },
})

/**
 * Get schedules in a date range for an organization
 */
export const getByOrganizationAndDateRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    classId: v.optional(v.id('classes')), // Filter by specific class
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

    // Get schedules in the date range
    const schedules = await ctx.db
      .query('classSchedules')
      .withIndex('by_organization_time', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .gte('startTime', args.startDate)
      )
      .filter((q) => q.lte(q.field('startTime'), args.endDate))
      .collect()

    // Filter by classId if provided
    if (args.classId) {
      return schedules.filter((s) => s.classId === args.classId)
    }

    return schedules
  },
})

/**
 * Get upcoming schedules (next N occurrences)
 */
export const getUpcoming = query({
  args: {
    limit: v.optional(v.number()),
    classId: v.optional(v.id('classes')),
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

    const now = Date.now()
    const limit = args.limit ?? 10

    let query = ctx.db
      .query('classSchedules')
      .withIndex('by_organization_time', (q) =>
        q.eq('organizationId', membership.organizationId).gte('startTime', now)
      )
      .filter((q) => q.eq(q.field('status'), 'scheduled'))

    if (args.classId) {
      query = query.filter((q) => q.eq(q.field('classId'), args.classId))
    }

    return await query.take(limit)
  },
})

/**
 * Get schedule with enriched data (class info, reservation count)
 */
export const getScheduleWithDetails = query({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id)
    if (!schedule) return null

    const classTemplate = await ctx.db.get(schedule.classId)
    
    return {
      ...schedule,
      class: classTemplate,
    }
  },
})

/**
 * Debug: Get all schedules for organization
 */
export const getAllByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .first()

    if (!membership) return []

    return await ctx.db
      .query('classSchedules')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()
  },
})
