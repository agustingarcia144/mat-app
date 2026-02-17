'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
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
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { type Id } from '@/convex/_generated/dataModel'
import { scheduleFormSchema, z } from '@repo/core/schemas'
import { toast } from 'sonner'

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

interface GenerateSchedulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: Id<'classes'>
  classTitle: string
  isRecurring: boolean
  onSuccess?: () => void
}

export default function GenerateSchedulesDialog({
  open,
  onOpenChange,
  classId,
  classTitle,
  isRecurring,
  onSuccess,
}: GenerateSchedulesDialogProps) {
  const generateSchedules = useMutation(api.classes.generateSchedules)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema) as any,
    defaultValues: {
      startDate: new Date(),
      startTime: '09:00',
      duration: 60,
      endDate: undefined,
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form

  const startDate = watch('startDate')
  const endDate = watch('endDate')
  const dateRange: DateRange | undefined = startDate
    ? { from: startDate, to: endDate ?? undefined }
    : undefined

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const onSubmit = async (data: ScheduleFormValues) => {
    setIsSubmitting(true)
    try {
      // Combine date and time into a timestamp
      const [hours, minutes] = data.startTime.split(':').map(Number)
      const startDateTime = new Date(data.startDate)
      startDateTime.setHours(hours, minutes, 0, 0)

      const startTime = startDateTime.getTime()
      const endTime = startTime + data.duration * 60 * 1000

      const result = await generateSchedules({
        classId,
        startDate: startTime,
        endTime,
        daysToGenerate: isRecurring ? 90 : undefined,
        endDate: data.endDate
          ? new Date(data.endDate).setHours(23, 59, 59, 999)
          : undefined,
      })

      console.log('Schedules generated:', result)
      toast.success(`Se generaron ${result.count} horario(s) exitosamente`)
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Error generating schedules:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al generar horarios'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar Horarios</DialogTitle>
          <DialogDescription>
            Crear horarios para la clase &quot;{classTitle}&quot;
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          {/* Date range: start and optional end */}
          <Field>
            <FieldLabel>Rango de fechas</FieldLabel>
            <FieldDescription>
              Selecciona la fecha de inicio y, opcionalmente, la fecha de fin.
              Si no seleccionas fin, se generarán horarios hasta 90 días desde
              el inicio.
            </FieldDescription>
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={(range) => {
                if (range?.from) {
                  setValue('startDate', range.from)
                  setValue('endDate', range.to ?? undefined)
                }
              }}
              numberOfMonths={2}
              showOutsideDays={false}
              locale={es}
              disabled={(date) => date < todayStart}
              className="rounded-md border"
            />
            {errors.startDate && (
              <FieldError>{errors.startDate.message}</FieldError>
            )}
          </Field>

          {/* Start Time */}
          <Field>
            <FieldLabel>Hora de inicio</FieldLabel>
            <Input type="time" {...register('startTime')} placeholder="09:00" />
            {errors.startTime && (
              <FieldError>{errors.startTime.message}</FieldError>
            )}
          </Field>

          {/* Duration */}
          <Field>
            <FieldLabel>Duración (minutos)</FieldLabel>
            <Input
              type="number"
              {...register('duration')}
              min={15}
              max={480}
              step={15}
            />
            <FieldDescription>
              Duración de cada clase en minutos
            </FieldDescription>
            {errors.duration && (
              <FieldError>{errors.duration.message}</FieldError>
            )}
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Generando...' : 'Generar Horarios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
