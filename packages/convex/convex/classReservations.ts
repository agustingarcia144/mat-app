import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAuth, requireAdminOrTrainer } from './permissions'

/**
 * Reserve a spot in a class
 */
export const reserve = mutation({
  args: {
    scheduleId: v.id('classSchedules'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    // Check if schedule is cancelled
    if (schedule.status === 'cancelled') {
      throw new Error('This class has been cancelled')
    }

    // Check if schedule is in the past
    if (schedule.status === 'completed') {
      throw new Error('This class has already been completed')
    }

    // Get class template for booking window
    const classTemplate = await ctx.db.get(schedule.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    // Check booking window
    const now = Date.now()
    const bookingWindowMs =
      classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000
    const earliestBookingTime = schedule.startTime - bookingWindowMs

    if (now < earliestBookingTime) {
      throw new Error(
        `Booking opens ${classTemplate.bookingWindowDays} days before the class`
      )
    }

    if (now >= schedule.startTime) {
      throw new Error('Cannot book a class that has already started')
    }

    // Check for duplicate reservation
    const existing = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', args.scheduleId))
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), identity.subject),
          q.neq(q.field('status'), 'cancelled')
        )
      )
      .first()

    if (existing) {
      throw new Error('You have already reserved this class')
    }

    // Re-fetch schedule to avoid TOCTOU race condition
    const currentSchedule = await ctx.db.get(args.scheduleId)
    if (!currentSchedule) {
      throw new Error('Schedule not found')
    }

    // Check capacity again with latest data
    if (currentSchedule.currentReservations >= currentSchedule.capacity) {
      throw new Error('This class is full')
    }

    // Create reservation
    const reservationId = await ctx.db.insert('classReservations', {
      scheduleId: args.scheduleId,
      classId: currentSchedule.classId,
      organizationId: currentSchedule.organizationId,
      userId: identity.subject,
      status: 'confirmed',
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })

    // Increment reservation count atomically
    await ctx.db.patch(args.scheduleId, {
      currentReservations: currentSchedule.currentReservations + 1,
      updatedAt: now,
    })

    return reservationId
  },
})

/**
 * Cancel a reservation
 */
