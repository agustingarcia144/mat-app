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
    height: v.optional(v.number()), // cm
    weight: v.optional(v.number()), // kg
    // Onboarding tracking
    onboardingStep1Completed: v.optional(v.boolean()),
    onboardingCompleted: v.optional(v.boolean()),
    // Selected org context for multi-org users.
    activeOrganizationId: v.optional(v.id('organizations')),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_externalId', ['externalId'])
    .index('by_email', ['email']),

  // Organizations table - stores gym data
  organizations: defineTable({
    // Basic fields
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    // IANA timezone for class times (e.g. "America/Argentina/Buenos_Aires").
    // Used when matching fixed slots to schedules; if unset, UTC is used.
    timezone: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  // Organization memberships - links users to gyms with roles.
  organizationMemberships: defineTable({
    organizationId: v.id('organizations'),
    // Auth user id (not a users-table reference to keep flexibility)
    userId: v.string(),
    description: v.optional(v.string()),
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

  // Join requests (QR/deep link): user requested to join org; admin/trainer approves or rejects.
  organizationJoinRequests: defineTable({
    organizationId: v.id('organizations'),
    userId: v.string(), // Clerk user ID
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected')
    ),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()), // Clerk user ID of admin/trainer who resolved
    source: v.optional(v.string()), // e.g. 'qr'
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_status', ['organizationId', 'status'])
    .index('by_organization_user', ['organizationId', 'userId']),

  // Organization invitations managed inside Convex (replaces Clerk invitations).
  organizationInvitations: defineTable({
    organizationId: v.id('organizations'),
    email: v.string(),
    role: v.union(v.literal('admin'), v.literal('trainer')),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('revoked')
    ),
    invitedBy: v.string(),
    tokenHash: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_status', ['organizationId', 'status'])
    .index('by_organization_email', ['organizationId', 'email'])
    .index('by_token_hash', ['tokenHash']),

  // Internal invite codes used to bootstrap brand-new organizations.
  // This is separate from member join links/tokens.
  organizationCreationInviteCodes: defineTable({
    codeHash: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('consumed'),
      v.literal('revoked')
    ),
    expiresAt: v.optional(v.number()),
    maxUses: v.number(),
    usedCount: v.number(),
    consumedAt: v.optional(v.number()),
    consumedByUserId: v.optional(v.string()),
    consumedOrganizationId: v.optional(v.id('organizations')),
    createdBy: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_codeHash', ['codeHash'])
    .index('by_status', ['status']),

  // Persistent member invite code per organization (manual fallback for join flow).
  organizationMemberInviteCodes: defineTable({
    organizationId: v.id('organizations'),
    code: v.string(),
    codeHash: v.string(),
    joinToken: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdBy: v.string(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_codeHash', ['codeHash'])
    .index('by_status', ['status']),

  // Clerk webhook processing ledger for idempotency, replay defense, and auditing.
  webhookEvents: defineTable({
    svixId: v.string(),
    svixTimestamp: v.number(),
    eventType: v.string(),
    objectId: v.optional(v.string()),
    status: v.union(
      v.literal('processing'),
      v.literal('processed'),
      v.literal('failed')
    ),
    attempts: v.number(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_svixId', ['svixId'])
    .index('by_status', ['status'])
    .index('by_eventType', ['eventType']),

  // Exercises - Exercise library per organization
  exercises: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // Upper Body, Lower Body, Core, Cardio, etc.
    muscleGroups: v.array(v.string()), // e.g., ["chest", "triceps"]
    equipment: v.optional(v.string()), // Barbell, Dumbbell, Machine, Bodyweight, etc.
    videoUrl: v.optional(v.string()),
    isStandard: v.optional(v.boolean()), // true = platform default, users cannot edit or remove
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
    currentRevisionId: v.optional(v.id('planificationRevisions')),
    hasEverBeenAssigned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_folder', ['folderId'])
    .index('by_created_by', ['createdBy'])
    .index('by_organization_folder', ['organizationId', 'folderId'])
    .index('by_organization_isTemplate', ['organizationId', 'isTemplate']),

  // Workout Weeks - Weeks within a planification
  planificationRevisions: defineTable({
    planificationId: v.id('planifications'),
    revisionNumber: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
    supersedesRevisionId: v.optional(v.id('planificationRevisions')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planification', ['planificationId'])
    .index('by_planification_revisionNumber', [
      'planificationId',
      'revisionNumber',
    ]),

  // Workout Weeks - Weeks within a planification
  workoutWeeks: defineTable({
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
    name: v.string(), // e.g., "Semana 1", "Semana 2"
    order: v.number(), // Display order
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planification', ['planificationId'])
    .index('by_planification_revision', ['planificationId', 'revisionId'])
    .index('by_planification_order', ['planificationId', 'order']),

  // Workout Days - Days within a workout week
  workoutDays: defineTable({
    weekId: v.id('workoutWeeks'),
    planificationId: v.id('planifications'), // Keep for easier queries
    revisionId: v.optional(v.id('planificationRevisions')),
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
    .index('by_planification_revision', ['planificationId', 'revisionId'])
    .index('by_week_order', ['weekId', 'order'])
    .index('by_planification_order', ['planificationId', 'order']),

  // Exercise Blocks - Groups of exercises within a workout day
  exerciseBlocks: defineTable({
    workoutDayId: v.id('workoutDays'),
    revisionId: v.optional(v.id('planificationRevisions')),
    name: v.string(), // e.g., "Warm-up", "Main", "Cool-down"
    order: v.number(), // Display order within the day
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workout_day', ['workoutDayId'])
    .index('by_revision', ['revisionId'])
    .index('by_workout_day_order', ['workoutDayId', 'order']),

  // Day Exercises - Exercises in a workout day
  dayExercises: defineTable({
    workoutDayId: v.id('workoutDays'),
    revisionId: v.optional(v.id('planificationRevisions')),
    exerciseId: v.id('exercises'),
    blockId: v.optional(v.id('exerciseBlocks')), // Optional: exercise can belong to a block
    order: v.number(), // Display order within the block (or day if no block)
    sets: v.number(),
    reps: v.optional(v.string()), // Can be "10", "10-12", "AMRAP", etc.
    weight: v.optional(v.string()), // e.g., "50kg", "BW", "25lb"
    prPercentage: v.optional(v.number()), // e.g., 80 means 80% of PR
    timeSeconds: v.optional(v.number()), // Time in seconds (e.g. plank duration)
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workout_day', ['workoutDayId'])
    .index('by_exercise', ['exerciseId'])
    .index('by_revision', ['revisionId'])
    .index('by_workout_day_order', ['workoutDayId', 'order'])
    .index('by_block', ['blockId'])
    .index('by_block_order', ['blockId', 'order']),

  // Planification Assignments - Assign planifications to members
  planificationAssignments: defineTable({
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
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
    .index('by_planification_revision', ['planificationId', 'revisionId'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId'])
    .index('by_user_status', ['userId', 'status']),

  // Workout Day Sessions - Member completion per workout day per date
  workoutDaySessions: defineTable({
    assignmentId: v.id('planificationAssignments'),
    planificationId: v.id('planifications'),
    revisionId: v.optional(v.id('planificationRevisions')),
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
    .index('by_user_assignment_performedOn', [
      'userId',
      'assignmentId',
      'performedOn',
    ])
    .index('by_assignment', ['assignmentId'])
    .index('by_assignment_revision', ['assignmentId', 'revisionId'])
    .index('by_assignment_workoutDay_performedOn', [
      'assignmentId',
      'workoutDayId',
      'performedOn',
    ]),

  // Session Exercise Logs - What the user actually did per exercise per session
  sessionExerciseLogs: defineTable({
    sessionId: v.id('workoutDaySessions'),
    dayExerciseId: v.id('dayExercises'),
    revisionId: v.optional(v.id('planificationRevisions')),
    sets: v.number(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    // Comma-separated per-set seconds, e.g. "30, 30, 45"
    timeSeconds: v.optional(v.string()),
    order: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_revision', ['revisionId'])
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

  // Schedule batches - generation runs for class schedules
  scheduleBatches: defineTable({
    organizationId: v.id('organizations'),
    classId: v.id('classes'),
    sourceType: v.union(v.literal('single'), v.literal('timeWindow')),
    status: v.union(
      v.literal('active'),
      v.literal('replaced')
    ),
    sourceConfig: v.union(
      v.object({
        mode: v.literal('single'),
        startTime: v.number(),
        endTime: v.number(),
        endDate: v.optional(v.number()),
        durationMinutes: v.number(),
      }),
      v.object({
        mode: v.literal('timeWindow'),
        rangeStartDate: v.number(),
        rangeEndDate: v.number(),
        timeWindowStartMinutes: v.number(),
        timeWindowEndMinutes: v.number(),
        slotIntervalMinutes: v.number(),
        durationMinutes: v.number(),
        daysOfWeek: v.optional(v.array(v.number())),
      })
    ),
    generatedCount: v.number(),
    firstStartTime: v.number(),
    lastEndTime: v.number(),
    createdBy: v.string(),
    duplicatedFromBatchId: v.optional(v.id('scheduleBatches')),
    replacedByBatchId: v.optional(v.id('scheduleBatches')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_status_created', [
      'organizationId',
      'status',
      'createdAt',
    ])
    .index('by_class', ['classId']),

  // Class Schedules - Individual class occurrences
  classSchedules: defineTable({
    classId: v.id('classes'),
    organizationId: v.id('organizations'), // Denormalized for queries
    batchId: v.optional(v.id('scheduleBatches')),
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
    .index('by_batch', ['batchId'])
    .index('by_class_time', ['classId', 'startTime'])
    .index('by_organization', ['organizationId'])
    .index('by_organization_time', ['organizationId', 'startTime'])
    .index('by_start_time', ['startTime'])
    .index('by_end_time', ['endTime']),

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

  // Fixed class slots - Members with a fixed weekly slot (class + day + time)
  // Auto-assigned to every matching class occurrence when schedules are created
  fixedClassSlots: defineTable({
    organizationId: v.id('organizations'),
    userId: v.string(), // Clerk user ID (member)
    classId: v.id('classes'),
    dayOfWeek: v.number(), // 0-6, Sunday = 0
    startTimeMinutes: v.number(), // 0-1439, e.g. 540 = 9:00
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_class_slot', [
      'organizationId',
      'classId',
      'dayOfWeek',
      'startTimeMinutes',
    ])
    .index('by_user', ['userId'])
    .index('by_organization_user', ['organizationId', 'userId']),

  // Model week slots - defines the recurring class schedule template (which classes run on which day/time).
  // This is the "ideal week" used for planning; separate from actual schedules and from member-specific
  // fixed slots (fixedClassSlots). Applying this template to a date range generates real classSchedules.
  modelWeekSlots: defineTable({
    organizationId: v.id('organizations'),
    classId: v.id('classes'),
    dayOfWeek: v.number(), // 0-6, Sunday = 0 (same convention as fixedClassSlots)
    startTimeMinutes: v.number(), // 0-1439, e.g. 540 = 09:00
    durationMinutes: v.number(), // Default 60
    capacity: v.optional(v.number()), // Overrides class capacity when set
    notes: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_class', ['organizationId', 'classId'])
    .index('by_organization_slot', [
      'organizationId',
      'classId',
      'dayOfWeek',
      'startTimeMinutes',
    ]),

  // Push tokens - stores Expo push tokens per user/device
  pushTokens: defineTable({
    userId: v.string(), // Clerk user ID
    token: v.string(), // Expo push token
    platform: v.union(v.literal('ios'), v.literal('android')),
    deviceId: v.optional(v.string()),
    active: v.boolean(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_token', ['token'])
    .index('by_user_active', ['userId', 'active']),

  // Notification events - idempotency + delivery status
  notificationEvents: defineTable({
    eventKey: v.string(),
    type: v.union(
      v.literal('class_cancelled'),
      v.literal('class_start_reminder'),
      v.literal('attendance_reminder')
    ),
    userId: v.string(),
    scheduleId: v.id('classSchedules'),
    status: v.union(
      v.literal('pending'),
      v.literal('sent'),
      v.literal('failed'),
      v.literal('skipped')
    ),
    attempts: v.number(),
    tokenCount: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_key', ['eventKey'])
    .index('by_user_created_at', ['userId', 'createdAt'])
    .index('by_status_created_at', ['status', 'createdAt']),
})
