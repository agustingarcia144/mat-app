import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

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
