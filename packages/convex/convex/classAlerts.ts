import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireAuth } from './permissions'

/**
 * Get the current user's alert for a schedule (null if not subscribed).
 */
export const getMyAlert = query({
  args: {
    scheduleId: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    return await ctx.db
      .query('classAlerts')
      .withIndex('by_user_schedule', (q) =>
        q.eq('userId', identity.subject).eq('scheduleId', args.scheduleId)
      )
      .first()
  },
})

/**
 * Subscribe to alerts for a schedule.
 */
export const subscribe = mutation({
  args: {
    scheduleId: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error('Clase no encontrada')

    const existing = await ctx.db
      .query('classAlerts')
      .withIndex('by_user_schedule', (q) =>
        q.eq('userId', identity.subject).eq('scheduleId', args.scheduleId)
      )
      .first()

    if (existing) return existing._id

    return await ctx.db.insert('classAlerts', {
      userId: identity.subject,
      scheduleId: args.scheduleId,
      organizationId: schedule.organizationId,
      createdAt: Date.now(),
    })
  },
})

/**
 * Unsubscribe from alerts for a schedule.
 */
export const unsubscribe = mutation({
  args: {
    scheduleId: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const existing = await ctx.db
      .query('classAlerts')
      .withIndex('by_user_schedule', (q) =>
        q.eq('userId', identity.subject).eq('scheduleId', args.scheduleId)
      )
      .first()

    if (existing) {
      await ctx.db.delete(existing._id)
    }
  },
})
