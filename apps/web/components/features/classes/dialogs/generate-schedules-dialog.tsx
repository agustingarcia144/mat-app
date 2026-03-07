'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { type Id } from '@/convex/_generated/dataModel'
import {
  generateTurnosTimeWindowSchema,
  z,
} from '@repo/core/schemas'
import { toast } from 'sonner'

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

const MAX_SLOTS_PER_GENERATION = 400

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, '0'),
  label: `${String(i).padStart(2, '0')}:00`,
}))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  value: String(i).padStart(2, '0'),
  label: String(i).padStart(2, '0'),
}))

function parseTimeHHmm(value: string | undefined): { hour: string; minute: string } {
  if (!value || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    return { hour: '08', minute: '00' }
  }
  const [h, m] = value.split(':')
  return {
    hour: h!.padStart(2, '0'),
    minute: m!.padStart(2, '0'),
  }
}

type Mode = 'timeWindow' | 'single'

const generateTurnosFormSchema = z
  .object({
    mode: z.enum(['timeWindow', 'single']),
    classId: z.string().min(1, 'Selecciona una clase'),
    duration: z.coerce
      .number()
      .min(15, 'Mínimo 15 minutos')
      .max(480, 'Máximo 8 horas'),
    // single
    startDate: z.date().optional(),
    startTime: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    // timeWindow
    rangeStartDate: z.date().optional(),
    rangeEndDate: z.date().optional(),
    timeWindowStart: z.string().optional(),
    timeWindowEnd: z.string().optional(),
    slotIntervalMinutes: z.number().optional(),
    daysOfWeek: z.array(z.number()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'single') {
      if (!data.startDate) {
        ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Fecha requerida' })
      }
      if (!data.startTime) {
        ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Hora requerida' })
      }
    }
    if (data.mode === 'timeWindow') {
      const tw = generateTurnosTimeWindowSchema.safeParse({
        rangeStartDate: data.rangeStartDate,
        rangeEndDate: data.rangeEndDate,
        timeWindowStart: data.timeWindowStart,
        timeWindowEnd: data.timeWindowEnd,
        slotIntervalMinutes: data.slotIntervalMinutes ?? 60,
        durationMinutes: data.duration,
        daysOfWeek: data.daysOfWeek,
      })
      if (!tw.success) {
        tw.error.issues.forEach((issue) => {
          const path = issue.path[0] as string
          ctx.addIssue({
            code: 'custom',
            path: [path],
            message: issue.message,
          })
        })
      }
    }
  })

type GenerateTurnosFormValues = z.infer<typeof generateTurnosFormSchema>

interface GenerateSchedulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialClassId?: Id<'classes'>
  initialClassTitle?: string
  onSuccess?: () => void
}

function approximateTimeWindowCount(
  rangeStart: Date,
  rangeEnd: Date,
  timeStartMins: number,
  timeEndMins: number,
  intervalMins: number,
  daysOfWeek?: number[]
): number {
  const dayMs = 24 * 60 * 60 * 1000
  let days = 0
  let current = new Date(rangeStart)
  current.setHours(0, 0, 0, 0)
  const end = new Date(rangeEnd)
  end.setHours(23, 59, 59, 999)
  while (current.getTime() <= end.getTime()) {
    const dow = current.getDay()
    if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(dow)) {
      days++
    }
    current = new Date(current.getTime() + dayMs)
  }
  const slotsPerDay = Math.floor((timeEndMins - timeStartMins) / intervalMins)
  return days * slotsPerDay
}

