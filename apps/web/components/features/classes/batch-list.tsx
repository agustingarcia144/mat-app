'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { type Id } from '@/convex/_generated/dataModel'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { format, addDays, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import {
  getBatchListColumns,
  type BatchRow,
} from './batch-list-columns'

type BatchScheduleDetail = {
  _id: Id<'classSchedules'>
  startTime: number
  endTime: number
  capacity: number
  status: 'scheduled' | 'cancelled' | 'completed'
  notes?: string
  reservationCounts: {
    confirmed: number
    cancelled: number
    attended: number
    noShow: number
  }
}

type BatchDetails = BatchRow & {
  sourceConfig:
    | {
        mode: 'single'
        startTime: number
        endTime: number
        endDate?: number
        durationMinutes: number
      }
    | {
        mode: 'timeWindow'
        rangeStartDate: number
        rangeEndDate: number
        timeWindowStartMinutes: number
        timeWindowEndMinutes: number
        slotIntervalMinutes: number
        durationMinutes: number
        daysOfWeek?: number[]
      }
  schedules: BatchScheduleDetail[]
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

const SLOT_INTERVAL_OPTIONS = [
  { value: 15, label: 'Cada 15 min' },
  { value: 30, label: 'Cada 30 min' },
  { value: 60, label: 'Cada hora' },
  { value: 120, label: 'Cada 2 horas' },
]

function toDateInputValue(timestamp: number) {
  return format(new Date(timestamp), 'yyyy-MM-dd')
}

function parseDateInputValue(value: string, endOfDay = false) {
  const date = new Date(`${value}T00:00:00`)
  if (endOfDay) {
    date.setHours(23, 59, 59, 999)
  }
  return date.getTime()
}

function toTimeValueFromMinutes(minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mins = String(minutes % 60).padStart(2, '0')
  return `${hours}:${mins}`
}

function toMinutesFromTimeValue(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function toTimeValueFromTimestamp(timestamp: number) {
  return format(new Date(timestamp), 'HH:mm')
}

function sameDaysOfWeek(
  left: number[] | undefined,
  right: number[] | undefined
) {
  const leftValue = (left ?? []).slice().sort((a, b) => a - b).join(',')
  const rightValue = (right ?? []).slice().sort((a, b) => a - b).join(',')
  return leftValue === rightValue
}

function getSharedNotes(schedules: BatchScheduleDetail[]) {
  if (schedules.length === 0) return ''
  const first = schedules[0]?.notes ?? ''
  return schedules.every((schedule) => (schedule.notes ?? '') === first)
    ? first
    : ''
}

export default function BatchList() {
  const batches = useQuery(api.scheduleBatches.listByOrganization, {})
  const updateBatch = useMutation(api.scheduleBatches.update)
  const duplicateBatch = useMutation(api.scheduleBatches.duplicate)
  const removeBatch = useMutation(api.scheduleBatches.remove)

  const [viewingBatchId, setViewingBatchId] =
    useState<Id<'scheduleBatches'> | null>(null)
  const [editingBatchId, setEditingBatchId] =
    useState<Id<'scheduleBatches'> | null>(null)
  const [duplicatingBatchId, setDuplicatingBatchId] =
    useState<Id<'scheduleBatches'> | null>(null)
  const [deletingBatchId, setDeletingBatchId] =
    useState<Id<'scheduleBatches'> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editCapacity, setEditCapacity] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editRangeStartDate, setEditRangeStartDate] = useState('')
  const [editRangeEndDate, setEditRangeEndDate] = useState('')
  const [editTimeWindowStart, setEditTimeWindowStart] = useState('08:00')
  const [editTimeWindowEnd, setEditTimeWindowEnd] = useState('20:00')
  const [editSlotIntervalMinutes, setEditSlotIntervalMinutes] = useState('60')
  const [editDurationMinutes, setEditDurationMinutes] = useState('60')
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<number[] | undefined>(
    undefined
  )
  const [editSingleDate, setEditSingleDate] = useState<Date | undefined>()
  const [editSingleStartTime, setEditSingleStartTime] = useState('09:00')
  const [duplicateStartDate, setDuplicateStartDate] = useState('')
  const [duplicateEndDate, setDuplicateEndDate] = useState('')
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const selectedBatchId =
    viewingBatchId ??
    editingBatchId ??
    duplicatingBatchId ??
    deletingBatchId

  const selectedBatch = useQuery(
    api.scheduleBatches.getDetails,
    selectedBatchId ? { batchId: selectedBatchId } : 'skip'
  ) as BatchDetails | null | undefined

  useEffect(() => {
    if (!editingBatchId || !selectedBatch || selectedBatch._id !== editingBatchId) {
      return
    }

    const firstSchedule = selectedBatch.schedules[0]
    setEditCapacity(firstSchedule ? String(firstSchedule.capacity) : '')
    setEditNotes(getSharedNotes(selectedBatch.schedules))

    if (selectedBatch.sourceConfig.mode === 'timeWindow') {
      setEditRangeStartDate(
        toDateInputValue(selectedBatch.sourceConfig.rangeStartDate)
      )
      setEditRangeEndDate(toDateInputValue(selectedBatch.sourceConfig.rangeEndDate))
      setEditTimeWindowStart(
        toTimeValueFromMinutes(selectedBatch.sourceConfig.timeWindowStartMinutes)
      )
      setEditTimeWindowEnd(
        toTimeValueFromMinutes(selectedBatch.sourceConfig.timeWindowEndMinutes)
      )
      setEditSlotIntervalMinutes(
        String(selectedBatch.sourceConfig.slotIntervalMinutes)
      )
      setEditDurationMinutes(String(selectedBatch.sourceConfig.durationMinutes))
      setEditDaysOfWeek(selectedBatch.sourceConfig.daysOfWeek)
      setEditSingleDate(undefined)
      setEditSingleStartTime('09:00')
    } else {
      setEditSingleDate(new Date(selectedBatch.sourceConfig.startTime))
      setEditSingleStartTime(
        toTimeValueFromTimestamp(selectedBatch.sourceConfig.startTime)
      )
      setEditDurationMinutes(String(selectedBatch.sourceConfig.durationMinutes))
      setEditRangeStartDate('')
      setEditRangeEndDate('')
      setEditTimeWindowStart('08:00')
      setEditTimeWindowEnd('20:00')
      setEditSlotIntervalMinutes('60')
      setEditDaysOfWeek(undefined)
    }
  }, [editingBatchId, selectedBatch])

  useEffect(() => {
    if (
      !duplicatingBatchId ||
      !selectedBatch ||
      selectedBatch._id !== duplicatingBatchId
    ) {
      return
    }

    const spanInDays =
      differenceInCalendarDays(
        new Date(selectedBatch.lastEndTime),
        new Date(selectedBatch.firstStartTime)
      ) + 1

    const nextStart = addDays(new Date(selectedBatch.lastEndTime), 1)
    const nextEnd = addDays(nextStart, Math.max(spanInDays - 1, 0))

    setDuplicateStartDate(toDateInputValue(nextStart.getTime()))
    setDuplicateEndDate(toDateInputValue(nextEnd.getTime()))
  }, [duplicatingBatchId, selectedBatch])

  const columns = useMemo(
    () =>
      getBatchListColumns({
        deletingId: deletingBatchId,
        onView: setViewingBatchId,
        onEdit: setEditingBatchId,
        onDuplicate: setDuplicatingBatchId,
        onDelete: setDeletingBatchId,
      }),
    [deletingBatchId]
  )

  const duplicateDateRange: DateRange | undefined =
    duplicateStartDate !== ''
      ? {
          from: new Date(`${duplicateStartDate}T00:00:00`),
          to:
            duplicateEndDate !== ''
              ? new Date(`${duplicateEndDate}T00:00:00`)
              : undefined,
        }
      : undefined

  const editDateRange: DateRange | undefined =
    editRangeStartDate !== ''
      ? {
          from: new Date(`${editRangeStartDate}T00:00:00`),
          to:
            editRangeEndDate !== ''
              ? new Date(`${editRangeEndDate}T00:00:00`)
              : undefined,
        }
      : undefined

  const handleEditSubmit = async () => {
    if (!editingBatchId) return

    const parsedCapacity = Number(editCapacity)
    if (!Number.isFinite(parsedCapacity) || parsedCapacity < 1) {
      toast.error('La capacidad debe ser mayor a 0.')
      return
    }

    const parsedDuration = Number(editDurationMinutes)
    if (!Number.isFinite(parsedDuration) || parsedDuration < 15 || parsedDuration > 480) {
      toast.error('La duración debe estar entre 15 y 480 minutos.')
      return
    }

    setActionLoading(true)
    try {
      const mutationArgs: Parameters<typeof updateBatch>[0] = {
        batchId: editingBatchId,
        capacity: parsedCapacity,
        notes: editNotes,
      }

      if (selectedBatch?.sourceConfig.mode === 'timeWindow') {
        if (!editRangeStartDate || !editRangeEndDate) {
          toast.error('Selecciona el rango de fechas del lote.')
          setActionLoading(false)
          return
        }

        const nextRangeStartDate = parseDateInputValue(editRangeStartDate)
        const nextRangeEndDate = parseDateInputValue(editRangeEndDate, true)
        const nextTimeWindowStartMinutes =
          toMinutesFromTimeValue(editTimeWindowStart)
        const nextTimeWindowEndMinutes = toMinutesFromTimeValue(editTimeWindowEnd)
        const nextSlotIntervalMinutes = Number(editSlotIntervalMinutes)

        if (
          nextRangeStartDate !== selectedBatch.sourceConfig.rangeStartDate
        ) {
          mutationArgs.rangeStartDate = nextRangeStartDate
        }
        if (nextRangeEndDate !== selectedBatch.sourceConfig.rangeEndDate) {
          mutationArgs.rangeEndDate = nextRangeEndDate
        }
        if (
          nextTimeWindowStartMinutes !==
          selectedBatch.sourceConfig.timeWindowStartMinutes
        ) {
          mutationArgs.timeWindowStartMinutes = nextTimeWindowStartMinutes
        }
        if (
          nextTimeWindowEndMinutes !==
          selectedBatch.sourceConfig.timeWindowEndMinutes
        ) {
          mutationArgs.timeWindowEndMinutes = nextTimeWindowEndMinutes
        }
        if (
          nextSlotIntervalMinutes !==
          selectedBatch.sourceConfig.slotIntervalMinutes
        ) {
          mutationArgs.slotIntervalMinutes = nextSlotIntervalMinutes
        }
        if (parsedDuration !== selectedBatch.sourceConfig.durationMinutes) {
          mutationArgs.durationMinutes = parsedDuration
        }
        if (
          !sameDaysOfWeek(
            editDaysOfWeek,
            selectedBatch.sourceConfig.daysOfWeek
          )
        ) {
          mutationArgs.daysOfWeek = editDaysOfWeek
        }
      } else if (selectedBatch?.sourceConfig.mode === 'single') {
        if (!editSingleDate) {
          toast.error('Selecciona la fecha del turno.')
          setActionLoading(false)
          return
        }

        const [hours, minutes] = editSingleStartTime.split(':').map(Number)
        const startDateTime = new Date(editSingleDate)
        startDateTime.setHours(hours, minutes, 0, 0)
        if (startDateTime.getTime() !== selectedBatch.sourceConfig.startTime) {
          mutationArgs.singleStartTime = startDateTime.getTime()
        }
        if (parsedDuration !== selectedBatch.sourceConfig.durationMinutes) {
          mutationArgs.durationMinutes = parsedDuration
        }
      }

      const result = await updateBatch(mutationArgs)
      if (result.editMode === 'replace') {
        toast.success(
          result.protectedCount > 0
            ? `Se creó un nuevo lote con ${result.updatedCount} turnos. ${result.protectedCount} turnos protegidos quedaron en el lote original.`
            : `Se regeneró el lote con ${result.updatedCount} turnos.`
        )
      } else {
        toast.success('Lote actualizado correctamente')
      }
      setEditingBatchId(null)
    } catch (error) {
      console.error('Error updating batch:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al actualizar el lote'
      )
    } finally {
      setActionLoading(false)
    }
  }

  const handleDuplicateSubmit = async () => {
    if (!duplicatingBatchId) return
    if (!duplicateStartDate || !duplicateEndDate) {
      toast.error('Selecciona el nuevo rango de fechas.')
      return
    }

    setActionLoading(true)
    try {
      const result = await duplicateBatch({
        batchId: duplicatingBatchId,
        rangeStartDate: parseDateInputValue(duplicateStartDate),
        rangeEndDate: parseDateInputValue(duplicateEndDate, true),
      })
      toast.success(`Se duplicó el lote con ${result.count} turnos`)
      setDuplicatingBatchId(null)
    } catch (error) {
      console.error('Error duplicating batch:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al duplicar el lote'
      )
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSubmit = async () => {
    if (!deletingBatchId) return

    setActionLoading(true)
    try {
      await removeBatch({ batchId: deletingBatchId })
      toast.success('Lote eliminado correctamente')
      setDeletingBatchId(null)
    } catch (error) {
      console.error('Error deleting batch:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al eliminar el lote'
      )
    } finally {
      setActionLoading(false)
    }
  }

  if (batches === undefined) {
    return (
      <div className='py-12 text-center'>
        <p className='text-muted-foreground'>Cargando lotes...</p>
      </div>
    )
  }

  return (
    <>
      <DataTable columns={columns} data={batches as BatchRow[]} />

      <Dialog
        open={viewingBatchId !== null}
        onOpenChange={(open) => {
          if (!open) setViewingBatchId(null)
        }}
      >
        <DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Detalle del lote</DialogTitle>
            <DialogDescription>
              Revisa los turnos incluidos y el estado de sus reservas.
            </DialogDescription>
          </DialogHeader>

          {!selectedBatch || selectedBatch._id !== viewingBatchId ? (
            <p className='text-sm text-muted-foreground'>Cargando detalle...</p>
          ) : (
            <div className='space-y-4'>
              <div className='grid gap-3 md:grid-cols-4'>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>Clase</div>
                  <div className='font-medium'>{selectedBatch.className}</div>
                </div>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>Turnos</div>
                  <div className='font-medium'>{selectedBatch.totalSchedules}</div>
                </div>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>Reservas</div>
                  <div className='font-medium'>
                    {selectedBatch.confirmedReservations} confirmadas
                  </div>
                </div>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>Estado</div>
                  <div>{selectedBatch.canEdit ? 'Editable' : 'Bloqueado'}</div>
                </div>
              </div>

              <div className='space-y-3'>
                {selectedBatch.schedules.map((schedule) => (
                  <div
                    key={schedule._id}
                    className='rounded-lg border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'
                  >
                    <div>
                      <div className='font-medium'>
                        {format(
                          new Date(schedule.startTime),
                          "EEEE d 'de' MMMM, HH:mm",
                          { locale: es }
                        )}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        hasta{' '}
                        {format(new Date(schedule.endTime), 'HH:mm', {
                          locale: es,
                        })}
                        {' · '}
                        capacidad {schedule.capacity}
                      </div>
                      {schedule.notes ? (
                        <div className='text-sm text-muted-foreground'>
                          {schedule.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className='flex items-center gap-2 flex-wrap'>
                      <Badge variant='outline'>{schedule.status}</Badge>
                      <Badge variant='secondary'>
                        {schedule.reservationCounts.confirmed} confirmadas
                      </Badge>
                      <Badge variant='secondary'>
                        {schedule.reservationCounts.attended} asist.
                      </Badge>
                      <Badge variant='secondary'>
                        {schedule.reservationCounts.noShow} aus.
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingBatchId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingBatchId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar lote</DialogTitle>
            <DialogDescription>
              Actualiza capacidad y notas para todos los turnos del lote.
            </DialogDescription>
          </DialogHeader>

          {!selectedBatch || selectedBatch._id !== editingBatchId ? (
            <p className='text-sm text-muted-foreground'>Cargando lote...</p>
          ) : (
            <div className='space-y-4'>
              {!selectedBatch.canEdit ? (
                <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground'>
                  Este lote no se puede editar porque tiene turnos con reservas
                  activas o asistencias registradas.
                </div>
              ) : null}

              <div className='space-y-2'>
                <label className='text-sm font-medium'>Capacidad</label>
                <Input
                  type='number'
                  min={1}
                  value={editCapacity}
                  onChange={(event) => setEditCapacity(event.target.value)}
                  disabled={!selectedBatch.canEdit || actionLoading}
                />
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium'>Notas</label>
                <Textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={4}
                  disabled={!selectedBatch.canEdit || actionLoading}
                />
              </div>

              {selectedBatch?.sourceConfig.mode === 'timeWindow' ? (
                <>
                  <Field>
                    <FieldLabel>Rango de fechas</FieldLabel>
                    <FieldDescription>
                      El lote se reemplazará con este nuevo rango.
                    </FieldDescription>
                    <Calendar
                      mode='range'
                      defaultMonth={editDateRange?.from}
                      selected={editDateRange}
                      onSelect={(range) => {
                        if (range?.from) {
                          setEditRangeStartDate(
                            toDateInputValue(range.from.getTime())
                          )
                          setEditRangeEndDate(
                            toDateInputValue((range.to ?? range.from).getTime())
                          )
                        }
                      }}
                      numberOfMonths={2}
                      showOutsideDays={false}
                      locale={es}
                      disabled={(date) => date < todayStart || actionLoading}
                      className='rounded-md border'
                    />
                  </Field>

                  <div className='grid grid-cols-2 gap-4'>
                    <Field>
                      <FieldLabel>Hora inicio</FieldLabel>
                      <Input
                        type='time'
                        value={editTimeWindowStart}
                        onChange={(event) =>
                          setEditTimeWindowStart(event.target.value)
                        }
                        disabled={!selectedBatch.canEdit || actionLoading}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Hora fin</FieldLabel>
                      <Input
                        type='time'
                        value={editTimeWindowEnd}
                        onChange={(event) =>
                          setEditTimeWindowEnd(event.target.value)
                        }
                        disabled={!selectedBatch.canEdit || actionLoading}
                      />
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel>Frecuencia dentro del día</FieldLabel>
                    <Select
                      value={editSlotIntervalMinutes}
                      onValueChange={setEditSlotIntervalMinutes}
                      disabled={!selectedBatch.canEdit || actionLoading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLOT_INTERVAL_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={String(option.value)}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel>Días de la semana</FieldLabel>
                    <FieldDescription>
                      Si no eliges ninguno, se reemplazan turnos para todos los días.
                    </FieldDescription>
                    <div className='flex flex-wrap gap-3 pt-1'>
                      {DAYS_OF_WEEK.map((day) => (
                        <div
                          key={day.value}
                          className='flex items-center space-x-2'
                        >
                          <Checkbox
                            id={`edit-dow-${day.value}`}
                            checked={(editDaysOfWeek ?? []).includes(day.value)}
                            disabled={!selectedBatch.canEdit || actionLoading}
                            onCheckedChange={(checked) => {
                              const current = editDaysOfWeek ?? []
                              const next = checked
                                ? [...current, day.value].sort((a, b) => a - b)
                                : current.filter((value) => value !== day.value)
                              setEditDaysOfWeek(
                                next.length > 0 ? next : undefined
                              )
                            }}
                          />
                          <Label
                            htmlFor={`edit-dow-${day.value}`}
                            className='text-sm font-normal'
                          >
                            {day.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field>
                    <FieldLabel>Fecha</FieldLabel>
                    <Calendar
                      mode='single'
                      selected={editSingleDate}
                      onSelect={setEditSingleDate}
                      disabled={(date) =>
                        date < todayStart || actionLoading || !selectedBatch.canEdit
                      }
                      locale={es}
                      className='rounded-md border'
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Hora de inicio</FieldLabel>
                    <Input
                      type='time'
                      value={editSingleStartTime}
                      onChange={(event) =>
                        setEditSingleStartTime(event.target.value)
                      }
                      disabled={!selectedBatch.canEdit || actionLoading}
                    />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel>Duración (minutos)</FieldLabel>
                <Input
                  type='number'
                  min={15}
                  max={480}
                  step={15}
                  value={editDurationMinutes}
                  onChange={(event) =>
                    setEditDurationMinutes(event.target.value)
                  }
                  disabled={!selectedBatch.canEdit || actionLoading}
                />
              </Field>
            </div>
          )}

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setEditingBatchId(null)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={
                actionLoading ||
                !selectedBatch ||
                selectedBatch._id !== editingBatchId ||
                !selectedBatch.canEdit
              }
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={duplicatingBatchId !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicatingBatchId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar lote</DialogTitle>
            <DialogDescription>
              Crea un nuevo lote vacío en otro rango de fechas. Los turnos fijos
              se volverán a asignar automáticamente.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>Rango de fechas</FieldLabel>
            <FieldDescription>
              Desde qué día hasta qué día se duplicarán los turnos.
            </FieldDescription>
            <Calendar
              mode='range'
              defaultMonth={duplicateDateRange?.from}
              selected={duplicateDateRange}
              onSelect={(range) => {
                if (range?.from) {
                  setDuplicateStartDate(toDateInputValue(range.from.getTime()))
                  setDuplicateEndDate(
                    toDateInputValue((range.to ?? range.from).getTime())
                  )
                }
              }}
              numberOfMonths={2}
              showOutsideDays={false}
              locale={es}
              disabled={(date) => date < todayStart || actionLoading}
              className='rounded-md border'
            />
          </Field>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDuplicatingBatchId(null)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleDuplicateSubmit} disabled={actionLoading}>
              Duplicar lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deletingBatchId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBatchId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar lote</DialogTitle>
            <DialogDescription>
              Solo se pueden eliminar lotes cuyos turnos estén vacíos o
              cancelados sin asistencias.
            </DialogDescription>
          </DialogHeader>

          {!selectedBatch || selectedBatch._id !== deletingBatchId ? (
            <p className='text-sm text-muted-foreground'>Cargando lote...</p>
          ) : (
            <div className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Se eliminará el lote de <strong>{selectedBatch.className}</strong>{' '}
                con {selectedBatch.totalSchedules} turnos.
              </p>
              {!selectedBatch.canDelete ? (
                <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground'>
                  Este lote no se puede eliminar porque tiene turnos con reservas
                  activas o asistencias registradas.
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeletingBatchId(null)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteSubmit}
              disabled={
                actionLoading ||
                !selectedBatch ||
                selectedBatch._id !== deletingBatchId ||
                !selectedBatch.canDelete
              }
            >
              Eliminar lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
