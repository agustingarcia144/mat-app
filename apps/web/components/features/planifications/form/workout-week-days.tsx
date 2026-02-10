'use client'

import { useState } from 'react'
import { UseFormReturn, useFieldArray, Controller } from 'react-hook-form'
import { Plus, ChevronDown, ChevronUp, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ExerciseSelector from '@/components/features/planifications/exercises/exercise-selector'
import ExerciseFormRow from '@/components/features/planifications/form/exercise-form-row'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { PlanificationForm } from '@repo/core/schemas'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface WorkoutWeekDaysProps {
  form: UseFormReturn<PlanificationForm>
  weekIndex: number
}

export default function WorkoutWeekDays({
  form,
  weekIndex,
}: WorkoutWeekDaysProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  })

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())

  const DAY_OF_WEEK_OPTIONS = [
    { value: '__none__', label: 'Sin asignar' },
    { value: '1', label: 'Lunes' },
    { value: '2', label: 'Martes' },
    { value: '3', label: 'Miércoles' },
    { value: '4', label: 'Jueves' },
    { value: '5', label: 'Viernes' },
    { value: '6', label: 'Sábado' },
    { value: '7', label: 'Domingo' },
  ] as const

  const addDay = () => {
    const newIndex = fields.length
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${fields.length + 1}`,
      dayOfWeek: undefined,
      exercises: [],
    })
    setExpandedDays(new Set([...Array.from(expandedDays), newIndex]))
  }

  const addExerciseToDay = (
    dayIndex: number,
    exercise: { id: string; name: string }
  ) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      [
        ...currentDay.exercises,
        {
          id: `temp-ex-${Date.now()}`,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sets: 3,
          reps: '10',
          weight: '',
          notes: '',
        },
      ]
    )
  }

  const removeExercise = (dayIndex: number, exerciseIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      currentDay.exercises.filter((_, i) => i !== exerciseIndex)
    )
  }

  const toggleDayExpanded = (dayIndex: number) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(dayIndex)) {
      newExpanded.delete(dayIndex)
    } else {
      newExpanded.add(dayIndex)
    }
    setExpandedDays(newExpanded)
  }

  const copyDay = (dayIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${fields.length + 1}`,
      dayOfWeek: currentDay.dayOfWeek,
      exercises: currentDay.exercises,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Días de entrenamiento
        </h3>
        <Button type="button" onClick={addDay} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Agregar día
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <p>No hay días agregados en esta semana</p>
          <p className="text-xs">
            Haz clic en &quot;Agregar día&quot; para comenzar
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, dayIndex) => {
            const isExpanded = expandedDays.has(dayIndex)
            const day = form.watch(
              `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
            )

            return (
              <div
                key={field.id}
                className="border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleDayExpanded(dayIndex)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>

                  <Controller
                    name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.name`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        className="flex-1"
                      >
                        <Input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          placeholder="Nombre del día"
                          className="h-9"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.dayOfWeek`}
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={
                          field.value != null
                            ? String(field.value)
                            : '__none__'
                        }
                        onValueChange={(v) =>
                          field.onChange(
                            v === '__none__' ? undefined : Number(v)
                          )
                        }
                      >
                        <SelectTrigger className="w-[140px] h-9">
                          <SelectValue placeholder="Día semana" />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_OF_WEEK_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyDay(dayIndex)}
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copiar día</TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => remove(dayIndex)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="space-y-2 ml-11">
                    {day?.exercises?.map((exercise, exerciseIndex) => (
                      <ExerciseFormRow
                        key={exercise.id}
                        dayIndex={dayIndex}
                        exerciseIndex={exerciseIndex}
                        form={form}
                        weekIndex={weekIndex}
                        onRemove={() => removeExercise(dayIndex, exerciseIndex)}
                      />
                    ))}

                    <ExerciseSelector
                      onSelect={(ex) => addExerciseToDay(dayIndex, ex)}
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
