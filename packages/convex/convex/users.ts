import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireCurrentOrganizationMembership } from './permissions'

/**
 * Upsert a user from Clerk webhook data
 * This is an internal mutation (only callable from other Convex functions)
 */
export const upsertFromClerk = internalMutation({
  args: {
    data: v.any(), // Clerk user data from webhook
  },
  handler: async (ctx, args) => {
    const clerkUser = args.data
    const clerkUserId = clerkUser.id

    if (!clerkUserId) {
      throw new Error('Missing user ID in Clerk webhook data')
    }

    // Find existing user by Clerk ID
    const existing = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkUserId))
      .first()

    const now = Date.now()
    const createdAt = clerkUser.created_at
      ? new Date(clerkUser.created_at).getTime()
      : now
    const updatedAt = clerkUser.updated_at
      ? new Date(clerkUser.updated_at).getTime()
      : now

    // Get primary email from Clerk email_addresses array
    const primaryEmail =
      clerkUser.email_addresses?.find(
        (email: any) => email.id === clerkUser.primary_email_address_id
      )?.email_address ||
      clerkUser.email_addresses?.[0]?.email_address ||
      clerkUser.email_address ||
      undefined

    // Construct full name from first and last name, or use provided full name
    const firstName = clerkUser.first_name || clerkUser.first_name || undefined
    const lastName = clerkUser.last_name || clerkUser.last_name || undefined
    const fullName =
      clerkUser.full_name ||
      clerkUser.fullName ||
      (firstName && lastName ? `${firstName} ${lastName}`.trim() : undefined) ||
      firstName ||
      lastName ||
      undefined

    const userData = {
      externalId: clerkUserId,
      // Clerk user fields
      firstName,
      lastName,
      fullName,
      email: primaryEmail,
      imageUrl: clerkUser.image_url || clerkUser.imageUrl || undefined,
      username: clerkUser.username || undefined,
      // App-specific fields
      birthday: clerkUser.public_metadata?.birthday || undefined,
      createdAt: existing?.createdAt || createdAt,
      updatedAt,
    }

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, userData)
      return existing._id
    } else {
      // Create new user
      return await ctx.db.insert('users', userData)
    }
  },
})

/**
 * Delete a user from Clerk webhook data
 */
export const deleteFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.clerkUserId))
      .first()

    if (existing) {
      await ctx.db.delete(existing._id)
    }
  },
})

/**
 * Get or create current user on first sign in/sign up
 */
export const getOrCreateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new Error('Not authenticated')
    }

    const clerkUserId = identity.subject

    // Check if user already exists
    const existing = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkUserId))
      .first()

    if (existing) {
      return existing
    }

    // Create new user from Clerk identity
    const now = Date.now()
    const email = identity.email ?? undefined
    const firstName = identity.givenName || undefined
    const lastName = identity.familyName || undefined
    const fullName =
      identity.name ||
      (firstName && lastName ? `${firstName} ${lastName}`.trim() : undefined)

    const userId = await ctx.db.insert('users', {
      externalId: clerkUserId,
      firstName,
      lastName,
      fullName,
      email,
      imageUrl: identity.pictureUrl || undefined,
      username: identity.nickname || undefined,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    })

    return await ctx.db.get(userId)
  },
})

/**
 * Get current user
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    const clerkUserId = identity.subject

    return await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkUserId))
      .first()
  },
})

/**
 * Internal helper for migrations: list users ordered by Clerk externalId.
 */
export const listExternalIdsBatch = internalQuery({
  args: {
    afterExternalId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const users =
      args.afterExternalId === undefined
        ? await ctx.db.query('users').withIndex('by_externalId').take(args.limit)
        : await ctx.db
            .query('users')
            .withIndex('by_externalId', (q) =>
              q.gt('externalId', args.afterExternalId!)
            )
            .take(args.limit)

    return users.map((user) => ({
      id: user._id,
      externalId: user.externalId,
    }))
  },
})

/**
 * Complete onboarding step 1 (birthday, phone). Does not set onboardingCompleted;
 * user is sent to onboarding-2 next.
 */
export const completeOnboarding = mutation({
  args: {
    birthday: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new Error('Not authenticated')
    }

    const clerkUserId = identity.subject

    const user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkUserId))
      .first()

    if (!user) {
      throw new Error('User not found')
    }

    await ctx.db.patch(user._id, {
      birthday: args.birthday,
      phone: args.phone,
      onboardingStep1Completed: true,
      updatedAt: Date.now(),
    })

    return await ctx.db.get(user._id)
  },
})

/**
 * Complete onboarding step 2 (height, weight, membership description) and mark onboarding done.
 */
export const completeOnboarding2 = mutation({
  args: {
    height: v.optional(v.number()),
    weight: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new Error('Not authenticated')
    }

    const clerkUserId = identity.subject
    const now = Date.now()

    const user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', clerkUserId))
      .first()

    if (!user) {
      throw new Error('User not found')
    }

    await ctx.db.patch(user._id, {
      height: args.height,
      weight: args.weight,
      onboardingCompleted: true,
      updatedAt: now,
    })

    try {
      const membership = await requireCurrentOrganizationMembership(ctx)
      await ctx.db.patch(membership._id, {
        description: args.description,
        updatedAt: now,
      })
    } catch {
      // No active org or membership — skip membership description
    }

    return await ctx.db.get(user._id)
  },
})
