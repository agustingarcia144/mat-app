import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
} from './permissions'
import { assignFixedSlotsToSchedule } from './fixedClassSlots'

/** Schedule document for insert (status is literal for type compatibility) */
type ClassScheduleInsert = {
  classId: Id<'classes'>
  organizationId: Id<'organizations'>
  startTime: number
  endTime: number
  capacity: number
  currentReservations: number
  status: 'scheduled'
  createdAt: number
  updatedAt: number
}

/**
 * Create a new class template
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    capacity: v.number(),
    trainerId: v.optional(v.string()),
    bookingWindowDays: v.number(),
    cancellationWindowHours: v.number(),
    isRecurring: v.boolean(),
    recurrencePattern: v.optional(
      v.object({
        frequency: v.union(
          v.literal('hourly'),
          v.literal('daily'),
          v.literal('weekly'),
          v.literal('monthly')
        ),
        interval: v.number(),
        daysOfWeek: v.optional(v.array(v.number())),
        endDate: v.optional(v.number()),
      })
    ),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const membership = await requireCurrentOrganizationMembership(ctx)

    await requireAdminOrTrainer(ctx, membership.organizationId)

    const now = Date.now()

    const classId = await ctx.db.insert('classes', {
      organizationId: membership.organizationId,
      name: args.name,
      description: args.description,
      capacity: args.capacity,
      trainerId: args.trainerId,
      isRecurring: args.isRecurring,
      recurrencePattern: args.recurrencePattern,
      bookingWindowDays: args.bookingWindowDays,
      cancellationWindowHours: args.cancellationWindowHours,
      isActive: args.isActive,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    return classId
  },
})

/**
 * Update a class template
 */
export const update = mutation({
  args: {
    id: v.id('classes'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    capacity: v.optional(v.number()),
    trainerId: v.optional(v.string()),
    bookingWindowDays: v.optional(v.number()),
    cancellationWindowHours: v.optional(v.number()),
    isRecurring: v.optional(v.boolean()),
    recurrencePattern: v.optional(
      v.object({
        frequency: v.union(
          v.literal('hourly'),
          v.literal('daily'),
          v.literal('weekly'),
          v.literal('monthly')
        ),
        interval: v.number(),
        daysOfWeek: v.optional(v.array(v.number())),
        endDate: v.optional(v.number()),
      })
    ),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.id)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    const { id, ...updates } = args

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  },
})

const MAX_SCHEDULES_ON_CLASS_DELETE = 400

/**
 * Delete a class and all future schedules.
 * Fails if any future schedule has reservations — cancel or remove those turnos first.
 * Fails if there are more than MAX_SCHEDULES_ON_CLASS_DELETE future schedules (to avoid timeouts).
 */
