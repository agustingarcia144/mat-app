import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireActiveOrgContext, requireAuth } from './permissions'

const sessionStatus = v.union(
  v.literal('started'),
  v.literal('completed'),
  v.literal('skipped')
)

/**
 * Start a workout day session (member only).
 * Validates: current user is the assignment's userId and assignment is active.
 */
export const startSession = mutation({
  args: {
    assignmentId: v.id('planificationAssignments'),
    workoutDayId: v.id('workoutDays'),
    performedOn: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) throw new Error('Assignment not found')
    if (assignment.userId !== identity.subject) {
      throw new Error('Unauthorized: not your assignment')
    }
    if (assignment.organizationId !== organizationId) {
      throw new Error('Access denied: assignment is outside the active organization')
    }
    if (assignment.status !== 'active') {
      throw new Error('Assignment is not active')
    }

    const workoutDay = await ctx.db.get(args.workoutDayId)
    if (!workoutDay) throw new Error('Workout day not found')
    if (workoutDay.planificationId !== assignment.planificationId) {
      throw new Error('Workout day does not belong to this planification')
    }
    if (
      assignment.revisionId &&
      workoutDay.revisionId &&
      workoutDay.revisionId !== assignment.revisionId
    ) {
      throw new Error('Workout day does not belong to this assignment revision')
    }

    const existing = await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_assignment_workoutDay_performedOn', (q) =>
        q
          .eq('assignmentId', args.assignmentId)
          .eq('workoutDayId', args.workoutDayId)
          .eq('performedOn', args.performedOn)
      )
      .first()

    if (existing) {
      return existing._id
    }

    const now = Date.now()
    return await ctx.db.insert('workoutDaySessions', {
      assignmentId: args.assignmentId,
      planificationId: assignment.planificationId,
      revisionId: assignment.revisionId,
      workoutDayId: args.workoutDayId,
      userId: identity.subject,
      organizationId: assignment.organizationId,
      performedOn: args.performedOn,
      status: 'started',
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update session status (member only; only own sessions).
 */
export const setStatus = mutation({
  args: {
    id: v.id('workoutDaySessions'),
    status: sessionStatus,
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const session = await ctx.db.get(args.id)
    if (!session) throw new Error('Session not found')
    if (session.userId !== identity.subject) {
      throw new Error('Unauthorized: not your session')
    }
    if (session.organizationId !== organizationId) {
      throw new Error('Access denied: session is outside the active organization')
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Get sessions for the current user in a date range (for Inicio weekly calendar).
 */
export const getMyWeekSessions = query({
  args: {
    startOn: v.string(), // YYYY-MM-DD
    endOn: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const sessions = await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_user_performedOn', (q) => q.eq('userId', identity.subject))
      .collect()

    const inRange = sessions.filter(
      (s) =>
        s.organizationId === organizationId &&
        s.performedOn >= args.startOn &&
        s.performedOn <= args.endOn
    )

    const assignmentIds = Array.from(new Set(inRange.map((s) => s.assignmentId)))
    const assignments = await Promise.all(
      assignmentIds.map((assignmentId) => ctx.db.get(assignmentId))
    )
    const assignmentById = new Map(
      assignments
        .filter(
          (
            assignment
          ): assignment is NonNullable<typeof assignment> =>
            !!assignment && assignment.userId === identity.subject
        )
        .map((assignment) => [assignment._id, assignment])
    )

    return inRange.filter((session) => {
      const assignment = assignmentById.get(session.assignmentId)
      if (!assignment) return false
      return assignment.status === 'active' || session.status === 'completed'
    })
  },
})

/**
 * Get a single session by id (member only; own session).
 */
export const getById = query({
  args: { id: v.id('workoutDaySessions') },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const session = await ctx.db.get(args.id)
    if (!session) return null
    if (session.userId !== identity.subject) return null
    if (session.organizationId !== organizationId) return null
    return session
  },
})

/**
 * Get sessions for an assignment (member can only call for their own assignment).
 */
export const getByAssignment = query({
  args: {
    assignmentId: v.id('planificationAssignments'),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) return []
    if (assignment.userId !== identity.subject) return []
    if (assignment.organizationId !== organizationId) return []
    if (args.activeOnly && assignment.status !== 'active') return []

    const sessions = await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_assignment', (q) =>
        q.eq('assignmentId', args.assignmentId)
      )
      .collect()

    return sessions
  },
})

/**
 * Get history sessions grouped by assignment and revision (member only).
 */
export const getMyHistoryByAssignments = query({
  args: {},
  handler: async (ctx) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    const sessions = await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_user_performedOn', (q) => q.eq('userId', identity.subject))
      .collect()
    const scopedSessions = sessions.filter(
      (session) => session.organizationId === organizationId
    )

    const grouped = new Map<string, (typeof sessions)[number][]>()
    for (const session of scopedSessions) {
      const key = `${session.assignmentId}:${session.revisionId ?? 'legacy'}`
      const bucket = grouped.get(key) ?? []
      bucket.push(session)
      grouped.set(key, bucket)
    }

    const entries = await Promise.all(
      Array.from(grouped.entries()).map(async ([key, bucket]) => {
        const assignment = await ctx.db.get(bucket[0].assignmentId)
        return {
          key,
          assignment,
          revisionId: bucket[0].revisionId,
          sessions: bucket.sort((a, b) => a.performedOn.localeCompare(b.performedOn)),
        }
      })
    )

    return entries
  },
})
