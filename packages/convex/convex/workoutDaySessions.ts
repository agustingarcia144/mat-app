import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth } from './permissions'

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
    const identity = await requireAuth(ctx)

    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) throw new Error('Assignment not found')
    if (assignment.userId !== identity.subject) {
      throw new Error('Unauthorized: not your assignment')
    }
    if (assignment.status !== 'active') {
      throw new Error('Assignment is not active')
    }

    const workoutDay = await ctx.db.get(args.workoutDayId)
    if (!workoutDay) throw new Error('Workout day not found')
    if (workoutDay.planificationId !== assignment.planificationId) {
      throw new Error('Workout day does not belong to this planification')
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
    const identity = await requireAuth(ctx)

    const session = await ctx.db.get(args.id)
    if (!session) throw new Error('Session not found')
    if (session.userId !== identity.subject) {
      throw new Error('Unauthorized: not your session')
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
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const sessions = await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_user_performedOn', (q) => q.eq('userId', identity.subject))
      .collect()

    return sessions.filter(
      (s) => s.performedOn >= args.startOn && s.performedOn <= args.endOn
    )
  },
})

/**
 * Get a single session by id (member only; own session).
 */
export const getById = query({
  args: { id: v.id('workoutDaySessions') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const session = await ctx.db.get(args.id)
    if (!session) return null
    if (session.userId !== identity.subject) return null
    return session
  },
})

/**
 * Get sessions for an assignment (member can only call for their own assignment).
 */
export const getByAssignment = query({
  args: {
    assignmentId: v.id('planificationAssignments'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) return []
    if (assignment.userId !== identity.subject) return []

    return await ctx.db
      .query('workoutDaySessions')
      .withIndex('by_assignment', (q) =>
        q.eq('assignmentId', args.assignmentId)
      )
      .collect()
  },
})
