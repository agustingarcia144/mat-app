'use client'

import Image from 'next/image'
import { useState } from 'react'
import { UseFormReturn, useFieldArray, Controller } from 'react-hook-form'
import { Plus, ChevronDown, ChevronUp, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import WeekCalendarRow from '@/components/features/planifications/form/week-calendar-row'
import { Field, FieldError } from '@/components/ui/field'
import { usePlanificationFormOptional } from '@/contexts/planification-form-context'
import { PlanificationForm } from '@repo/core/schemas'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import matWolfLooking from '@/assets/mat-wolf-looking.png'

interface WorkoutWeeksSectionProps {
  form: UseFormReturn<PlanificationForm>
}

export default function WorkoutWeeksSection({
  form,
}: WorkoutWeeksSectionProps) {
  const { planificationId } = usePlanificationFormOptional()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'workoutWeeks',
  })

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(
    new Set([0])
  )

  const addWeek = () => {
    const newIndex = fields.length
    append({
      id: `temp-${Date.now()}`,
      name: `Semana ${fields.length + 1}`,
      workoutDays: [],
    })
    setExpandedWeeks(new Set([...Array.from(expandedWeeks), newIndex]))
  }

  const toggleWeekExpanded = (weekIndex: number) => {
    const newExpanded = new Set(expandedWeeks)
    if (newExpanded.has(weekIndex)) {
      newExpanded.delete(weekIndex)
    } else {
      newExpanded.add(weekIndex)
    }
    setExpandedWeeks(newExpanded)
  }

  const copyWeek = (weekIndex: number) => {
    const currentWeek = form.getValues(`workoutWeeks.${weekIndex}`)
    append({
      id: `temp-${Date.now()}`,
      name: `Semana ${fields.length + 1}`,
      workoutDays: currentWeek.workoutDays.map((day) => ({
        ...day,
        id: `temp-${Date.now()}-${Math.random()}`,
        exercises: day.exercises.map((ex) => ({
          ...ex,
          id: `temp-ex-${Date.now()}-${Math.random()}`,
        })),
      })),
    })
  }

  const canDeleteWeek = fields.length > 1

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Semanas de entrenamiento</h2>
        <Button type="button" onClick={addWeek} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Agregar semana
        </Button>
      </div>

      {fields.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-16 w-16 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>No hay semanas agregadas</EmptyTitle>
            <EmptyDescription>
              Haz clic en &quot;Agregar semana&quot; para comenzar
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {fields.map((field, weekIndex) => {
            const isExpanded = expandedWeeks.has(weekIndex)
            const week = form.watch(`workoutWeeks.${weekIndex}`)
            const dayCount = week?.workoutDays?.length || 0
            const exerciseCount =
              week?.workoutDays?.reduce(
                (acc, day) => acc + (day.exercises?.length || 0),
                0
              ) || 0

            return (
              <div
                key={field.id}
                className="border rounded-lg p-4 bg-muted/30"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleWeekExpanded(weekIndex)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </Button>

                  <Controller
                    name={`workoutWeeks.${weekIndex}.name`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        className="flex-1"
                      >
                        <Input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          placeholder="Nombre de la semana"
                          className="font-medium"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {!isExpanded && (
                    <div className="text-sm text-muted-foreground">
                      {dayCount} {dayCount === 1 ? 'día' : 'días'} •{' '}
                      {exerciseCount}{' '}
                      {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                    </div>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => copyWeek(weekIndex)}
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copiar semana</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(weekIndex)}
                        disabled={!canDeleteWeek}
                      >
                        <Trash2
                          className={`h-4 w-4 ${canDeleteWeek ? 'text-destructive' : 'text-muted-foreground/50'}`}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {canDeleteWeek
                        ? 'Eliminar semana'
                        : 'Debe tener al menos una semana'}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {isExpanded && (
                  <div className="ml-11 mt-4">
                    <WeekCalendarRow
                      form={form}
                      weekIndex={weekIndex}
                      planificationId={planificationId}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
