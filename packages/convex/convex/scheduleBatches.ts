import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
} from './permissions'
import {
  createBatchWithSchedules,
  deleteSchedulesByIds,
  ensureNoScheduleConflicts,
  getSchedulesForBatch,
  type ClassScheduleInsert,
} from './scheduleBatchUtils'

type ReservationDoc = Doc<'classReservations'>
type ScheduleDoc = Doc<'classSchedules'>
type BatchDoc = Doc<'scheduleBatches'>

function getStartOfDay(timestamp: number) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function getEndOfDay(timestamp: number) {
  const date = new Date(timestamp)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

async function getBatchOrThrow(
  ctx: MutationCtx | QueryCtx,
  batchId: Id<'scheduleBatches'>
) {
  const batch = await ctx.db.get(batchId)
  if (!batch) {
    throw new Error('Lote no encontrado')
  }
  return batch
}

async function getReservationsForSchedule(
  ctx: MutationCtx | QueryCtx,
  scheduleId: Id<'classSchedules'>
) {
  return await ctx.db
    .query('classReservations')
    .withIndex('by_schedule', (q) => q.eq('scheduleId', scheduleId))
    .collect()
}

function isScheduleEditableOrDeletable(
  schedule: ScheduleDoc,
  reservations: ReservationDoc[]
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

  const hasActiveReservations = reservations.some(
    (reservation) => reservation.status !== 'cancelled'
  )
  if (hasActiveReservations) {
    return false
  }

  return schedule.status === 'cancelled'
}

async function buildBatchSummary(ctx: MutationCtx | QueryCtx, batch: BatchDoc) {
  const [classTemplate, schedules] = await Promise.all([
    ctx.db.get(batch.classId),
    getSchedulesForBatch(ctx, batch._id),
  ])

  const reservationsBySchedule = await Promise.all(
    schedules.map((schedule) => getReservationsForSchedule(ctx, schedule._id))
  )

  let confirmedReservations = 0
  let cancelledReservations = 0
  let attendedReservations = 0
  let noShowReservations = 0
  let scheduledCount = 0
  let cancelledCount = 0
  let completedCount = 0
  let editableSchedulesCount = 0
  let protectedSchedulesCount = 0

  schedules.forEach((schedule, index) => {
    if (schedule.status === 'scheduled') scheduledCount++
    if (schedule.status === 'cancelled') cancelledCount++
    if (schedule.status === 'completed') completedCount++

    reservationsBySchedule[index].forEach((reservation) => {
      if (reservation.status === 'confirmed') confirmedReservations++
      if (reservation.status === 'cancelled') cancelledReservations++
      if (reservation.status === 'attended') attendedReservations++
      if (reservation.status === 'no_show') noShowReservations++
    })
  })

  const canManage =
    schedules.length > 0 &&
    schedules.every((schedule, index) =>
      isScheduleEditableOrDeletable(schedule, reservationsBySchedule[index])
    )

  schedules.forEach((schedule, index) => {
    const canManageSchedule = isScheduleEditableOrDeletable(
      schedule,
      reservationsBySchedule[index]
    )
    if (canManageSchedule) {
      editableSchedulesCount++
    } else {
      protectedSchedulesCount++
    }
  })

  return {
    ...batch,
    className: classTemplate?.name ?? 'Clase eliminada',
    totalSchedules: schedules.length,
    scheduledCount,
    cancelledCount,
    completedCount,
    confirmedReservations,
    cancelledReservations,
    attendedReservations,
    noShowReservations,
    editableSchedulesCount,
    protectedSchedulesCount,
    canEdit: canManage,
    canDelete: canManage,
  }
}

async function deleteBatchData(ctx: MutationCtx, batch: BatchDoc) {
  const schedules = await getSchedulesForBatch(ctx, batch._id)

  for (const schedule of schedules) {
    const reservations = await getReservationsForSchedule(ctx, schedule._id)

    if (!isScheduleEditableOrDeletable(schedule, reservations)) {
      throw new Error(
        'No se puede modificar o eliminar este lote porque tiene turnos con reservas activas o asistencias.'
      )
    }

    for (const reservation of reservations) {
      await ctx.db.delete(reservation._id)
    }
  }

  await deleteSchedulesByIds(
    ctx,
    schedules.map((schedule) => schedule._id)
  )
  await ctx.db.delete(batch._id)
}

async function syncBatchMetadata(
  ctx: MutationCtx,
  batchId: Id<'scheduleBatches'>
) {
  const schedules = await getSchedulesForBatch(ctx, batchId)
  if (schedules.length === 0) {
    await ctx.db.delete(batchId)
    return null
  }

  const sorted = [...schedules].sort((a, b) => a.startTime - b.startTime)
  await ctx.db.patch(batchId, {
    generatedCount: sorted.length,
    firstStartTime: sorted[0].startTime,
    lastEndTime: sorted[sorted.length - 1].endTime,
    updatedAt: Date.now(),
  })

  return sorted
}

function buildTimeWindowSchedules(
  batch: BatchDoc,
  args: {
    rangeStartDate: number
    rangeEndDate: number
    capacity?: number
    notes?: string
  }
) {
  if (batch.sourceConfig.mode !== 'timeWindow') {
    throw new Error('Este lote no fue generado desde una ventana horaria.')
  }

  const config = batch.sourceConfig
  const schedules: ClassScheduleInsert[] = []
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  let current = args.rangeStartDate
  const rangeEnd = args.rangeEndDate

  while (current <= rangeEnd) {
    const date = new Date(current)
    const dayOfWeek = date.getDay()
    const includeDay =
      !config.daysOfWeek ||
      config.daysOfWeek.length === 0 ||
      config.daysOfWeek.includes(dayOfWeek)

    if (includeDay) {
      for (
        let minutes = config.timeWindowStartMinutes;
        minutes < config.timeWindowEndMinutes;
        minutes += config.slotIntervalMinutes
      ) {
        const startTime = current + minutes * 60 * 1000
        const endTime = startTime + config.durationMinutes * 60 * 1000
        schedules.push({
          classId: batch.classId,
          organizationId: batch.organizationId,
          startTime,
          endTime,
          capacity: args.capacity ?? 0,
          currentReservations: 0,
          status: 'scheduled',
          notes: args.notes,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    current += dayMs
  }

  return schedules
}

function buildSingleSchedules(
  batch: BatchDoc,
  args: {
    startTime: number
    durationMinutes: number
    capacity: number
    notes?: string
  }
) {
  const now = Date.now()
  return [
    {
      classId: batch.classId,
      organizationId: batch.organizationId,
      startTime: args.startTime,
      endTime: args.startTime + args.durationMinutes * 60 * 1000,
      capacity: args.capacity,
      currentReservations: 0,
      status: 'scheduled' as const,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function buildShiftedSchedules(
  batch: BatchDoc,
  sourceSchedules: ScheduleDoc[],
  args: {
    rangeStartDate: number
    rangeEndDate: number
    capacity?: number
    notes?: string
  }
) {
  if (sourceSchedules.length === 0) {
    throw new Error('El lote no tiene turnos para duplicar.')
  }

  const now = Date.now()
  const sorted = [...sourceSchedules].sort((a, b) => a.startTime - b.startTime)
  const sourceAnchor = getStartOfDay(sorted[0].startTime)
  const targetAnchor = getStartOfDay(args.rangeStartDate)
  const targetEnd = getEndOfDay(args.rangeEndDate)
  const schedules: ClassScheduleInsert[] = []

  for (const schedule of sorted) {
    const offsetFromSourceAnchor = schedule.startTime - sourceAnchor
    const duration = schedule.endTime - schedule.startTime
    const newStart = targetAnchor + offsetFromSourceAnchor
    const newEnd = newStart + duration

    if (newStart > targetEnd) {
      continue
    }

    schedules.push({
      classId: batch.classId,
      organizationId: batch.organizationId,
      startTime: newStart,
      endTime: newEnd,
      capacity: args.capacity ?? schedule.capacity,
      currentReservations: 0,
      status: 'scheduled',
      notes: args.notes ?? schedule.notes,
      createdAt: now,
      updatedAt: now,
    })
  }

  return schedules
}

export const listByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    const batches = await ctx.db
      .query('scheduleBatches')
      .withIndex('by_organization_status_created', (q) =>
        q.eq('organizationId', membership.organizationId).eq('status', 'active')
      )
      .collect()

    const summaries = await Promise.all(
      batches.map((batch) => buildBatchSummary(ctx, batch))
    )

    return summaries.sort((a, b) => b.createdAt - a.createdAt)
  },
})

export const getDetails = query({
  args: {
    batchId: v.id('scheduleBatches'),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId)
    if (!batch) {
      return null
    }

    await requireOrganizationMembership(ctx, batch.organizationId)

    const summary = await buildBatchSummary(ctx, batch)
    const schedules = await getSchedulesForBatch(ctx, args.batchId)
    const details = await Promise.all(
      schedules
        .sort((a, b) => a.startTime - b.startTime)
        .map(async (schedule) => {
          const reservations = await getReservationsForSchedule(ctx, schedule._id)
          const reservationCounts = {
            confirmed: reservations.filter((r) => r.status === 'confirmed').length,
            cancelled: reservations.filter((r) => r.status === 'cancelled').length,
            attended: reservations.filter((r) => r.status === 'attended').length,
            noShow: reservations.filter((r) => r.status === 'no_show').length,
          }

          return {
            ...schedule,
            reservationCounts,
            canEdit: isScheduleEditableOrDeletable(schedule, reservations),
            canDelete: isScheduleEditableOrDeletable(schedule, reservations),
          }
        })
    )

    return {
      ...summary,
      schedules: details,
    }
  },
})

export const update = mutation({
  args: {
    batchId: v.id('scheduleBatches'),
    capacity: v.optional(v.number()),
    notes: v.optional(v.string()),
    rangeStartDate: v.optional(v.number()),
    rangeEndDate: v.optional(v.number()),
    timeWindowStartMinutes: v.optional(v.number()),
    timeWindowEndMinutes: v.optional(v.number()),
    slotIntervalMinutes: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    daysOfWeek: v.optional(v.array(v.number())),
    singleStartTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const batch = await getBatchOrThrow(ctx, args.batchId)
    await requireAdminOrTrainer(ctx, batch.organizationId)

    const hasStructuralChanges =
      batch.sourceConfig.mode === 'timeWindow'
        ? args.rangeStartDate !== undefined ||
          args.rangeEndDate !== undefined ||
          args.timeWindowStartMinutes !== undefined ||
          args.timeWindowEndMinutes !== undefined ||
          args.slotIntervalMinutes !== undefined ||
          args.durationMinutes !== undefined ||
          args.daysOfWeek !== undefined
        : args.singleStartTime !== undefined || args.durationMinutes !== undefined

    if (
      args.capacity === undefined &&
      args.notes === undefined &&
      !hasStructuralChanges
    ) {
      throw new Error('No hay cambios para aplicar.')
    }

    if (args.capacity !== undefined && args.capacity < 1) {
      throw new Error('La capacidad debe ser mayor a 0.')
    }

    const schedules = await getSchedulesForBatch(ctx, args.batchId)
    if (schedules.length === 0) {
      throw new Error('El lote no tiene turnos para actualizar.')
    }

    const reservationsBySchedule = new Map<
      Id<'classSchedules'>,
      ReservationDoc[]
    >()
    for (const schedule of schedules) {
      const reservations = await getReservationsForSchedule(ctx, schedule._id)
      reservationsBySchedule.set(schedule._id, reservations)
      if (!isScheduleEditableOrDeletable(schedule, reservations)) {
        if (!hasStructuralChanges) {
          throw new Error(
            'No se puede editar este lote porque tiene turnos con reservas activas o asistencias.'
          )
        }
      }
    }

    const firstSchedule = [...schedules].sort((a, b) => a.startTime - b.startTime)[0]

    if (hasStructuralChanges) {
      const editableSchedules = schedules.filter((schedule) =>
        isScheduleEditableOrDeletable(
          schedule,
          reservationsBySchedule.get(schedule._id) ?? []
        )
      )
      const protectedSchedules = schedules.filter(
        (schedule) => !editableSchedules.some((editable) => editable._id === schedule._id)
      )

      if (editableSchedules.length === 0) {
        throw new Error(
          'No hay turnos editables en este lote. Cancelá reservas o asistencias antes de reconfigurarlo.'
        )
      }

      const capacity = args.capacity ?? firstSchedule.capacity
      const notes = args.notes ?? firstSchedule.notes

      let nextSourceConfig = batch.sourceConfig
      let replacementSchedules: ClassScheduleInsert[] = []

      if (batch.sourceConfig.mode === 'timeWindow') {
        const config = {
          rangeStartDate: args.rangeStartDate ?? batch.sourceConfig.rangeStartDate,
          rangeEndDate: args.rangeEndDate ?? batch.sourceConfig.rangeEndDate,
          timeWindowStartMinutes:
            args.timeWindowStartMinutes ?? batch.sourceConfig.timeWindowStartMinutes,
          timeWindowEndMinutes:
            args.timeWindowEndMinutes ?? batch.sourceConfig.timeWindowEndMinutes,
          slotIntervalMinutes:
            args.slotIntervalMinutes ?? batch.sourceConfig.slotIntervalMinutes,
          durationMinutes:
            args.durationMinutes ?? batch.sourceConfig.durationMinutes,
          daysOfWeek: args.daysOfWeek ?? batch.sourceConfig.daysOfWeek,
        }

        if (config.rangeStartDate > config.rangeEndDate) {
          throw new Error('La fecha de inicio debe ser anterior a la fecha de fin.')
        }
        if (config.timeWindowStartMinutes >= config.timeWindowEndMinutes) {
          throw new Error('La hora de inicio debe ser anterior a la hora de fin.')
        }
        if (config.slotIntervalMinutes < 1) {
          throw new Error('El intervalo debe ser mayor a 0.')
        }
        if (config.durationMinutes < 15 || config.durationMinutes > 480) {
          throw new Error('La duración debe estar entre 15 y 480 minutos.')
        }

        nextSourceConfig = {
          mode: 'timeWindow',
          ...config,
        }
        replacementSchedules = buildTimeWindowSchedules(batch, {
          rangeStartDate: config.rangeStartDate,
          rangeEndDate: config.rangeEndDate,
          capacity,
          notes,
        })
      } else {
        const startTime = args.singleStartTime ?? batch.sourceConfig.startTime
        const durationMinutes =
          args.durationMinutes ?? batch.sourceConfig.durationMinutes

        if (durationMinutes < 15 || durationMinutes > 480) {
          throw new Error('La duración debe estar entre 15 y 480 minutos.')
        }

        nextSourceConfig = {
          mode: 'single',
          startTime,
          endTime: startTime + durationMinutes * 60 * 1000,
          endDate: batch.sourceConfig.endDate,
          durationMinutes,
        }
        replacementSchedules = buildSingleSchedules(batch, {
          startTime,
          durationMinutes,
          capacity,
          notes,
        })
      }

      await ensureNoScheduleConflicts(
        ctx,
        replacementSchedules,
        new Set(editableSchedules.map((schedule) => schedule._id))
      )

      const replacement = await createBatchWithSchedules(ctx, {
        organizationId: batch.organizationId,
        classId: batch.classId,
        sourceType: batch.sourceType,
        sourceConfig: nextSourceConfig,
        createdBy: identity.subject,
        schedules: replacementSchedules,
        duplicatedFromBatchId: batch._id,
        ignoreScheduleIds: new Set(editableSchedules.map((schedule) => schedule._id)),
      })

      for (const schedule of editableSchedules) {
        const reservations = reservationsBySchedule.get(schedule._id) ?? []
        for (const reservation of reservations) {
          await ctx.db.delete(reservation._id)
        }
      }
      await deleteSchedulesByIds(
        ctx,
        editableSchedules.map((schedule) => schedule._id)
      )
      await syncBatchMetadata(ctx, batch._id)

      return {
        editMode: 'replace' as const,
        batchId: replacement.batchId,
        updatedCount: replacement.count,
        replacedCount: editableSchedules.length,
        protectedCount: protectedSchedules.length,
      }
    }

    const now = Date.now()
    for (const schedule of schedules) {
      await ctx.db.patch(schedule._id, {
        ...(args.capacity !== undefined ? { capacity: args.capacity } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        updatedAt: now,
      })
    }

    await ctx.db.patch(args.batchId, {
      updatedAt: now,
    })

    return {
      editMode: 'patch' as const,
      batchId: args.batchId,
      updatedCount: schedules.length,
      replacedCount: 0,
      protectedCount: 0,
    }
  },
})

export const duplicate = mutation({
  args: {
    batchId: v.id('scheduleBatches'),
    rangeStartDate: v.number(),
    rangeEndDate: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const batch = await getBatchOrThrow(ctx, args.batchId)
    await requireAdminOrTrainer(ctx, batch.organizationId)

    if (args.rangeStartDate > args.rangeEndDate) {
      throw new Error('La fecha de inicio debe ser anterior a la fecha de fin.')
    }

    const sourceSchedules = await getSchedulesForBatch(ctx, batch._id)
    if (sourceSchedules.length === 0) {
      throw new Error('El lote no tiene turnos para duplicar.')
    }

    const schedules =
      batch.sourceConfig.mode === 'timeWindow'
        ? buildTimeWindowSchedules(batch, {
            rangeStartDate: args.rangeStartDate,
            rangeEndDate: args.rangeEndDate,
            capacity: sourceSchedules[0]?.capacity,
            notes: sourceSchedules[0]?.notes,
          })
        : buildShiftedSchedules(batch, sourceSchedules, {
            rangeStartDate: args.rangeStartDate,
            rangeEndDate: args.rangeEndDate,
          })

    const duplicated = await createBatchWithSchedules(ctx, {
      organizationId: batch.organizationId,
      classId: batch.classId,
      sourceType: batch.sourceType,
      sourceConfig:
        batch.sourceConfig.mode === 'timeWindow'
          ? {
              ...batch.sourceConfig,
              rangeStartDate: args.rangeStartDate,
              rangeEndDate: args.rangeEndDate,
            }
          : {
              ...batch.sourceConfig,
              startTime:
                batch.sourceConfig.startTime -
                getStartOfDay(batch.sourceConfig.startTime) +
                getStartOfDay(args.rangeStartDate),
              endTime:
                batch.sourceConfig.endTime -
                getStartOfDay(batch.sourceConfig.startTime) +
                getStartOfDay(args.rangeStartDate),
              endDate: getEndOfDay(args.rangeEndDate),
            },
      createdBy: identity.subject,
      schedules,
      duplicatedFromBatchId: batch._id,
    })

    return duplicated
  },
})

export const remove = mutation({
  args: {
    batchId: v.id('scheduleBatches'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const batch = await getBatchOrThrow(ctx, args.batchId)
    await requireAdminOrTrainer(ctx, batch.organizationId)

    await deleteBatchData(ctx, batch)
    return { success: true }
  },
})

export const removeEditableSchedules = mutation({
  args: {
    batchId: v.id('scheduleBatches'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const batch = await getBatchOrThrow(ctx, args.batchId)
    await requireAdminOrTrainer(ctx, batch.organizationId)

    const schedules = await getSchedulesForBatch(ctx, batch._id)
    if (schedules.length === 0) {
      throw new Error('El lote no tiene turnos para eliminar.')
    }

    const editableSchedules: ScheduleDoc[] = []

    for (const schedule of schedules) {
      const reservations = await getReservationsForSchedule(ctx, schedule._id)
      if (isScheduleEditableOrDeletable(schedule, reservations)) {
        for (const reservation of reservations) {
          await ctx.db.delete(reservation._id)
        }
        editableSchedules.push(schedule)
      }
    }

    if (editableSchedules.length === 0) {
      throw new Error(
        'No hay turnos editables en este lote. Solo contiene turnos bloqueados.'
      )
    }

    await deleteSchedulesByIds(
      ctx,
      editableSchedules.map((schedule) => schedule._id)
    )

    const remainingSchedules = await syncBatchMetadata(ctx, batch._id)
    return {
      removedCount: editableSchedules.length,
      remainingCount: remainingSchedules?.length ?? 0,
      batchDeleted: remainingSchedules === null,
    }
  },
})
