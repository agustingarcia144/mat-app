import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // Users table - stores app-specific user data
  // Clerk is the source of truth for basic user info (name, email, etc.)
  users: defineTable({
    // Clerk user ID - used to link with Clerk
    externalId: v.string(),
    // Clerk user fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    // App-specific fields not stored in Clerk
    birthday: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Onboarding tracking
    onboardingCompleted: v.optional(v.boolean()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_externalId', ['externalId'])
    .index('by_email', ['email']),

  // Organizations table - stores gym data
  organizations: defineTable({
    // Clerk organization ID - used to link with Clerk
    externalId: v.string(),
    // Basic fields
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_externalId', ['externalId'])
    .index('by_slug', ['slug']),

  // Organization memberships - links users to gyms with roles
  // Note: A user can have multiple memberships in the same org with different roles
  // (e.g., admin + member, trainer + member)
  organizationMemberships: defineTable({
    organizationId: v.id('organizations'),
    // Clerk user ID (not a reference to users table to allow flexibility)
    userId: v.string(),
    role: v.union(
      v.literal('admin'),
      v.literal('trainer'),
      v.literal('member')
    ),
    status: v.union(v.literal('active'), v.literal('inactive')),
    joinedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_organization_user', ['organizationId', 'userId'])
    .index('by_organization_role', ['organizationId', 'role']),
})
