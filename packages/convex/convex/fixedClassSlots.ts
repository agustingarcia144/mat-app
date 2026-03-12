import { mutation, query, type MutationCtx } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
} from './permissions'

/**
 * Create a fixed slot for a member (admin/trainer only).
 * The member will be auto-assigned to every class schedule that matches
 * (same class, day of week, time of day).
 */
export const create = mutation({
  args: {
    userId: v.string(),
    classId: v.id('classes'),
    dayOfWeek: v.number(), // 0-6, Sunday = 0
    startTimeMinutes: v.number(), // 0-1439, e.g. 540 = 9:00
    /** IANA timezone from the browser (e.g. "America/Argentina/Buenos_Aires"). If provided and org has no timezone set, we set it so fixed-slot matching uses the same zone. */
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    // If the frontend sent a timezone and the org doesn't have one set, set it so schedule matching uses the same zone
    if (args.timezone && args.timezone.trim() !== '') {
      const org = await ctx.db.get(classTemplate.organizationId)
      if (org && (org.timezone === undefined || org.timezone.trim() === '')) {
        await ctx.db.patch(classTemplate.organizationId, {
          timezone: args.timezone.trim(),
          updatedAt: Date.now(),
        })
      }
    }

    if (args.dayOfWeek < 0 || args.dayOfWeek > 6) {
      throw new Error('dayOfWeek must be 0-6')
    }
    if (args.startTimeMinutes < 0 || args.startTimeMinutes > 1439) {
      throw new Error('startTimeMinutes must be 0-1439')
    }

    const membership = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_organization_user', (q) =>
        q
          .eq('organizationId', classTemplate.organizationId)
          .eq('userId', args.userId)
      )
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first()

    if (!membership) {
      throw new Error('User is not an active member of this organization')
    }
    if (membership.role !== 'member') {
      throw new Error('Fixed slots can only be assigned to members')
    }

    const duplicate = await ctx.db
      .query('fixedClassSlots')
      .withIndex('by_organization_class_slot', (q) =>
        q
          .eq('organizationId', classTemplate.organizationId)
          .eq('classId', args.classId)
          .eq('dayOfWeek', args.dayOfWeek)
          .eq('startTimeMinutes', args.startTimeMinutes)
      )
      .filter((q) => q.eq(q.field('userId'), args.userId))
      .first()

    if (duplicate) {
      throw new Error('This member already has a fixed slot for this class, day and time')
    }

    const now = Date.now()
    const fixedSlotId = await ctx.db.insert('fixedClassSlots', {
      organizationId: classTemplate.organizationId,
      userId: args.userId,
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
      startTimeMinutes: args.startTimeMinutes,
      createdAt: now,
      updatedAt: now,
    })

    // Backfill: assign this member to existing matching schedules (e.g. schedules
    // that were created before this fixed slot existed).
    await assignFixedSlotToMatchingSchedules(ctx, {
      organizationId: classTemplate.organizationId,
      userId: args.userId,
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
      startTimeMinutes: args.startTimeMinutes,
    })

    return fixedSlotId
  },
})

/**
 * Backfill: assign all fixed-slot members to existing matching schedules.
 * Use when schedules were created before fixed slots existed, or after fixing timezone.
 * If the org has no timezone set, pass timezone from the frontend (browser) so we set it first.
 * Admin/trainer only.
 */
export const backfillToExistingSchedules = mutation({
  args: {
    /** IANA timezone from the browser; if org has no timezone, we set it so matching works. */
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    if (args.timezone && args.timezone.trim() !== '') {
      const org = await ctx.db.get(membership.organizationId)
      if (org && (org.timezone === undefined || org.timezone.trim() === '')) {
        await ctx.db.patch(membership.organizationId, {
          timezone: args.timezone.trim(),
          updatedAt: Date.now(),
        })
      }
    }

    const slots = await ctx.db
      .query('fixedClassSlots')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    for (const slot of slots) {
      await assignFixedSlotToMatchingSchedules(ctx, {
        organizationId: slot.organizationId,
        userId: slot.userId,
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        startTimeMinutes: slot.startTimeMinutes,
      })
    }

    return { processedSlots: slots.length }
  },
})

/**
 * Remove a fixed slot (admin/trainer only).
 * Also cancels this member's reservations on all matching schedules (same class, day, time)
 * so the member is removed from those schedules.
 */
