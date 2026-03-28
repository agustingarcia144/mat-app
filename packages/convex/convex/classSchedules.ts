import { mutation, query, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
  tryActiveOrgContext,
} from './permissions'
import { assignFixedSlotsToSchedule } from './fixedClassSlots'
import { createBatchWithSchedules, type ClassScheduleInsert } from './scheduleBatchUtils'

async function getReservationsForSchedule(
  ctx: MutationCtx,
  scheduleId: Id<'classSchedules'>
) {
  return await ctx.db
    .query('classReservations')
    .withIndex('by_schedule', (q) => q.eq('scheduleId', scheduleId))
    .collect()
}

function canEditOrDeleteSchedule(
  schedule: {
    status: 'scheduled' | 'cancelled' | 'completed'
  },
  reservations: Array<{
    status: 'confirmed' | 'cancelled' | 'attended' | 'no_show'
  }>
) {
  if (reservations.length === 0) {
    return true
  }

  const hasAttendanceHistory = reservations.some(
    (reservation) =>
      reservation.status === 'attended' || reservation.status === 'no_show'
  )
  if (hasAttendanceHistory) {
    return false
  }

  const hasNonCancelledReservations = reservations.some(
    (reservation) => reservation.status !== 'cancelled'
  )
  if (hasNonCancelledReservations) {
    return false
  }

  return schedule.status === 'cancelled'
}

/**
 * Create a single class schedule
 */
export const create = mutation({
  args: {
    classId: v.id('classes'),
    startTime: v.number(),
    endTime: v.number(),
    capacity: v.optional(v.number()), // Override class capacity
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    // Validate startTime < endTime
    if (args.startTime >= args.endTime) {
      throw new Error('startTime must be before endTime')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    const now = Date.now()

    const scheduleId = await ctx.db.insert('classSchedules', {
      classId: args.classId,
      organizationId: classTemplate.organizationId,
      startTime: args.startTime,
      endTime: args.endTime,
      capacity: args.capacity ?? classTemplate.capacity,
      currentReservations: 0,
      status: 'scheduled',
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    })

    await assignFixedSlotsToSchedule(ctx, scheduleId)
    return scheduleId
  },
})

/**
 * Update a class schedule
 */
export const update = mutation({
  args: {
    id: v.id('classSchedules'),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    capacity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId)

    const reservations = await getReservationsForSchedule(ctx, args.id)
    if (!canEditOrDeleteSchedule(schedule, reservations)) {
      throw new Error(
        'No se puede editar un turno con reservas activas o asistencias.'
      )
    }

    const nextStartTime = args.startTime ?? schedule.startTime
    const nextEndTime = args.endTime ?? schedule.endTime
    if (nextStartTime >= nextEndTime) {
      throw new Error('startTime must be before endTime')
    }

    // If reducing capacity, check that we don't have more reservations
    if (args.capacity !== undefined && args.capacity < schedule.currentReservations) {
      throw new Error(
        `Cannot reduce capacity below current reservations (${schedule.currentReservations})`
      )
    }

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

/**
 * Cancel a specific class occurrence (and all its reservations).
 * Use when the turno has reservations — keeps history with status 'cancelled'.
 */
export const cancel = mutation({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId)

    // Cancel all reservations for this schedule
    const reservations = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule_status', (q) =>
        q.eq('scheduleId', args.id).eq('status', 'confirmed')
      )
      .collect()

    const now = Date.now()
    const classTemplate = await ctx.db.get(schedule.classId)
    const className = classTemplate?.name ?? 'tu clase'
    const affectedUserIds = reservations.map((reservation) => reservation.userId)

    for (const reservation of reservations) {
      await ctx.db.patch(reservation._id, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch(args.id, {
      status: 'cancelled',
      updatedAt: now,
    })

    if (affectedUserIds.length > 0) {
      await ctx.runMutation(internal.pushNotifications.sendClassCancelledReminder, {
        scheduleId: args.id,
        userIds: affectedUserIds,
        className,
      })
    }
  },
})

/**
 * Remove (delete) a schedule. Only allowed when it has no reservations.
 * Use for empty turnos so they disappear from the calendar instead of staying as cancelled.
 * For turnos with reservations, use cancel() instead.
 */
export const remove = mutation({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId)

    const reservations = await ctx.db
      .query('classReservations')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', args.id))
      .collect()

    if (!canEditOrDeleteSchedule(schedule, reservations)) {
      throw new Error(
        'No se puede eliminar un turno con reservas activas o asistencias.'
      )
    }

    for (const reservation of reservations) {
      await ctx.db.delete(reservation._id)
    }

    await ctx.db.delete(args.id)

    if (schedule.batchId) {
      const remainingSchedules = await ctx.db
        .query('classSchedules')
        .withIndex('by_batch', (q) => q.eq('batchId', schedule.batchId))
        .collect()

      if (remainingSchedules.length === 0) {
        await ctx.db.delete(schedule.batchId)
      }
    }
  },
})

/**
 * Get schedule by ID
 */
export const getById = query({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) {
      return null
    }

    await requireOrganizationMembership(ctx, schedule.organizationId)

    return schedule
  },
})

/**
 * Get all schedules for a specific class
 */
