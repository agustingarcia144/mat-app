import { QueryCtx, MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/**
 * Get current user's role in the active organization
 */
async function getUserRole(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
): Promise<'admin' | 'trainer' | 'member' | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const membership = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_organization_user', (q) =>
      q.eq('organizationId', organizationId).eq('userId', identity.subject)
    )
    .first()

  return membership?.role ?? null
}

/**
 * Check if user is admin or trainer in the organization
 */
export async function isAdminOrTrainer(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId)
  return role === 'admin' || role === 'trainer'
}

/**
 * Check if user is admin in the organization
 */
export async function isAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId)
  return role === 'admin'
}

/**
 * Throw error if user is not admin or trainer
 */
export async function requireAdminOrTrainer(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>
) {
  const hasPermission = await isAdminOrTrainer(ctx, organizationId)
  if (!hasPermission) {
    throw new Error('Unauthorized: Admin or trainer role required')
  }
}

/**
 * Throw error if user is not authenticated
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity
}

/**
 * Get active organization for the current user
 */
export async function getActiveOrganization(
  ctx: QueryCtx | MutationCtx
): Promise<Id<'organizations'> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  // Get user's first active membership
  // In production, this should come from session/context
  const membership = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', identity.subject))
    .filter((q) => q.eq(q.field('status'), 'active'))
    .first()

  return membership?.organizationId ?? null
}