export const remove = mutation({
  args: {
    id: v.id('fixedClassSlots'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const slot = await ctx.db.get(args.id)
    if (!slot) {
      throw new Error('Fixed slot not found')
    }

    await requireAdminOrTrainer(ctx, slot.organizationId)

    await removeMemberFromMatchingSchedules(ctx, {
      organizationId: slot.organizationId,
      userId: slot.userId,
      classId: slot.classId,
      dayOfWeek: slot.dayOfWeek,
      startTimeMinutes: slot.startTimeMinutes,
    })

    await ctx.db.delete(args.id)
  },
})

/**
 * List fixed slots for a user (for member detail or mobile).
 * Caller must be the user themselves or admin/trainer in the same org.
 */
export const listByUser = query({
  args: {
    userId: v.string(),
    organizationExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const membership = await requireCurrentOrganizationMembership(ctx)
    const organizationId = membership.organizationId
    if (args.organizationExternalId) {
      const activeOrganization = await ctx.db.get(organizationId)
      if (
        !activeOrganization ||
        activeOrganization.externalId !== args.organizationExternalId
      ) {
        // Stale client org context (e.g. fast org switch); avoid leaking data.
        return []
      }
    }

    if (args.userId !== identity.subject) {
      const canViewOthers = membership.role === 'admin' || membership.role === 'trainer'
      if (!canViewOthers) {
        // Avoid surfacing authorization errors in the UI; just hide others' data.
        return []
      }
    } else {
      await requireOrganizationMembership(ctx, organizationId)
    }

    const slots = await ctx.db
      .query('fixedClassSlots')
      .withIndex('by_organization_user', (q) =>
        q.eq('organizationId', organizationId).eq('userId', args.userId)
      )
      .collect()

    const withClass = await Promise.all(
      slots.map(async (slot) => {
        const classTemplate = await ctx.db.get(slot.classId)
        return {
          ...slot,
          className: classTemplate?.name ?? null,
        }
      })
    )

    return withClass
  },
})

/**
 * List all fixed slots in the org, optionally filtered by class (admin/trainer).
 */
export const listByOrganizationAndClass = query({
  args: {
    classId: v.optional(v.id('classes')),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    let slots = await ctx.db
      .query('fixedClassSlots')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    if (args.classId) {
      slots = slots.filter((s) => s.classId === args.classId)
    }

    const withDetails = await Promise.all(
      slots.map(async (slot) => {
        const [classTemplate, user] = await Promise.all([
          ctx.db.get(slot.classId),
          ctx.db
            .query('users')
            .withIndex('by_externalId', (q) =>
              q.eq('externalId', slot.userId)
            )
            .first(),
        ])
        return {
          ...slot,
          className: classTemplate?.name ?? null,
          userFullName: user?.fullName ?? user?.email ?? slot.userId,
        }
      })
    )

    return withDetails
  },
})

/**
 * After creating a fixed slot, assign this member to all existing schedules
 * that match (same class, day of week, time in org timezone). Handles the case
 * where schedules were generated before the fixed slot was created.
 */
async function assignFixedSlotToMatchingSchedules(
  ctx: MutationCtx,
  slot: {
    organizationId: Id<'organizations'>
    userId: string
    classId: Id<'classes'>
    dayOfWeek: number
    startTimeMinutes: number
  }
): Promise<void> {
  const organization = await ctx.db.get(slot.organizationId)
  const timezone =
    organization?.timezone && organization.timezone.trim() !== ''
      ? organization.timezone
      : 'UTC'

  const now = Date.now()
  const schedules = await ctx.db
    .query('classSchedules')
    .withIndex('by_organization_time', (q) =>
      q.eq('organizationId', slot.organizationId).gt('startTime', now)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field('classId'), slot.classId),
        q.eq(q.field('status'), 'scheduled')
      )
    )
    .collect()

  for (const schedule of schedules) {
    const { dayOfWeek, startTimeMinutes } = getDayAndMinutesInZone(
      schedule.startTime,
      timezone
    )
    if (
      dayOfWeek !== slot.dayOfWeek ||
      startTimeMinutes !== slot.startTimeMinutes
    ) {
      continue
    }

    if (schedule.currentReservations >= schedule.capacity) continue

    const existing = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', schedule._id))
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), slot.userId),
          q.neq(q.field('status'), 'cancelled')
        )
      )
      .first()

    if (existing) continue

    await ctx.db.insert('classReservations', {
      scheduleId: schedule._id,
      classId: schedule.classId,
      organizationId: schedule.organizationId,
      userId: slot.userId,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(schedule._id, {
      currentReservations: schedule.currentReservations + 1,
      updatedAt: now,
    })
  }
}

