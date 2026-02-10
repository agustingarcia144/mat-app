'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Id } from '@/convex/_generated/dataModel'
import { z } from 'zod'
import { toast } from 'sonner'

interface GenerateSchedulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: Id<'classes'>
  classTitle: string
  isRecurring: boolean
  onSuccess?: () => void
}

const scheduleFormSchema = z.object({
  startDate: z.date(),
  startTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato inválido (HH:mm)'),
  duration: z.coerce
    .number()
    .min(15, 'Mínimo 15 minutos')
    .max(480, 'Máximo 8 horas'),
})

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

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
  const [calendarOpen, setCalendarOpen] = useState(false)

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema) as any,
    defaultValues: {
      startDate: new Date(),
      startTime: '09:00',
      duration: 60,
    },
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generar Horarios</DialogTitle>
          <DialogDescription>
            Crear horarios para la clase &quot;{classTitle}&quot;
            {isRecurring && ' (se generarán los próximos 90 días)'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          {/* Start Date */}
          <Field>
            <FieldLabel>Fecha de inicio</FieldLabel>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? format(field.value, 'PPP', { locale: es })
                        : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date)
                        setCalendarOpen(false)
                      }}
                      disabled={(date) =>
                        date < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.startDate && (
              <FieldError>{errors.startDate.message}</FieldError>
            )}
          </Field>

          {/* Start Time */}
          <Field>
            <FieldLabel>Hora de inicio</FieldLabel>
            <Input type="time" {...register('startTime')} placeholder="09:00" />
            <FieldDescription>Formato 24 horas (ej: 14:30)</FieldDescription>
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
