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

  // Workout Weeks - Weeks within a planification
  workoutWeeks: defineTable({
    planificationId: v.id('planifications'),
    name: v.string(), // e.g., "Semana 1", "Semana 2"
    order: v.number(), // Display order
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planification', ['planificationId'])
    .index('by_planification_order', ['planificationId', 'order']),

  // Workout Days - Days within a workout week
  workoutDays: defineTable({
    weekId: v.id('workoutWeeks'),
    planificationId: v.id('planifications'), // Keep for easier queries
    name: v.string(), // Flexible: "Day 1", "Legs", "Upper Body", etc.
    order: v.number(), // Display order within the week
    // ISO weekday: 1 = Monday (Lunes) … 7 = Sunday (Domingo). Omit = not scheduled to a specific day.
    dayOfWeek: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_week', ['weekId'])
    .index('by_planification', ['planificationId'])
    .index('by_week_order', ['weekId', 'order'])
    .index('by_planification_order', ['planificationId', 'order']),

  // Exercise Blocks - Groups of exercises within a workout day
  exerciseBlocks: defineTable({
    workoutDayId: v.id('workoutDays'),
    name: v.string(), // e.g., "Warm-up", "Main", "Cool-down"
    order: v.number(), // Display order within the day
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workout_day', ['workoutDayId'])
    .index('by_workout_day_order', ['workoutDayId', 'order']),

  // Day Exercises - Exercises in a workout day
  dayExercises: defineTable({
    workoutDayId: v.id('workoutDays'),
    exerciseId: v.id('exercises'),
    blockId: v.optional(v.id('exerciseBlocks')), // Optional: exercise can belong to a block
    order: v.number(), // Display order within the block (or day if no block)
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
    .index('by_workout_day_order', ['workoutDayId', 'order'])
    .index('by_block', ['blockId'])
    .index('by_block_order', ['blockId', 'order']),

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

  // Workout Day Sessions - Member completion per workout day per date
  workoutDaySessions: defineTable({
    assignmentId: v.id('planificationAssignments'),
    planificationId: v.id('planifications'),
    workoutDayId: v.id('workoutDays'),
    userId: v.string(), // Clerk user ID
    organizationId: v.id('organizations'),
    performedOn: v.string(), // Local date YYYY-MM-DD
    status: v.union(
      v.literal('started'),
      v.literal('completed'),
      v.literal('skipped')
    ),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_performedOn', ['userId', 'performedOn'])
    .index('by_assignment', ['assignmentId'])
    .index('by_assignment_workoutDay_performedOn', [
      'assignmentId',
      'workoutDayId',
      'performedOn',
    ]),

  // Session Exercise Logs - What the user actually did per exercise per session
  sessionExerciseLogs: defineTable({
    sessionId: v.id('workoutDaySessions'),
    dayExerciseId: v.id('dayExercises'),
    sets: v.number(),
    reps: v.string(),
    weight: v.optional(v.string()),
    order: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_session_dayExercise', ['sessionId', 'dayExerciseId']),

  // Classes - Class templates and configurations
  classes: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(), // "Yoga Avanzado", "Acceso Gimnasio", etc.
    description: v.optional(v.string()),
    capacity: v.number(), // Max attendees
    trainerId: v.optional(v.string()), // Clerk user ID (optional)
    // Recurring configuration
    isRecurring: v.boolean(),
    recurrencePattern: v.optional(
      v.object({
        frequency: v.union(
          v.literal('hourly'),
          v.literal('daily'),
          v.literal('weekly'),
          v.literal('monthly')
        ),
        interval: v.number(), // Every X hours/days/weeks
        daysOfWeek: v.optional(v.array(v.number())), // 0-6 for weekly
        endDate: v.optional(v.number()), // Timestamp
      })
    ),
    // Booking settings
    bookingWindowDays: v.number(), // Default: 7
    cancellationWindowHours: v.number(), // Default: 2
    // Status
    isActive: v.boolean(),
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_active', ['organizationId', 'isActive'])
    .index('by_trainer', ['trainerId']),

  // Class Schedules - Individual class occurrences
  classSchedules: defineTable({
    classId: v.id('classes'),
    organizationId: v.id('organizations'), // Denormalized for queries
    startTime: v.number(), // Timestamp
    endTime: v.number(), // Timestamp
    capacity: v.number(), // Can override class capacity
    // currentReservations is a denormalized counter that must be updated atomically
    // with classReservations changes. The reserve/cancel mutations re-fetch the schedule
    // immediately before updating to minimize TOCTOU races. A periodic reconciliation
    // job should be added to correct any drift.
    currentReservations: v.number(), // Count for quick checks
    status: v.union(
      v.literal('scheduled'),
      v.literal('cancelled'),
      v.literal('completed')
    ),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_class', ['classId'])
    .index('by_organization', ['organizationId'])
    .index('by_organization_time', ['organizationId', 'startTime'])
    .index('by_start_time', ['startTime']),

  // Class Reservations - Member bookings
  classReservations: defineTable({
    scheduleId: v.id('classSchedules'),
    classId: v.id('classes'), // Denormalized
    organizationId: v.id('organizations'), // Denormalized
    userId: v.string(), // Clerk user ID
    status: v.union(
      v.literal('confirmed'),
      v.literal('cancelled'),
      v.literal('attended'),
      v.literal('no_show')
    ),
    cancelledAt: v.optional(v.number()),
    checkedInAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_schedule', ['scheduleId'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_schedule_status', ['scheduleId', 'status']),
})
