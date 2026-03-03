/**
 * Deferred deep linking: join gym by signed token (QR code flow).
 * Token is verified server-side; membership is created via Clerk API; Convex syncs via webhook.
 */
import {
  action,
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from './permissions'

/** Internal: get public org info by Clerk external id (for HTTP join page). */
export const getOrgByExternalId = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.externalId))
      .first()
    if (!org) return null
    return { name: org.name, logoUrl: org.logoUrl ?? undefined }
  },
})

/** Internal: get full org doc by external id (for actions that need _id). */
export const getOrgDocByExternalId = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.externalId))
      .first()
  },
})

/** Internal: check if user has active membership in org. */
export const getMembershipByOrgAndUser = internalQuery({
  args: {
    organizationId: v.id('organizations'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', args.userId)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first()
  },
})

type JoinPreviewResult = {
  name: string
  logoUrl?: string
  alreadyMember: boolean
  organizationExternalId: string
}

/**
 * Preview join: validate token and return org name + logo for confirmation screen.
 * Requires auth so we can return alreadyMember. Action (not mutation) because it calls verifyJoinToken.
 */
export const getJoinPreview = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<JoinPreviewResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const { clerkOrgId } = await ctx.runAction(internal.joinGymNode.verifyJoinToken, {
      token: args.token,
    })

    const org = await ctx.runQuery(internal.joinGym.getOrgByExternalId, {
      externalId: clerkOrgId,
    })

    if (!org) {
      throw new Error('Gym not found')
    }

    const orgDoc = await ctx.runQuery(internal.joinGym.getOrgDocByExternalId, {
      externalId: clerkOrgId,
    })
    const membership = orgDoc
      ? await ctx.runQuery(internal.joinGym.getMembershipByOrgAndUser, {
          organizationId: orgDoc._id,
          userId: identity.subject,
        })
      : null

    return {
      name: org.name,
      logoUrl: org.logoUrl ?? undefined,
      alreadyMember: membership != null,
      organizationExternalId: clerkOrgId,
    }
  },
})

type JoinGymResult = {
  success: boolean
  organizationExternalId: string
  organizationName: string
  pending: boolean
  message: string
}

/** Internal: db logic for join by token. */
export const joinGymByTokenInternal = internalMutation({
  args: { clerkOrgId: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<JoinGymResult> => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.clerkOrgId))
      .first()

    if (!org) {
      throw new Error('Gym not found')
    }

    const alreadyMember = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', org._id).eq('userId', args.userId)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first()

    if (alreadyMember) {
      return {
        success: true,
        organizationExternalId: args.clerkOrgId,
        organizationName: org.name,
        pending: false,
        message: 'already_member',
      }
    }

    const existingPending = await ctx.db
      .query('organizationJoinRequests')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', org._id).eq('userId', args.userId)
      )
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .first()

    if (existingPending) {
      return {
        success: true,
        organizationExternalId: args.clerkOrgId,
        organizationName: org.name,
        pending: true,
        message: 'request_pending',
      }
    }

    const now = Date.now()
    await ctx.db.insert('organizationJoinRequests', {
      organizationId: org._id,
      userId: args.userId,
      status: 'pending',
      requestedAt: now,
      source: 'qr',
    })

    return {
      success: true,
      organizationExternalId: args.clerkOrgId,
      organizationName: org.name,
      pending: true,
      message: 'request_submitted',
    }
  },
})

/**
 * Join gym by token: verify, then create a pending join request.
 * Action (not mutation) because it calls verifyJoinToken.
 */
export const joinGymByToken = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<JoinGymResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const { clerkOrgId } = await ctx.runAction(internal.joinGymNode.verifyJoinToken, {
      token: args.token,
    })

    return await ctx.runMutation(internal.joinGym.joinGymByTokenInternal, {
      clerkOrgId,
      userId: identity.subject,
    })
  },
})

/**
 * List pending join requests for the current org. Admin or trainer only; returns [] for others.
 */
