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

  // Exercises - Exercise library per organization
  exercises: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // Upper Body, Lower Body, Core, Cardio, etc.
    muscleGroups: v.array(v.string()), // e.g., ["chest", "triceps"]
    equipment: v.optional(v.string()), // Barbell, Dumbbell, Machine, Bodyweight, etc.
    videoUrl: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_category', ['category'])
    .index('by_organization_category', ['organizationId', 'category']),

  // Folders - Tree structure for organizing planifications
  folders: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    parentId: v.optional(v.id('folders')), // null for root folders
    path: v.string(), // Computed path for breadcrumbs (e.g., "Beginners/Week 1")
    order: v.number(), // Display order within parent
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_parent', ['parentId'])
    .index('by_organization_parent', ['organizationId', 'parentId']),

  // Planifications - Workout programs/templates
  planifications: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')), // null for root level
    isTemplate: v.boolean(), // true if it's a reusable template
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_folder', ['folderId'])
    .index('by_created_by', ['createdBy'])
    .index('by_organization_folder', ['organizationId', 'folderId']),

  // Workout Days - Days within a planification
  workoutDays: defineTable({
    planificationId: v.id('planifications'),
    name: v.string(), // Flexible: "Day 1", "Legs", "Upper Body", etc.
    order: v.number(), // Display order
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planification', ['planificationId'])
    .index('by_planification_order', ['planificationId', 'order']),

  // Day Exercises - Exercises in a workout day
  dayExercises: defineTable({
    workoutDayId: v.id('workoutDays'),
    exerciseId: v.id('exercises'),
    order: v.number(), // Display order in the day
    sets: v.number(),
    reps: v.string(), // Can be "10", "10-12", "AMRAP", etc.
    weight: v.optional(v.string()), // e.g., "50kg", "BW", "25lb"
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workout_day', ['workoutDayId'])
    .index('by_exercise', ['exerciseId'])
    .index('by_workout_day_order', ['workoutDayId', 'order']),

  // Planification Assignments - Assign planifications to members
  planificationAssignments: defineTable({
    planificationId: v.id('planifications'),
    userId: v.string(), // Clerk user ID of the member
    organizationId: v.id('organizations'),
    assignedBy: v.string(), // Clerk user ID of admin/trainer
    status: v.union(
      v.literal('active'),
      v.literal('completed'),
      v.literal('cancelled')
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planification', ['planificationId'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId'])
    .index('by_user_status', ['userId', 'status']),
})
