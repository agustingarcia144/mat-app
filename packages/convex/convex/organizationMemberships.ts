import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth, requireCurrentOrganizationMembership } from './permissions'

/**
 * Upsert an organization membership from Clerk webhook data
 */
export const upsertFromClerk = internalMutation({
  args: {
    data: v.any(), // Clerk organizationMembership data from webhook
  },
  handler: async (ctx, args) => {
    const clerkMembership = args.data

    // Try multiple possible field names for organization ID
    const clerkOrgId =
      clerkMembership.organization_id ||
      clerkMembership.organization?.id ||
      clerkMembership.org_id

    // Try multiple possible field names for user ID
    const clerkUserId =
      clerkMembership.public_user_data?.user_id ||
      clerkMembership.user_id ||
      clerkMembership.user?.id ||
      clerkMembership.public_user_data?.id
    const clerkMembershipId =
      clerkMembership.id || clerkMembership.membership_id || undefined

    if (!clerkOrgId || !clerkUserId) {
      console.error('Missing IDs in webhook data:', {
        organization_id: clerkOrgId,
        user_id: clerkUserId,
        data_keys: Object.keys(clerkMembership),
        full_data: JSON.stringify(clerkMembership, null, 2),
      })
      throw new Error(
        `Missing organization ID or user ID in Clerk webhook data. Org ID: ${clerkOrgId}, User ID: ${clerkUserId}`
      )
    }

    // Find the organization by Clerk ID
    const organization = await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkOrgId))
      .first()

    if (!organization) {
      // Organization might not be synced yet - log and skip
      console.warn(
        `Organization ${clerkOrgId} not found when syncing membership`
      )
      return
    }

    // Map Clerk role to our role system
    // Clerk roles: "org:admin", "org:member", or custom roles
    // We map: "org:admin" -> "admin", custom trainer-like roles -> "trainer",
    // default -> "member".
    let role: 'admin' | 'trainer' | 'member' = 'member'
    const clerkRole = clerkMembership.role || ''

    if (
      clerkRole === 'org:admin' ||
      clerkRole.toLowerCase().includes('admin')
    ) {
      role = 'admin'
    } else if (
      clerkRole.toLowerCase().includes('trainer') ||
      clerkRole.toLowerCase().includes('instructor') ||
      clerkRole.toLowerCase().includes('teacher')
    ) {
      role = 'trainer'
    } else {
      role = 'member'
    }

    const existingByMembershipId = clerkMembershipId
      ? await ctx.db
          .query('organizationMemberships')
          .withIndex('by_externalMembershipId', (q) =>
            q.eq('externalMembershipId', clerkMembershipId)
          )
          .first()
      : null
    const existingByOrgUser = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', organization._id).eq('userId', clerkUserId)
      )
      .first()
    const existing = existingByMembershipId ?? existingByOrgUser

    const now = Date.now()
    const createdAt = clerkMembership.created_at
      ? new Date(clerkMembership.created_at).getTime()
      : now
    const updatedAt = clerkMembership.updated_at
      ? new Date(clerkMembership.updated_at).getTime()
      : now

    const status: 'active' | 'inactive' =
      clerkMembership?.status === 'inactive' ? 'inactive' : 'active'

    const membershipData = {
      externalMembershipId: clerkMembershipId,
      organizationId: organization._id,
      userId: clerkUserId,
      role,
      status,
      joinedAt: existing?.joinedAt || createdAt,
      lastActiveAt: updatedAt,
      createdAt: existing?.createdAt || createdAt,
      updatedAt,
    }

    if (existing) {
      // Update existing membership
      await ctx.db.patch(existing._id, membershipData)
      return existing._id
    } else {
      // Create new membership
      return await ctx.db.insert('organizationMemberships', membershipData)
    }
  },
})

/**
 * Delete an organization membership from Clerk webhook data.
 * Tries lookup by externalMembershipId first; if not found (e.g. never stored),
 * falls back to deleting by (orgId, userId) so the membership is always removed.
 */
export const deleteFromClerk = internalMutation({
  args: {
    clerkOrgId: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    clerkMembershipId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.clerkMembershipId) {
      const membership = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_externalMembershipId', (q) =>
          q.eq('externalMembershipId', args.clerkMembershipId)
        )
        .first()
      if (membership) {
        await ctx.db.delete(membership._id)
      }
    }

    if (args.clerkOrgId && args.clerkUserId) {
      const organization = await ctx.db
        .query('organizations')
        .withIndex('by_externalId', (q) => q.eq('externalId', args.clerkOrgId!))
        .first()

      if (organization) {
        const memberships = await ctx.db
          .query('organizationMemberships')
          .withIndex('by_organization_user', (q) =>
            q
              .eq('organizationId', organization._id)
              .eq('userId', args.clerkUserId!)
          )
          .collect()

        for (const membership of memberships) {
          await ctx.db.delete(membership._id)
        }
      }
    }
  },
})

/**
 * Get all memberships for the current user's organization
 * Returns all members of the organization the current user belongs to
 */
export const getOrganizationMemberships = query({
  handler: async (ctx) => {
    const currentMembership = await requireCurrentOrganizationMembership(ctx)
    const organizationId = currentMembership.organizationId

    // Get all memberships for this organization
    const allMemberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', organizationId)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .collect()

    // Fetch user data for each membership
    const membershipsWithUsers = await Promise.all(
      allMemberships.map(async (membership) => {
        // Find the user by Clerk ID (externalId)
        const user = await ctx.db
          .query('users')
          .withIndex('by_externalId', (q) =>
            q.eq('externalId', membership.userId)
          )
          .first()

        return {
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          joinedAt: membership.joinedAt,
          // Include user fields if user exists
          firstName: user?.firstName,
          lastName: user?.lastName,
          fullName: user?.fullName,
          email: user?.email,
          imageUrl: user?.imageUrl,
          username: user?.username,
        }
      })
    )

    return membershipsWithUsers
  },
})

export const getCurrentMembership = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireCurrentOrganizationMembership(ctx)
    } catch {
      return null
    }
  },
})

export const getMyOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const memberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .collect()

    const orgs = await Promise.all(
      memberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId)
        return {
          organizationId: membership.organizationId,
          organizationExternalId: organization?.externalId,
          organizationName: organization?.name,
          organizationSlug: organization?.slug,
          role: membership.role,
          status: membership.status,
        }
      })
    )

    return orgs.sort((a, b) =>
      (a.organizationName ?? '').localeCompare(b.organizationName ?? '')
    )
  },
})

export const setActiveOrganization = mutation({
  args: {
    organizationExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const organization = await ctx.db
      .query('organizations')
      .withIndex('by_externalId', (q) =>
        q.eq('externalId', args.organizationExternalId)
      )
      .first()
    if (!organization) {
      throw new Error('Organization not found')
    }

    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', organization._id).eq('userId', identity.subject)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first()

    if (!membership) {
      throw new Error('Access denied: not a member of this organization')
    }

    const now = Date.now()
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', identity.subject))
      .first()

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        activeOrganizationExternalId: args.organizationExternalId,
        updatedAt: now,
      })
      return true
    }

    await ctx.db.insert('users', {
      externalId: identity.subject,
      firstName: identity.givenName || undefined,
      lastName: identity.familyName || undefined,
      fullName: identity.name || undefined,
      email: identity.email || undefined,
      imageUrl: identity.pictureUrl || undefined,
      username: identity.nickname || undefined,
      onboardingCompleted: false,
      activeOrganizationExternalId: args.organizationExternalId,
      createdAt: now,
      updatedAt: now,
    })

    return true
  },
})