export const listPendingJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    const isStaff = membership.role === 'admin' || membership.role === 'trainer'
    if (!isStaff) return []

    const requests = await ctx.db
      .query('organizationJoinRequests')
      .withIndex('by_organization_status', (q) =>
        q.eq('organizationId', membership.organizationId).eq('status', 'pending')
      )
      .collect()

    requests.sort((a, b) => b.requestedAt - a.requestedAt)

    const withUsers = await Promise.all(
      requests.map(async (req) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_externalId', (q) => q.eq('externalId', req.userId))
          .first()
        return {
          _id: req._id,
          userId: req.userId,
          status: req.status,
          requestedAt: req.requestedAt,
          source: req.source,
          fullName:
            user?.fullName ??
            ([user?.firstName, user?.lastName].filter(Boolean).join(' ') || null),
          email: user?.email ?? null,
          imageUrl: user?.imageUrl ?? null,
        }
      })
    )

    return withUsers
  },
})

/** Internal: get request and org for approval validation. */
export const getRequestAndOrg = internalQuery({
  args: { requestId: v.id('organizationJoinRequests') },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== 'pending') return null
    const org = await ctx.db.get(request.organizationId)
    if (!org) return null
    return { request, org }
  },
})

/** Internal: mark request as approved. */
export const markRequestApproved = internalMutation({
  args: {
    requestId: v.id('organizationJoinRequests'),
    resolvedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: 'approved',
      resolvedAt: Date.now(),
      resolvedBy: args.resolvedBy,
    })
  },
})

/**
 * Approve a join request: create Clerk membership, then mark request approved.
 * Admin or trainer only. Action because it calls createClerkMembership.
 */
export const approveJoinRequest = action({
  args: { requestId: v.id('organizationJoinRequests') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const data = await ctx.runQuery(internal.joinGym.getRequestAndOrg, {
      requestId: args.requestId,
    })
    if (!data) {
      throw new Error('Request not found or no longer pending')
    }

    const membership = await ctx.runQuery(internal.joinGym.getMembershipByOrgAndUser, {
      organizationId: data.request.organizationId,
      userId: identity.subject,
    })
    if (!membership || (membership.role !== 'admin' && membership.role !== 'trainer')) {
      throw new Error('Access denied: admin or trainer required')
    }

    const result = await ctx.runAction(internal.joinGymNode.createClerkMembership, {
      clerkUserId: data.request.userId,
      clerkOrgId: data.org.externalId,
    })

    if (!result.ok) {
      throw new Error(result.error ?? 'Could not add member to organization')
    }

    await ctx.runMutation(internal.joinGym.markRequestApproved, {
      requestId: args.requestId,
      resolvedBy: identity.subject,
    })

    return { success: true }
  },
})

/**
 * Reject a join request. Admin or trainer only.
 */
export const rejectJoinRequest = mutation({
  args: { requestId: v.id('organizationJoinRequests') },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const request = await ctx.db.get(args.requestId)
    if (!request) {
      throw new Error('Request not found')
    }
    if (request.organizationId !== membership.organizationId) {
      throw new Error('Request does not belong to this organization')
    }
    if (request.status !== 'pending') {
      throw new Error('Request is no longer pending')
    }

    const identity = await requireAuth(ctx)
    const now = Date.now()
    await ctx.db.patch(args.requestId, {
      status: 'rejected',
      resolvedAt: now,
      resolvedBy: identity.subject,
    })

    return { success: true }
  },
})


/**
 * HTTP GET /join/<token> — public join preview for web fallback (no auth).
 * Returns JSON { name, logoUrl } or 400/404. Used by Next.js join page.
 */
export const httpJoinPreview = httpAction(async (ctx, request) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const pathname = new URL(request.url).pathname
  const prefix = '/join/'
  if (!pathname.startsWith(prefix)) {
    return new Response('Not found', { status: 404 })
  }
  const token = pathname.slice(prefix.length).replace(/\/.*$/, '').trim()
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { clerkOrgId } = await ctx.runAction(internal.joinGymNode.verifyJoinToken, {
      token,
    })
    const org = await ctx.runQuery(internal.joinGym.getOrgByExternalId, {
      externalId: clerkOrgId,
    })
    if (!org) {
      return new Response(
        JSON.stringify({ error: 'Gym not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(JSON.stringify({ name: org.name, logoUrl: org.logoUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid token'
    const status = message.includes('expired') ? 410 : 400
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
