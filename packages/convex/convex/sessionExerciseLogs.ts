import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireActiveOrgContext, requireAuth } from './permissions'

/**
 * Set or update log for one exercise in a session (member only; own session).
 */
export const setLog = mutation({
  args: {
    sessionId: v.id('workoutDaySessions'),
    dayExerciseId: v.id('dayExercises'),
    sets: v.number(),
    reps: v.string(),
    weight: v.optional(v.string()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const { organizationId } = await requireActiveOrgContext(ctx)

    const session = await ctx.db.get(args.sessionId)
    if (!session) throw new Error('Session not found')
    if (session.userId !== identity.subject) {
      throw new Error('Unauthorized: not your session')
    }
    if (session.organizationId !== organizationId) {
      throw new Error('Access denied: session is outside the active organization')
    }

    const dayExercise = await ctx.db.get(args.dayExerciseId)
    if (!dayExercise) throw new Error('Day exercise not found')
    if (dayExercise.workoutDayId !== session.workoutDayId) {
      throw new Error('Day exercise does not belong to this session')
    }

    const existing = await ctx.db
      .query('sessionExerciseLogs')
      .withIndex('by_session_dayExercise', (q) =>
        q.eq('sessionId', args.sessionId).eq('dayExerciseId', args.dayExerciseId)
      )
      .first()

    const now = Date.now()
    const doc = {
      sessionId: args.sessionId,
      dayExerciseId: args.dayExerciseId,
      revisionId: session.revisionId,
      sets: args.sets,
      reps: args.reps,
      weight: args.weight,
      order: args.order,
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, doc)
      return existing._id
    }
    return await ctx.db.insert('sessionExerciseLogs', {
      ...doc,
      createdAt: now,
    })
  },
})

/**
 * Get all exercise logs for a session (member only; own session).
 */
export const getBySession = query({
  args: {
    sessionId: v.id('workoutDaySessions'),
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const session = await ctx.db.get(args.sessionId)
    if (!session) return []
    if (session.userId !== identity.subject) return []
    if (session.organizationId !== organizationId) return []

    const logs = await ctx.db
      .query('sessionExerciseLogs')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    const withDetails = await Promise.all(
      logs.map(async (log) => {
        const dayExercise = await ctx.db.get(log.dayExerciseId)
        const exercise = dayExercise
          ? await ctx.db.get(dayExercise.exerciseId)
          : null
        return {
          ...log,
          dayExercise,
          exercise,
        }
      })
    )

    withDetails.sort((a, b) => a.order - b.order)
    return withDetails
  },
})
