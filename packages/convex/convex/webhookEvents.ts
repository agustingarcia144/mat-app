import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

const PROCESSING_LOCK_TIMEOUT_MS = 2 * 60 * 1000

export const getBySvixId = internalQuery({
  args: {
    svixId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('webhookEvents')
      .withIndex('by_svixId', (q) => q.eq('svixId', args.svixId))
      .first()
  },
})

export const beginProcessing = internalMutation({
  args: {
    svixId: v.string(),
    svixTimestamp: v.number(),
    eventType: v.string(),
    objectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query('webhookEvents')
      .withIndex('by_svixId', (q) => q.eq('svixId', args.svixId))
      .first()

    if (!existing) {
      await ctx.db.insert('webhookEvents', {
        svixId: args.svixId,
        svixTimestamp: args.svixTimestamp,
        eventType: args.eventType,
        objectId: args.objectId,
        status: 'processing',
        attempts: 1,
        receivedAt: now,
      })
      return { alreadyProcessed: false }
    }

    if (existing.status === 'processed') {
      return { alreadyProcessed: true }
    }

    if (existing.status === 'processing') {
      if (now - existing.receivedAt < PROCESSING_LOCK_TIMEOUT_MS) {
        return { alreadyProcessed: true }
      }
    }

    await ctx.db.patch(existing._id, {
      svixTimestamp: args.svixTimestamp,
      eventType: args.eventType,
      objectId: args.objectId,
      status: 'processing',
      attempts: existing.attempts + 1,
      receivedAt: now,
      error: undefined,
    })

    return { alreadyProcessed: false }
  },
})

export const markProcessed = internalMutation({
  args: {
    svixId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('webhookEvents')
      .withIndex('by_svixId', (q) => q.eq('svixId', args.svixId))
      .first()

    if (!existing) {
      return
    }

    await ctx.db.patch(existing._id, {
      status: 'processed',
      processedAt: Date.now(),
      error: undefined,
    })
  },
})

export const markFailed = internalMutation({
  args: {
    svixId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('webhookEvents')
      .withIndex('by_svixId', (q) => q.eq('svixId', args.svixId))
      .first()

    if (!existing) {
      await ctx.db.insert('webhookEvents', {
        svixId: args.svixId,
        svixTimestamp: 0,
        eventType: 'unknown',
        status: 'failed',
        attempts: 1,
        receivedAt: Date.now(),
        error: args.error,
      })
      return
    }

    await ctx.db.patch(existing._id, {
      status: 'failed',
      error: args.error,
      processedAt: Date.now(),
    })
  },
})