export default function GenerateSchedulesDialog({
  open,
  onOpenChange,
  initialClassId,
  initialClassTitle,
  onSuccess,
}: GenerateSchedulesDialogProps) {
  const classes = useQuery(api.classes.getByOrganization, open ? { activeOnly: false } : 'skip')
  const generateSchedules = useMutation(api.classes.generateSchedules)
  const generateFromTimeWindow = useMutation(api.classes.generateSchedulesFromTimeWindow)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitInProgress = useRef(false)

  const form = useForm<GenerateTurnosFormValues>({
    resolver: zodResolver(generateTurnosFormSchema) as any,
    defaultValues: {
      mode: 'timeWindow',
      classId: '',
      duration: 60,
      startDate: new Date(),
      startTime: '09:00',
      rangeStartDate: new Date(),
      rangeEndDate: new Date(),
      timeWindowStart: '08:00',
      timeWindowEnd: '20:00',
      slotIntervalMinutes: 60,
      daysOfWeek: undefined,
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form

  const mode = watch('mode')
  const classId = watch('classId')
  const rangeStartDate = watch('rangeStartDate')
  const rangeEndDate = watch('rangeEndDate')
  const timeWindowStart = watch('timeWindowStart')
  const timeWindowEnd = watch('timeWindowEnd')
  const slotIntervalMinutes = watch('slotIntervalMinutes')
  const duration = watch('duration')
  const daysOfWeek = watch('daysOfWeek')

  useEffect(() => {
    if (open && initialClassId) {
      setValue('classId', initialClassId)
    }
  }, [open, initialClassId, setValue])

  // Keep end date in sync: if start is set and end is missing or before start, use start (single day)
  useEffect(() => {
    if (mode !== 'timeWindow' || !rangeStartDate) return
    const end = rangeEndDate ?? null
    if (end == null || end < rangeStartDate) {
      setValue('rangeEndDate', rangeStartDate)
    }
  }, [mode, rangeStartDate, rangeEndDate, setValue])

  useEffect(() => {
    if (!open) {
      reset({
        mode: 'timeWindow',
        classId: initialClassId ?? '',
        duration: 60,
        startDate: new Date(),
        startTime: '09:00',
        rangeStartDate: new Date(),
        rangeEndDate: new Date(),
        timeWindowStart: '08:00',
        timeWindowEnd: '20:00',
        slotIntervalMinutes: 60,
        daysOfWeek: undefined,
      })
    }
  }, [open, reset, initialClassId])

  const dateRange: DateRange | undefined =
    rangeStartDate != null
      ? { from: rangeStartDate, to: rangeEndDate ?? undefined }
      : undefined

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const approximateCount =
    mode === 'timeWindow' &&
    rangeStartDate &&
    rangeEndDate &&
    timeWindowStart &&
    timeWindowEnd &&
    slotIntervalMinutes != null
      ? (() => {
          const [sh, sm] = timeWindowStart.split(':').map(Number)
          const [eh, em] = timeWindowEnd.split(':').map(Number)
          const startMins = sh * 60 + sm
          const endMins = eh * 60 + em
          return approximateTimeWindowCount(
            rangeStartDate,
            rangeEndDate,
            startMins,
            endMins,
            slotIntervalMinutes,
            daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : undefined
          )
        })()
      : null

  const onSubmit = async (data: GenerateTurnosFormValues) => {
    if (!data.classId) return
    if (submitInProgress.current) return
    submitInProgress.current = true
    const classIdArg = data.classId as Id<'classes'>
    setIsSubmitting(true)
    try {
      if (data.mode === 'single' && data.startDate != null && data.startTime != null) {
        const [hours, minutes] = data.startTime.split(':').map(Number)
        const startDateTime = new Date(data.startDate)
        startDateTime.setHours(hours, minutes, 0, 0)
        const startTime = startDateTime.getTime()
        const endTime = startTime + data.duration * 60 * 1000
        const result = await generateSchedules({
          classId: classIdArg,
          startDate: startTime,
          endTime,
        })
        toast.success(`Se creó ${result.count} turno correctamente`)
      } else if (data.mode === 'timeWindow' && data.rangeStartDate && data.timeWindowStart && data.timeWindowEnd && data.slotIntervalMinutes != null) {
        // Use single day when end is missing or before start (avoids generating on unintended days)
        const startDate = data.rangeStartDate
        const endDateRaw = data.rangeEndDate
        const endDate =
          endDateRaw && endDateRaw >= startDate ? endDateRaw : startDate

        const [sh, sm] = data.timeWindowStart.split(':').map(Number)
        const [eh, em] = data.timeWindowEnd.split(':').map(Number)
        const timeWindowStartMinutes = sh * 60 + sm
        const timeWindowEndMinutes = eh * 60 + em
        const startDay = new Date(startDate)
        startDay.setHours(0, 0, 0, 0)
        const endDay = new Date(endDate)
        endDay.setHours(23, 59, 59, 999)
        const result = await generateFromTimeWindow({
          classId: classIdArg,
          startDate: startDay.getTime(),
          endDate: endDay.getTime(),
          timeWindowStartMinutes,
          timeWindowEndMinutes,
          slotIntervalMinutes: data.slotIntervalMinutes,
          durationMinutes: data.duration,
          daysOfWeek: data.daysOfWeek && data.daysOfWeek.length > 0 ? data.daysOfWeek : undefined,
        })
        toast.success(`Se generaron ${result.count} turnos correctamente`)
      }
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Error generating schedules:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al generar turnos'
      )
    } finally {
      setIsSubmitting(false)
      submitInProgress.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar turnos</DialogTitle>
          <DialogDescription>
            {initialClassTitle
              ? `Crear turnos para la clase "${initialClassTitle}"`
              : 'Elige una clase y define cuándo se crearán los turnos.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-5">
          {/* Class selector */}
          <Field>
            <FieldLabel>Clase</FieldLabel>
            <Controller
              name="classId"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!!initialClassId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una clase" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map((c: Doc<'classes'>) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.classId && (
              <FieldError>{errors.classId.message}</FieldError>
            )}
          </Field>

          {/* Mode */}
          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <Controller
              name="mode"
              control={form.control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as Mode)}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="timeWindow" id="mode-timeWindow" />
                    <Label htmlFor="mode-timeWindow" className="font-normal">
                      Rango de tiempo por día (ej. cada hora de 8:00 a 20:00)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="single" id="mode-single" />
                    <Label htmlFor="mode-single" className="font-normal">
                      Un solo turno
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
          </Field>

          {mode === 'timeWindow' && (
            <>
              <Field>
                <FieldLabel>Rango de fechas</FieldLabel>
                <FieldDescription>
                  Desde qué día hasta qué día se crearán turnos.
                </FieldDescription>
                <Calendar
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from) {
                      setValue('rangeStartDate', range.from)
                      // Single day when only start is picked; otherwise use range
                      setValue('rangeEndDate', range.to ?? range.from)
                    }
                  }}
                  numberOfMonths={2}
                  showOutsideDays={false}
                  locale={es}
                  disabled={(date) => date < todayStart}
                  className="rounded-md border"
                />
                {errors.rangeStartDate && (
                  <FieldError>{errors.rangeStartDate.message}</FieldError>
                )}
                {errors.rangeEndDate && (
                  <FieldError>{errors.rangeEndDate.message}</FieldError>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Hora inicio (por día)</FieldLabel>
                  <Controller
                    name="timeWindowStart"
                    control={form.control}
                    render={({ field }) => {
                      const { hour, minute } = parseTimeHHmm(field.value)
                      return (
                        <div className="flex items-center gap-2">
                          <Select
                            value={hour}
                            onValueChange={(h) =>
                              field.onChange(`${h}:${minute}`)
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Hora" />
                            </SelectTrigger>
                            <SelectContent>
                              {HOUR_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground">:</span>
                          <Select
                            value={minute}
                            onValueChange={(m) =>
                              field.onChange(`${hour}:${m}`)
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Min" />
                            </SelectTrigger>
                            <SelectContent>
                              {MINUTE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    }}
                  />
                  {errors.timeWindowStart && (
                    <FieldError>{errors.timeWindowStart.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Hora fin (por día)</FieldLabel>
                  <Controller
                    name="timeWindowEnd"
                    control={form.control}
                    render={({ field }) => {
                      const { hour, minute } = parseTimeHHmm(field.value)
                      return (
                        <div className="flex items-center gap-2">
                          <Select
                            value={hour}
                            onValueChange={(h) =>
                              field.onChange(`${h}:${minute}`)
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Hora" />
                            </SelectTrigger>
                            <SelectContent>
                              {HOUR_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground">:</span>
                          <Select
                            value={minute}
                            onValueChange={(m) =>
                              field.onChange(`${hour}:${m}`)
                            }
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Min" />
                            </SelectTrigger>
                            <SelectContent>
                              {MINUTE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    }}
                  />
                  {errors.timeWindowEnd && (
                    <FieldError>{errors.timeWindowEnd.message}</FieldError>
                  )}
                </Field>
              </div>

              <Field>
                <FieldLabel>Frecuencia dentro del día</FieldLabel>
                <Controller
                  name="slotIntervalMinutes"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={String(field.value ?? 60)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLOT_INTERVAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel>Días de la semana (opcional)</FieldLabel>
                <FieldDescription>
                  Si no eliges ninguno, se crean turnos todos los días.
                </FieldDescription>
                <div className="flex flex-wrap gap-3 pt-1">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dow-${day.value}`}
                        checked={(daysOfWeek ?? []).includes(day.value)}
                        onCheckedChange={(checked) => {
                          const current = daysOfWeek ?? []
                          const next = checked
                            ? [...current, day.value].sort((a, b) => a - b)
                            : current.filter((d: number) => d !== day.value)
                          setValue('daysOfWeek', next.length > 0 ? next : undefined)
                        }}
                      />
                      <Label htmlFor={`dow-${day.value}`} className="text-sm font-normal">
                        {day.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </Field>

              {approximateCount != null && approximateCount >= 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Se crearán aproximadamente <strong>{approximateCount}</strong> turnos.
                  </p>
                  {approximateCount > MAX_SLOTS_PER_GENERATION && (
                    <p className="text-sm text-destructive">
                      Máximo {MAX_SLOTS_PER_GENERATION} turnos por vez. Reducí el rango de fechas o los días.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {mode === 'single' && (
            <>
              <Field>
                <FieldLabel>Fecha</FieldLabel>
                <Controller
                  name="startDate"
                  control={form.control}
                  render={({ field }) => (
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < todayStart}
                      locale={es}
                      className="rounded-md border"
                    />
                  )}
                />
                {errors.startDate && (
                  <FieldError>{errors.startDate.message}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel>Hora de inicio</FieldLabel>
                <Input type="time" {...register('startTime')} placeholder="09:00" />
                {errors.startTime && (
                  <FieldError>{errors.startTime.message}</FieldError>
                )}
              </Field>
            </>
          )}

          <Field>
            <FieldLabel>Duración (minutos)</FieldLabel>
            <Input
              type="number"
              {...register('duration', { valueAsNumber: true })}
              min={15}
              max={480}
              step={15}
            />
            <FieldDescription>Duración de cada turno.</FieldDescription>
            {errors.duration && (
              <FieldError>{errors.duration.message}</FieldError>
            )}
          </Field>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (mode === 'timeWindow' &&
                  approximateCount != null &&
                  approximateCount > MAX_SLOTS_PER_GENERATION)
              }
            >
              {isSubmitting ? 'Generando...' : 'Generar turnos'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
