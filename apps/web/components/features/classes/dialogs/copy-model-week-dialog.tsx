'use client'

import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'
import { toast } from 'sonner'
import type { DateRange } from 'react-day-picker'
import { addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'

export type ModelScheduleTemplate = {
  classId: Id<'classes'>
  startTime: number
  endTime: number
  capacity: number
  notes?: string | undefined
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceWeekStartDate: number
  templates: ModelScheduleTemplate[]
}

export default function CopyModelWeekDialog({
  open,
  onOpenChange,
  sourceWeekStartDate,
  templates,
}: Props) {
  const [targetRange, setTargetRange] = useState<DateRange | undefined>(undefined)
  const [actionLoading, setActionLoading] = useState(false)

  const copyModelWeek = useMutation(api.classSchedules.copyModelWeekToDateRange)

  const todayStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])

  const canSubmit = templates.length > 0

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('No hay un modelo de semana para copiar.')
      return
    }

    if (!targetRange?.from) {
      toast.error('Selecciona un rango de fechas.')
      return
    }

    const rangeFrom = targetRange.from
    const rangeTo = targetRange.to ?? rangeFrom

    const targetStartWeek = startOfWeek(rangeFrom, { weekStartsOn: 1 })
    const targetEndWeek = startOfWeek(rangeTo, { weekStartsOn: 1 })

    const targetWeekStarts: number[] = []
    let current = targetStartWeek
    while (current.getTime() <= targetEndWeek.getTime()) {
      targetWeekStarts.push(current.getTime())
      current = addDays(current, 7)
    }

    if (targetWeekStarts.length === 0) {
      toast.error('Seleccioná al menos una semana válida.')
      return
    }

    setActionLoading(true)
    try {
      const result = await copyModelWeek({
        sourceWeekStartDate,
        templates,
        targetWeekStarts,
      })

      toast.success(
        `Se copiaron ${result.createdSchedules} turnos en ${result.batchesCreated} lote(s).`
      )
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al copiar la semana.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTargetRange(undefined)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar semana (modelo)</DialogTitle>
          <DialogDescription>
            Genera turnos en el/los rangos seleccionados copiando el modelo de la
            semana actual (incluye turnos fijos).
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Rango de fechas</FieldLabel>
          <FieldDescription>
            Desde qué semana hasta qué semana se copiará el modelo.
          </FieldDescription>
          <Calendar
            mode='range'
            selected={targetRange}
            onSelect={(range) => setTargetRange(range)}
            numberOfMonths={2}
            showOutsideDays={false}
            locale={es}
            disabled={(date) =>
              date.getTime() < todayStart || actionLoading
            }
            className='rounded-md border'
          />
        </Field>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={actionLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={actionLoading || !canSubmit}>
            Copiar semana
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