export const getByClass = query({
  args: {
    classId: v.id('classes'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    // Get the class to check organization
    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireOrganizationMembership(ctx, classTemplate.organizationId)

    return await ctx.db
      .query('classSchedules')
      .withIndex('by_class', (q) => q.eq('classId', args.classId))
      .collect()
  },
})

/**
 * Get schedules in a date range for an organization
 */
export const getByOrganizationAndDateRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    classId: v.optional(v.id('classes')), // Filter by specific class
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    // Get schedules in the date range
    const schedules = await ctx.db
      .query('classSchedules')
      .withIndex('by_organization_time', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .gte('startTime', args.startDate)
      )
      .filter((q) => q.lte(q.field('startTime'), args.endDate))
      .collect()

    // Filter by classId if provided
    if (args.classId) {
      return schedules.filter((s) => s.classId === args.classId)
    }

    return schedules
  },
})

/**
 * Get upcoming schedules (next N occurrences)
 */
export const getUpcoming = query({
  args: {
    limit: v.optional(v.number()),
    classId: v.optional(v.id('classes')),
  },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx)
    if (!orgCtx) {
      return []
    }
    const { membership } = orgCtx

    const now = Date.now()
    const limit = args.limit ?? 10

    let query = ctx.db
      .query('classSchedules')
      .withIndex('by_organization_time', (q) =>
        q.eq('organizationId', membership.organizationId).gte('startTime', now)
      )
      .filter((q) => q.eq(q.field('status'), 'scheduled'))

    if (args.classId) {
      query = query.filter((q) => q.eq(q.field('classId'), args.classId))
    }

    return await query.take(limit)
  },
})

/**
 * Get schedule with enriched data (class info, reservation count)
 */
export const getScheduleWithDetails = query({
  args: {
    id: v.id('classSchedules'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const schedule = await ctx.db.get(args.id)
    if (!schedule) return null

    await requireOrganizationMembership(ctx, schedule.organizationId)

    const classTemplate = await ctx.db.get(schedule.classId)
    
    return {
      ...schedule,
      class: classTemplate,
    }
  },
})

/**
 * Debug: Get all schedules for organization
 */
export const getAllByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    return await ctx.db
      .query('classSchedules')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()
  },
})

/**
 * Copy the "model week" pattern (derived from schedules in the selected week + fixed slots)
 * into one or more target weeks, preserving start/end times for each block.
 *
 * Fixed-slot-only blocks will be generated using the duration computed client-side
 * (fallback is the UI default).
 */
export const copyModelWeekToDateRange = mutation({
  args: {
    sourceWeekStartDate: v.number(), // ms at the start of the source week (client computed)
    templates: v.array(
      v.object({
        classId: v.id('classes'),
        startTime: v.number(),
        endTime: v.number(),
        capacity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
    targetWeekStarts: v.array(v.number()), // ms at the start of each target week
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    if (args.templates.length === 0) {
      throw new Error('No hay turnos para duplicar.')
    }
    if (args.targetWeekStarts.length === 0) {
      throw new Error('Seleccioná al menos una semana de destino.')
    }

    const now = Date.now()

    // Group templates by classId (scheduleBatches are per-class).
    type CopyModelTemplate = (typeof args.templates)[number]
    const templatesByClass = new Map<Id<'classes'>, CopyModelTemplate[]>()
    for (const t of args.templates) {
      const list = templatesByClass.get(t.classId) ?? []
      list.push(t as CopyModelTemplate)
      templatesByClass.set(t.classId, list)
    }

    const batchResults: Array<{ batchId: Id<'scheduleBatches'>; count: number }> = []
    const classIds: Id<'classes'>[] = []
    templatesByClass.forEach((_, classId) => {
      classIds.push(classId)
    })

    for (const classId of classIds) {
      const classTemplates = templatesByClass.get(classId) ?? []
      const schedules: ClassScheduleInsert[] = []

      const durationMinutes = Math.max(
        1,
        Math.round(
          (classTemplates[0]!.endTime - classTemplates[0]!.startTime) / 60000
        )
      )

      for (const targetWeekStart of args.targetWeekStarts) {
        const delta = targetWeekStart - args.sourceWeekStartDate
        for (const tpl of classTemplates) {
          const newStart = tpl.startTime + delta
          const newEnd = tpl.endTime + delta
          if (newEnd <= newStart) continue

          schedules.push({
            classId,
            organizationId: membership.organizationId,
            startTime: newStart,
            endTime: newEnd,
            capacity: tpl.capacity,
            currentReservations: 0,
            status: 'scheduled',
            notes: tpl.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      if (schedules.length === 0) continue

      const first = [...schedules].sort((a, b) => a.startTime - b.startTime)[0]!

      const result = await createBatchWithSchedules(ctx, {
        organizationId: membership.organizationId,
        classId,
        sourceType: 'single',
        sourceConfig: {
          mode: 'single',
          startTime: first.startTime,
          endTime: first.endTime,
          durationMinutes,
        },
        createdBy: identity.subject,
        schedules,
      })

      batchResults.push({ batchId: result.batchId, count: result.count })
    }

    const createdCount = batchResults.reduce((acc, r) => acc + r.count, 0)
    return { createdSchedules: createdCount, batchesCreated: batchResults.length }
  },
})
