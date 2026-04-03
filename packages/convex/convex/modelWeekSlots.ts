import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from './permissions'
import {
  createBatchWithSchedules,
  type ClassScheduleInsert,
} from './scheduleBatchUtils'

export const listByOrganization = query({
  args: {
    classId: v.optional(v.id('classes')),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const slots = args.classId
      ? await ctx.db
          .query('modelWeekSlots')
          .withIndex('by_organization_class', (q) =>
            q
              .eq('organizationId', membership.organizationId)
              .eq('classId', args.classId!)
          )
          .collect()
      : await ctx.db
          .query('modelWeekSlots')
          .withIndex('by_organization', (q) =>
            q.eq('organizationId', membership.organizationId)
          )
          .collect()

    return await Promise.all(
      slots.map(async (slot) => ({
        ...slot,
        class: await ctx.db.get(slot.classId),
      }))
    )
  },
})

export const create = mutation({
  args: {
    classId: v.id('classes'),
    dayOfWeek: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    capacity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const existing = await ctx.db
      .query('modelWeekSlots')
      .withIndex('by_organization_slot', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('classId', args.classId)
          .eq('dayOfWeek', args.dayOfWeek)
          .eq('startTimeMinutes', args.startTimeMinutes)
      )
      .first()

    if (existing) {
      throw new Error(
        'Ya existe un slot de semana modelo para esta clase, día y hora.'
      )
    }

    const now = Date.now()
    return await ctx.db.insert('modelWeekSlots', {
      organizationId: membership.organizationId,
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      capacity: args.capacity,
      notes: args.notes,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id('modelWeekSlots'),
    classId: v.optional(v.id('classes')),
    dayOfWeek: v.optional(v.number()),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    capacity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const slot = await ctx.db.get(args.id)
    if (!slot || slot.organizationId !== membership.organizationId) {
      throw new Error('Slot not found')
    }

    const { id, ...fields } = args
    // Only include defined fields so optional overrides can be cleared via remove
    const patch: Record<string, unknown> = { updatedAt: Date.now() }
    if (fields.classId !== undefined) patch.classId = fields.classId
    if (fields.dayOfWeek !== undefined) patch.dayOfWeek = fields.dayOfWeek
    if (fields.startTimeMinutes !== undefined)
      patch.startTimeMinutes = fields.startTimeMinutes
    if (fields.durationMinutes !== undefined)
      patch.durationMinutes = fields.durationMinutes
    if (fields.capacity !== undefined) patch.capacity = fields.capacity
    if (fields.notes !== undefined) patch.notes = fields.notes

    await ctx.db.patch(id, patch)
  },
})

export const remove = mutation({
  args: { id: v.id('modelWeekSlots') },
  handler: async (ctx, args) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const slot = await ctx.db.get(args.id)
    if (!slot || slot.organizationId !== membership.organizationId) {
      throw new Error('Slot not found')
    }

    await ctx.db.delete(args.id)
  },
})

/**
 * Generate actual classSchedules from the model week template into one or more target weeks.
 * Each targetWeekStart must be the timestamp of the Monday of that week.
 * Results are grouped into scheduleBatches per class, same as other generation flows.
 */
export const applyToDateRange = mutation({
  args: {
    targetWeekStarts: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    if (args.targetWeekStarts.length === 0) {
      throw new Error('Seleccioná al menos una semana de destino.')
    }

    const modelSlots = await ctx.db
      .query('modelWeekSlots')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    if (modelSlots.length === 0) {
      throw new Error('No hay slots en la semana modelo.')
    }

    const now = Date.now()

    // Group by classId to create one batch per class
    const slotsByClass = new Map<Id<'classes'>, typeof modelSlots>()
    for (const slot of modelSlots) {
      const list = slotsByClass.get(slot.classId) ?? []
      list.push(slot)
      slotsByClass.set(slot.classId, list)
    }

    const batchResults: Array<{ batchId: Id<'scheduleBatches'>; count: number }> =
      []

    const classIds = Array.from(slotsByClass.keys())
    for (const classId of classIds) {
      const slots = slotsByClass.get(classId)!
      // ctx.db.get returns a union over all tables; assert the correct type
      const classDoc = (await ctx.db.get(classId)) as {
        _id: Id<'classes'>
        capacity: number
        [key: string]: unknown
      } | null
      if (!classDoc) continue

      const schedules: ClassScheduleInsert[] = []

      for (const targetWeekStart of args.targetWeekStarts) {
        for (const slot of slots) {
          // Convert dayOfWeek (0=Sun…6=Sat) to Mon-first offset (0=Mon…6=Sun)
          const dayOffset = (slot.dayOfWeek + 6) % 7
          const dayStart = targetWeekStart + dayOffset * 24 * 60 * 60 * 1000
          const startTime = dayStart + slot.startTimeMinutes * 60 * 1000
          const endTime = startTime + slot.durationMinutes * 60 * 1000

          schedules.push({
            classId,
            organizationId: membership.organizationId,
            startTime,
            endTime,
            capacity: slot.capacity ?? classDoc.capacity,
            currentReservations: 0,
            status: 'scheduled',
            notes: slot.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      if (schedules.length === 0) continue

      const first = [...schedules].sort((a, b) => a.startTime - b.startTime)[0]!
      const durationMinutes = Math.max(
        1,
        Math.round((first.endTime - first.startTime) / 60000)
      )

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
    return {
      createdSchedules: createdCount,
      batchesCreated: batchResults.length,
    }
  },
})
