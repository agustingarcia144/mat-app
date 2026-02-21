import { QueryCtx, MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

type Ctx = QueryCtx | MutationCtx
type AppRole = 'admin' | 'trainer' | 'member'
export type OrgErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'ORG_REQUIRED'
  | 'ORG_FORBIDDEN'
  | 'ORG_NOT_SYNCED'

export class OrgAccessError extends Error {
  code: OrgErrorCode

  constructor(code: OrgErrorCode, message: string) {
    super(message)
    this.name = 'OrgAccessError'
    this.code = code
  }
}

function extractActiveOrganizationExternalId(identity: Record<string, unknown>) {
  const candidate =
    identity.orgId ?? identity.org_id ?? identity.organizationId ?? null
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null
}

/**
 * Get current user's role in the active organization
 */
async function getUserRole(
  ctx: Ctx,
  organizationId: Id<'organizations'>
): Promise<AppRole | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const membership = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_organization_user', (q) =>
      q.eq('organizationId', organizationId).eq('userId', identity.subject)
    )
    .filter((q) => q.eq(q.field('status'), 'active'))
    .first()

  return membership?.role ?? null
}

/**
 * Require membership in a specific organization.
 */
export async function requireOrganizationMembership(
  ctx: Ctx,
  organizationId: Id<'organizations'>
): Promise<Doc<'organizationMemberships'>> {
  const identity = await requireAuth(ctx)
  const membership = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_organization_user', (q) =>
      q.eq('organizationId', organizationId).eq('userId', identity.subject)
    )
    .filter((q) => q.eq(q.field('status'), 'active'))
    .first()

  if (!membership) {
    throw new OrgAccessError(
      'ORG_FORBIDDEN',
      'Access denied: organization membership required'
    )
  }

  return membership
}

/**
 * Require an active org context for the current user.
 * Priority:
 * 1) Active Clerk org claim in the auth token (org_id/orgId/organizationId)
 * 2) User's persisted activeOrganizationExternalId in Convex
 * 3) Single active membership fallback
 */
export async function requireCurrentOrganizationMembership(
  ctx: Ctx
): Promise<Doc<'organizationMemberships'>> {
  const identity = await requireAuth(ctx)

  const memberships = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', identity.subject))
    .filter((q) => q.eq(q.field('status'), 'active'))
    .collect()

  if (memberships.length === 0) {
    throw new OrgAccessError(
      'ORG_FORBIDDEN',
      'User is not an active member of any organization'
    )
  }

  const identityExternalOrgId = extractActiveOrganizationExternalId(
    identity as unknown as Record<string, unknown>
  )

  const user = await ctx.db
    .query('users')
    .withIndex('by_externalId', (q) => q.eq('externalId', identity.subject))
    .first()

  const selectedExternalOrgId =
    identityExternalOrgId ?? user?.activeOrganizationExternalId ?? null

  if (selectedExternalOrgId) {
    const selectedOrg = await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) => q.eq('externalId', selectedExternalOrgId))
      .first()

    if (!selectedOrg) {
      throw new OrgAccessError(
        'ORG_NOT_SYNCED',
        'Selected organization is not synced in Convex'
      )
    }

    const membership = memberships.find((m) => m.organizationId === selectedOrg._id)
    if (!membership) {
      throw new OrgAccessError('ORG_FORBIDDEN', 'Access denied for selected organization')
    }
    return membership
  }

  if (memberships.length === 1) {
    return memberships[0]
  }

  throw new OrgAccessError(
    'ORG_REQUIRED',
    'Multiple organizations detected. Select an active organization first.'
  )
}

/**
 * Check if user is admin or trainer in the organization
 */
export async function isAdminOrTrainer(
  ctx: Ctx,
  organizationId: Id<'organizations'>
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId)
  return role === 'admin' || role === 'trainer'
}

/**
 * Check if user is admin in the organization
 */
export async function isAdmin(
  ctx: Ctx,
  organizationId: Id<'organizations'>
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId)
  return role === 'admin'
}

/**
 * Throw error if user is not admin or trainer
 */
export async function requireAdminOrTrainer(
  ctx: Ctx,
  organizationId: Id<'organizations'>
) {
  const membership = await requireOrganizationMembership(ctx, organizationId)
  if (membership.role !== 'admin' && membership.role !== 'trainer') {
    throw new Error('Unauthorized: Admin or trainer role required')
  }
}

/**
 * Throw error if user is not admin.
 */
export async function requireAdmin(ctx: Ctx, organizationId: Id<'organizations'>) {
  const membership = await requireOrganizationMembership(ctx, organizationId)
  if (membership.role !== 'admin') {
    throw new Error('Unauthorized: Admin role required')
  }
}

/**
 * Throw error if user is not authenticated
 */
export async function requireAuth(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new OrgAccessError('NOT_AUTHENTICATED', 'Not authenticated')
  }
  return identity
}

export async function requireActiveOrgContext(ctx: Ctx) {
  const identity = await requireAuth(ctx)
  const membership = await requireCurrentOrganizationMembership(ctx)
  return {
    identity,
    membership,
    organizationId: membership.organizationId,
  }
}

/**
 * Get active organization for the current user
 */
export async function getActiveOrganization(
  ctx: Ctx
): Promise<Id<'organizations'> | null> {
  try {
    const membership = await requireCurrentOrganizationMembership(ctx)
    return membership.organizationId
  } catch {
    return null
  }
}
