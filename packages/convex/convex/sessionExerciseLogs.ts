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
    // Comma-separated per-set seconds, e.g. "30, 30, 45"
    timeSeconds: v.optional(v.string()),
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
      timeSeconds: args.timeSeconds,
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
 * Get historical progress entries for a specific exercise across all completed sessions.
 * Returns one entry per completed session where this exercise was logged, sorted by date ascending.
 */
export const getProgressByExercise = query({
  args: { exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const dayExercises = await ctx.db
      .query('dayExercises')
      .withIndex('by_exercise', (q) => q.eq('exerciseId', args.exerciseId))
      .collect()

    if (dayExercises.length === 0) return []

    const entries: {
      performedOn: string
      reps?: string
      weight?: string
      timeSeconds?: string
      sets: number
    }[] = []

    for (const dayEx of dayExercises) {
      const logs = await ctx.db
        .query('sessionExerciseLogs')
        .withIndex('by_dayExercise', (q) => q.eq('dayExerciseId', dayEx._id))
        .collect()

      for (const log of logs) {
        const session = await ctx.db.get(log.sessionId)
        if (!session) continue
        if (session.userId !== identity.subject) continue
        if (session.organizationId !== organizationId) continue
        if (session.status !== 'completed') continue

        entries.push({
          performedOn: session.performedOn,
          reps: log.reps,
          weight: log.weight,
          timeSeconds: log.timeSeconds,
          sets: log.sets,
        })
      }
    }

    entries.sort((a, b) => a.performedOn.localeCompare(b.performedOn))
    return entries
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