export const cancel = mutation({
  args: {
    id: v.id('classReservations'),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const reservation = await ctx.db.get(args.id)
    if (!reservation) {
      throw new Error('Reservation not found')
    }

    // Check if user owns this reservation
    if (reservation.userId !== identity.subject) {
      // Check if user is admin/trainer who can cancel for others
      const isStaff = await requireAdminOrTrainer(
        ctx,
        reservation.organizationId
      ).catch(() => false)
      if (!isStaff) {
        throw new Error('You can only cancel your own reservations')
      }
    }

    // Check if already cancelled
    if (reservation.status === 'cancelled') {
      throw new Error('This reservation is already cancelled')
    }

    // Get schedule and class for cancellation window check
    const schedule = await ctx.db.get(reservation.scheduleId)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    const classTemplate = await ctx.db.get(reservation.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    // Check cancellation window (only for regular members)
    if (reservation.userId === identity.subject) {
      const now = Date.now()
      const cancellationWindowMs =
        classTemplate.cancellationWindowHours * 60 * 60 * 1000
      const latestCancellationTime = schedule.startTime - cancellationWindowMs

      if (now > latestCancellationTime) {
        throw new Error(
          `Cancellations must be made at least ${classTemplate.cancellationWindowHours} hours before the class`
        )
      }
    }

    const now = Date.now()

    // Update reservation status
    await ctx.db.patch(args.id, {
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
    })

    // Decrement reservation count
    await ctx.db.patch(reservation.scheduleId, {
      currentReservations: Math.max(0, schedule.currentReservations - 1),
      updatedAt: now,
    })
  },
})

/**
 * Check in a member (admin/trainer only)
 */
export const checkIn = mutation({
  args: {
    id: v.id('classReservations'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const reservation = await ctx.db.get(args.id)
    if (!reservation) {
      throw new Error('Reservation not found')
    }

    await requireAdminOrTrainer(ctx, reservation.organizationId)

    if (reservation.status !== 'confirmed') {
      throw new Error('Can only check in confirmed reservations')
    }

    const now = Date.now()

    await ctx.db.patch(args.id, {
      status: 'attended',
      checkedInAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Mark a member as no-show (admin/trainer only)
 */
export const markNoShow = mutation({
  args: {
    id: v.id('classReservations'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const reservation = await ctx.db.get(args.id)
    if (!reservation) {
      throw new Error('Reservation not found')
    }

    await requireAdminOrTrainer(ctx, reservation.organizationId)

    if (reservation.status !== 'confirmed') {
      throw new Error('Can only mark confirmed reservations as no-show')
    }

    await ctx.db.patch(args.id, {
      status: 'no_show',
      updatedAt: Date.now(),
    })
  },
})

/**
 * Get all reservations for a schedule
 */
export const getBySchedule = query({
  args: {
    scheduleId: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Get the schedule to check organization
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    // Check if user is authorized (admin/trainer or member of org)
    await requireAdminOrTrainer(ctx, schedule.organizationId).catch(
      async () => {
        // If not admin/trainer, verify user is a member of the organization
        const membership = await ctx.db
          .query('organizationMemberships')
          .withIndex('by_organization_user', (q) =>
            q
              .eq('organizationId', schedule.organizationId)
              .eq('userId', identity.subject)
          )
          .first()

        if (!membership) {
          throw new Error('Access denied')
        }
      }
    )

    return await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', args.scheduleId))
      .collect()
  },
})

/**
 * Get reservations for a schedule with user details (admin/trainer only)
 */
export const getByScheduleWithUsers = query({
  args: {
    scheduleId: v.id('classSchedules'),
    statusFilter: v.optional(
      v.union(
        v.literal('confirmed'),
        v.literal('cancelled'),
        v.literal('attended'),
        v.literal('no_show')
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Get the schedule to check organization
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    // Only admin/trainer can access user details
    await requireAdminOrTrainer(ctx, schedule.organizationId)

    let reservations = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', args.scheduleId))
      .collect()

    // Filter by status if provided
    if (args.statusFilter) {
      reservations = reservations.filter((r) => r.status === args.statusFilter)
    }

    // Enrich with minimal user data (not full PII)
    const enrichedReservations = await Promise.all(
      reservations.map(async (reservation) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_externalId', (q) =>
            q.eq('externalId', reservation.userId)
          )
          .first()

        return {
          ...reservation,
          user: user
            ? {
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                email: user.email,
                imageUrl: user.imageUrl,
              }
            : null,
        }
      })
    )

    return enrichedReservations
  },
})

/**
 * Get all reservations for a user
 */
export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    // Always use the authenticated user's ID
    const userId = identity.subject

    return await ctx.db
      .query('classReservations')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
  },
})

/**
 * Get upcoming reservations for a user
 */
export const getUpcomingByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    // Always use the authenticated user's ID
    const userId = identity.subject
    const now = Date.now()

    // Get user's confirmed reservations
    const reservations = await ctx.db
      .query('classReservations')
      .withIndex('by_user_status', (q) =>
        q.eq('userId', userId).eq('status', 'confirmed')
      )
      .collect()

    // Enrich with schedule data and filter to upcoming
    const upcomingReservations = await Promise.all(
      reservations.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId)
        const classTemplate = await ctx.db.get(reservation.classId)
        
        return {
          ...reservation,
          schedule,
          class: classTemplate,
        }
      })
    )

    // Filter to upcoming and sort by start time
    return upcomingReservations
      .filter((r) => r.schedule && r.schedule.startTime > now)
      .sort((a, b) => (a.schedule?.startTime ?? 0) - (b.schedule?.startTime ?? 0))
  },
})
