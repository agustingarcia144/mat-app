import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth, requireAdminOrTrainer } from './permissions'

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

    // Get user's organization
    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .first()

    if (!membership) {
      throw new Error('User is not a member of any organization')
    }

    await requireAdminOrTrainer(ctx, membership.organizationId)

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

    return await ctx.db.insert('planificationAssignments', {
      planificationId: args.planificationId,
      userId: args.userId,
      organizationId: membership.organizationId,
      assignedBy: identity.subject,
      status: 'active',
      startDate: args.startDate,
      endDate: args.endDate,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })
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
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()

    // Fetch planification details
    const withDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const planification = await ctx.db.get(assignment.planificationId)
        return {
          ...assignment,
          planification,
        }
      })
    )

    return withDetails
  },
})

/**
 * Get assignments for a planification
 */
export const getByPlanification = query({
  args: {
    planificationId: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) =>
        q.eq('planificationId', args.planificationId)
      )
      .collect()

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

    return await ctx.db
      .query('planificationAssignments')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', args.organizationId)
      )
      .collect()
  },
})