export const remove = mutation({
  args: {
    id: v.id('classes'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.id)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    const now = Date.now()

    const futureSchedules = await ctx.db
      .query('classSchedules')
      .withIndex('by_class', (q) => q.eq('classId', args.id))
      .filter((q) => q.gte(q.field('startTime'), now))
      .collect()

    if (futureSchedules.length > MAX_SCHEDULES_ON_CLASS_DELETE) {
      throw new Error(
        `No se puede eliminar la clase: tiene más de ${MAX_SCHEDULES_ON_CLASS_DELETE} turnos programados (${futureSchedules.length}). Cancelá o eliminá turnos primero hasta quedar con ${MAX_SCHEDULES_ON_CLASS_DELETE} o menos.`
      )
    }

    const withReservations = futureSchedules.filter(
      (s) => s.currentReservations > 0
    )
    if (withReservations.length > 0) {
      throw new Error(
        'No se puede eliminar la clase: tiene turnos con reservas. Cancelá o eliminá esos turnos primero.'
      )
    }

    for (const schedule of futureSchedules) {
      const reservations = await ctx.db
        .query('classReservations')
        .withIndex('by_schedule', (q) => q.eq('scheduleId', schedule._id))
        .collect()
      for (const reservation of reservations) {
        await ctx.db.delete(reservation._id)
      }
      await ctx.db.delete(schedule._id)
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Get class by ID
 */
export const getById = query({
  args: {
    id: v.id('classes'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.id)
    if (!classTemplate) {
      return null
    }

    await requireOrganizationMembership(ctx, classTemplate.organizationId)

    return classTemplate
  },
})

/**
 * Get all classes for the current user's organization
 */
export const getByOrganization = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    if (args.activeOnly) {
      return await ctx.db
        .query('classes')
        .withIndex('by_organization_active', (q) =>
          q.eq('organizationId', membership.organizationId).eq('isActive', true)
        )
        .collect()
    }

    return await ctx.db
      .query('classes')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()
  },
})

/**
 * Generate schedule instances from recurrence pattern
 */
export const generateSchedules = mutation({
  args: {
    classId: v.id('classes'),
    startDate: v.number(), // First occurrence start time
    endTime: v.number(), // Duration (end time for first occurrence)
    daysToGenerate: v.optional(v.number()), // Default 90 days
    endDate: v.optional(v.number()), // Optional end date (timestamp) from Generate Schedules dialog
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    if (!classTemplate.isRecurring || !classTemplate.recurrencePattern) {
      // For non-recurring, just create one schedule
      const now = Date.now()
      const scheduleId = await ctx.db.insert('classSchedules', {
        classId: args.classId,
        organizationId: classTemplate.organizationId,
        startTime: args.startDate,
        endTime: args.endTime,
        capacity: classTemplate.capacity,
        currentReservations: 0,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now,
      })
      await assignFixedSlotsToSchedule(ctx, scheduleId)
      return { count: 1, scheduleId }
    }

    const pattern = classTemplate.recurrencePattern
    const daysToGenerate = args.daysToGenerate ?? 90
    const endDate =
      args.endDate ??
      pattern.endDate ??
      args.startDate + daysToGenerate * 24 * 60 * 60 * 1000
    const duration = args.endTime - args.startDate

    const schedules: ClassScheduleInsert[] = []

    let currentDate = new Date(args.startDate)
    const now = Date.now()

    if (pattern.frequency === 'weekly' && pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
      // Special handling for weekly with multiple days of week
      let weekIndex = 0
      const maxWeeks = Math.ceil((endDate - args.startDate) / (7 * 24 * 60 * 60 * 1000)) + 1
      
      while (weekIndex < maxWeeks) {
        // For each week, check all daysOfWeek
        for (const dayOfWeek of pattern.daysOfWeek) {
          // Calculate the date for this day in the current week
          const weekStartTime = args.startDate + (weekIndex * pattern.interval * 7 * 24 * 60 * 60 * 1000)
          const weekStartDate = new Date(weekStartTime)
          const weekStartDay = weekStartDate.getDay()
          
          // Calculate days to add to reach the target day of week
          let daysToAdd = dayOfWeek - weekStartDay
          if (daysToAdd < 0) daysToAdd += 7
          
          const targetDate = new Date(weekStartTime + (daysToAdd * 24 * 60 * 60 * 1000))
          targetDate.setHours(weekStartDate.getHours(), weekStartDate.getMinutes(), weekStartDate.getSeconds(), weekStartDate.getMilliseconds())
          
          if (targetDate.getTime() >= args.startDate && targetDate.getTime() <= endDate) {
            const startTime = targetDate.getTime()
            schedules.push({
              classId: args.classId,
              organizationId: classTemplate.organizationId,
              startTime,
              endTime: startTime + duration,
              capacity: classTemplate.capacity,
              currentReservations: 0,
              status: 'scheduled',
              createdAt: now,
              updatedAt: now,
            })
          }
        }
        weekIndex++
      }
    } else {
      // Handle other frequencies (hourly, daily, monthly)
      while (currentDate.getTime() <= endDate) {
        let shouldInclude = false

        // Check if this date matches the recurrence pattern
        if (pattern.frequency === 'daily') {
          shouldInclude = true
        } else if (pattern.frequency === 'monthly') {
          // For monthly, use the same day of month as start date
          const startDay = new Date(args.startDate).getDate()
          shouldInclude = currentDate.getDate() === startDay
        } else if (pattern.frequency === 'hourly') {
          shouldInclude = true
        }

        if (shouldInclude) {
          const startTime = currentDate.getTime()
          schedules.push({
            classId: args.classId,
            organizationId: classTemplate.organizationId,
            startTime,
            endTime: startTime + duration,
            capacity: classTemplate.capacity,
            currentReservations: 0,
            status: 'scheduled',
            createdAt: now,
            updatedAt: now,
          })
        }

        // Increment date based on frequency
        if (pattern.frequency === 'hourly') {
          currentDate = new Date(
            currentDate.getTime() + pattern.interval * 60 * 60 * 1000
          )
        } else if (pattern.frequency === 'daily') {
          currentDate = new Date(
            currentDate.getTime() + pattern.interval * 24 * 60 * 60 * 1000
          )
        } else if (pattern.frequency === 'monthly') {
          // Handle month overflow correctly
          const targetYear = currentDate.getFullYear()
          const targetMonth = currentDate.getMonth() + pattern.interval
          const originalDay = new Date(args.startDate).getDate()
          
          // Create a new date for the target month
          const newDate = new Date(targetYear, targetMonth, 1)
          // Get the last day of the target month
          const lastDayOfMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate()
          // Use the smaller of original day and last day of month
          const actualDay = Math.min(originalDay, lastDayOfMonth)
          
          currentDate = new Date(
            newDate.getFullYear(),
            newDate.getMonth(),
            actualDay,
            currentDate.getHours(),
            currentDate.getMinutes(),
            currentDate.getSeconds(),
            currentDate.getMilliseconds()
          )
        } else {
          break // Unknown frequency
        }
      }
    }

    // Batch insert all schedules and assign fixed-slot members
    for (const schedule of schedules) {
      const scheduleId = await ctx.db.insert('classSchedules', schedule)
      await assignFixedSlotsToSchedule(ctx, scheduleId)
    }

    return { count: schedules.length }
  },
})

const MAX_SLOTS_PER_GENERATION = 400

/**
 * Generate schedule instances from a per-day time window (e.g. 8am–8pm every hour).
 * No recurrence on the class is required; all params come from the dialog.
 * Capped at MAX_SLOTS_PER_GENERATION to avoid timeouts.
 */
export const generateSchedulesFromTimeWindow = mutation({
  args: {
    classId: v.id('classes'),
    startDate: v.number(), // Start of first day (midnight timestamp)
    endDate: v.number(), // End of last day (e.g. 23:59:59.999 timestamp)
    timeWindowStartMinutes: v.number(), // 0–1439, e.g. 480 = 8:00
    timeWindowEndMinutes: v.number(), // 0–1439, e.g. 1200 = 20:00
    slotIntervalMinutes: v.number(), // e.g. 60 or 30
    durationMinutes: v.number(),
    daysOfWeek: v.optional(v.array(v.number())), // 0–6, empty = all days
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const classTemplate = await ctx.db.get(args.classId)
    if (!classTemplate) {
      throw new Error('Class not found')
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId)

    // Count slots upfront to reject before building (avoids timeout and large alloc)
    const dayMs = 24 * 60 * 60 * 1000
    let dayCount = 0
    let currentCount = args.startDate
    while (currentCount <= args.endDate) {
      const d = new Date(currentCount)
      const dayOfWeek = d.getDay()
      const includeDay =
        !args.daysOfWeek ||
        args.daysOfWeek.length === 0 ||
        args.daysOfWeek.includes(dayOfWeek)
      if (includeDay) dayCount++
      currentCount += dayMs
    }
    const slotsPerDay = Math.floor(
      (args.timeWindowEndMinutes - args.timeWindowStartMinutes) /
        args.slotIntervalMinutes
    )
    const totalSlots = dayCount * slotsPerDay
    if (totalSlots > MAX_SLOTS_PER_GENERATION) {
      throw new Error(
        `Máximo ${MAX_SLOTS_PER_GENERATION} turnos por vez (se generarían ${totalSlots}). Reducí el rango de fechas o los días y generá de nuevo.`
      )
    }

    const schedules: ClassScheduleInsert[] = []
    const now = Date.now()
    let current = args.startDate

    while (current <= args.endDate) {
      const d = new Date(current)
      const dayOfWeek = d.getDay()

      const includeDay =
        !args.daysOfWeek ||
        args.daysOfWeek.length === 0 ||
        args.daysOfWeek.includes(dayOfWeek)

      if (includeDay) {
        const baseMs = current

        for (
          let mins = args.timeWindowStartMinutes;
          mins < args.timeWindowEndMinutes;
          mins += args.slotIntervalMinutes
        ) {
          const startTime = baseMs + mins * 60 * 1000
          const endTime = startTime + args.durationMinutes * 60 * 1000
          schedules.push({
            classId: args.classId,
            organizationId: classTemplate.organizationId,
            startTime,
            endTime,
            capacity: classTemplate.capacity,
            currentReservations: 0,
            status: 'scheduled',
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      current += dayMs
    }

    for (const schedule of schedules) {
      const scheduleId = await ctx.db.insert('classSchedules', schedule)
      await assignFixedSlotsToSchedule(ctx, scheduleId)
    }

    return { count: schedules.length }
  },
})