/**
 * When removing a fixed slot, cancel this member's reservations on all schedules
 * that match the slot (same class, day of week, time in org timezone) so the
 * member is removed from those schedules.
 */
async function removeMemberFromMatchingSchedules(
  ctx: MutationCtx,
  slot: {
    organizationId: Id<'organizations'>
    userId: string
    classId: Id<'classes'>
    dayOfWeek: number
    startTimeMinutes: number
  }
): Promise<void> {
  const organization = await ctx.db.get(slot.organizationId)
  const timezone =
    organization?.timezone && organization.timezone.trim() !== ''
      ? organization.timezone
      : 'UTC'

  const schedules = await ctx.db
    .query('classSchedules')
    .withIndex('by_organization_time', (q) =>
      q.eq('organizationId', slot.organizationId)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field('classId'), slot.classId),
        q.eq(q.field('status'), 'scheduled')
      )
    )
    .collect()

  const now = Date.now()

  for (const schedule of schedules) {
    const { dayOfWeek, startTimeMinutes } = getDayAndMinutesInZone(
      schedule.startTime,
      timezone
    )
    if (
      dayOfWeek !== slot.dayOfWeek ||
      startTimeMinutes !== slot.startTimeMinutes
    ) {
      continue
    }

    const reservation = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', schedule._id))
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), slot.userId),
          q.eq(q.field('status'), 'confirmed')
        )
      )
      .first()

    if (!reservation) continue

    await ctx.db.patch(reservation._id, {
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(schedule._id, {
      currentReservations: Math.max(0, schedule.currentReservations - 1),
      updatedAt: now,
    })
  }
}

/** Weekday from Intl (short) to 0-6 (Sunday = 0). */
const WEEKDAY_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Derive day of week (0-6) and startTimeMinutes (0-1439) from a timestamp
 * in the given IANA timezone. Fixed slots are created in the org's local time,
 * and schedules are generated in local time, so we must match in the same zone.
 * Exported for use in classReservations.getByScheduleWithUsers.
 */
export function getDayAndMinutesInZone(startTime: number, timezone: string): { dayOfWeek: number; startTimeMinutes: number } {
  const d = new Date(startTime)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(d)
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const dayOfWeek = WEEKDAY_TO_NUM[partMap.weekday] ?? 0
  const hour = parseInt(partMap.hour ?? '0', 10)
  const minute = parseInt(partMap.minute ?? '0', 10)
  const startTimeMinutes = hour * 60 + minute
  return { dayOfWeek, startTimeMinutes }
}

/**
 * Helper: assign fixed-slot members to a newly created schedule.
 * Call from classSchedules.create and from classes.generateSchedules / generateSchedulesFromTimeWindow.
 * Derives dayOfWeek and startTimeMinutes from the schedule's startTime in the
 * organization's timezone (so they match the admin's local time when creating fixed slots).
 */
export async function assignFixedSlotsToSchedule(
  ctx: MutationCtx,
  scheduleId: Id<'classSchedules'>
): Promise<void> {
  const schedule = await ctx.db.get(scheduleId)
  if (!schedule) return
  if (schedule.status !== 'scheduled') return

  const organization = await ctx.db.get(schedule.organizationId)
  const timezone = organization?.timezone && organization.timezone.trim() !== ''
    ? organization.timezone
    : 'UTC'

  const { dayOfWeek, startTimeMinutes } = getDayAndMinutesInZone(
    schedule.startTime,
    timezone
  )

  const slots = await ctx.db
    .query('fixedClassSlots')
    .withIndex('by_organization_class_slot', (q) =>
      q
        .eq('organizationId', schedule.organizationId)
        .eq('classId', schedule.classId)
        .eq('dayOfWeek', dayOfWeek)
        .eq('startTimeMinutes', startTimeMinutes)
    )
    .collect()

  const now = Date.now()
  let currentReservations = schedule.currentReservations
  const capacity = schedule.capacity

  for (const slot of slots) {
    if (currentReservations >= capacity) break

    const existing = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', scheduleId))
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), slot.userId),
          q.neq(q.field('status'), 'cancelled')
        )
      )
      .first()

    if (existing) continue

    await ctx.db.insert('classReservations', {
      scheduleId,
      classId: schedule.classId,
      organizationId: schedule.organizationId,
      userId: slot.userId,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    })
    currentReservations += 1
  }

  if (currentReservations !== schedule.currentReservations) {
    await ctx.db.patch(scheduleId, {
      currentReservations,
      updatedAt: now,
    })
  }
}
