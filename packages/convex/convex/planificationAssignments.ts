import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireActiveOrgContext,
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
} from './permissions'
import { ensureCurrentRevisionForPlanification } from './planificationRevisionHelpers'

/**
 * Assign a planification to a member
 */
export const assign = mutation({
  args: {
    planificationId: v.id('planifications'),
    userId: v.string(), // Clerk user ID of member
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) {
      throw new Error('Planification not found')
    }
    if (planification.isTemplate) {
      throw new Error('No se pueden asignar plantillas a miembros')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const targetMembership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', planification.organizationId).eq('userId', args.userId)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first()
    if (!targetMembership) {
      throw new Error('Target user is not an active member of this organization')
    }

    // Check if already assigned
    const existing = await ctx.db
      .query('planificationAssignments')
      .filter((q) =>
        q.and(
          q.eq(q.field('planificationId'), args.planificationId),
          q.eq(q.field('userId'), args.userId),
          q.eq(q.field('status'), 'active')
        )
      )
      .first()

    if (existing) {
      throw new Error('Planification already assigned to this user')
    }

    const now = Date.now()
    const revisionId = await ensureCurrentRevisionForPlanification(
      ctx,
      args.planificationId,
      identity.subject
    )

    const assignmentId = await ctx.db.insert('planificationAssignments', {
      planificationId: args.planificationId,
      revisionId,
      userId: args.userId,
      organizationId: planification.organizationId,
      assignedBy: identity.subject,
      status: 'active',
      startDate: args.startDate,
      endDate: args.endDate,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.planificationId, {
      hasEverBeenAssigned: true,
      updatedAt: now,
    })

    return assignmentId
  },
})

/**
 * Unassign a planification
 */
export const unassign = mutation({
  args: {
    id: v.id('planificationAssignments'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const assignment = await ctx.db.get(args.id)
    if (!assignment) {
      throw new Error('Assignment not found')
    }

    await requireAdminOrTrainer(ctx, assignment.organizationId)

    await ctx.db.patch(args.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
  },
})

/**
 * Update assignment status
 */
export const updateStatus = mutation({
  args: {
    id: v.id('planificationAssignments'),
    status: v.union(
      v.literal('active'),
      v.literal('completed'),
      v.literal('cancelled')
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const assignment = await ctx.db.get(args.id)
    if (!assignment) {
      throw new Error('Assignment not found')
    }

    await requireAdminOrTrainer(ctx, assignment.organizationId)

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Get assignments for a user
 */
export const getByUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity, organizationId } = await requireActiveOrgContext(ctx)

    if (args.userId !== identity.subject) {
      await requireAdminOrTrainer(ctx, organizationId)
    }

    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const effectiveAssignments = assignments.filter(
      (assignment) => assignment.organizationId === organizationId
    )

    // Fetch planification details and weeks count
    const withDetails = await Promise.all(
      effectiveAssignments.map(async (assignment) => {
        const planification = await ctx.db.get(assignment.planificationId)
        const weeks = await ctx.db
          .query('workoutWeeks')
          .withIndex('by_planification', (q) =>
            q.eq('planificationId', assignment.planificationId)
          )
          .collect()
        return {
          ...assignment,
          planification,
          weeksCount: weeks.length,
        }
      })
    )

    return withDetails
  },
})

/**
 * Get assignments for a planification (excludes cancelled / unassigned)
 */
export const getByPlanification = query({
  args: {
    planificationId: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) return []
    await requireOrganizationMembership(ctx, planification.organizationId)

    const allAssignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) =>
        q.eq('planificationId', args.planificationId)
      )
      .collect()
    const assignments = allAssignments.filter((a) => a.status !== 'cancelled')

    // Fetch user details for each assignment
    const withUserDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_externalId', (q) => q.eq('externalId', assignment.userId))
          .first()
        
        return {
          ...assignment,
          user,
        }
      })
    )

    return withUserDetails
  },
})

/**
 * Get all assignments for an organization
 */
export const getByOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    await requireAdminOrTrainer(ctx, args.organizationId)

    return await ctx.db
      .query('planificationAssignments')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', args.organizationId)
      )
      .collect()
  },
})
