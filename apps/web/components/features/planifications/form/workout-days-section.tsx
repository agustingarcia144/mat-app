'use client'

import { useState } from 'react'
import { UseFormReturn, useFieldArray, Controller } from 'react-hook-form'
import { Plus, GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ExerciseSelector from '@/components/features/planifications/exercises/exercise-selector'
import ExerciseFormRow from '@/components/features/planifications/form/exercise-form-row'
import {
  Field,
  FieldLabel,
  FieldError,
} from '@/components/ui/field'
import { PlanificationForm } from '@repo/core/schemas'

interface WorkoutDaysSectionProps {
  form: UseFormReturn<PlanificationForm>
}

export default function WorkoutDaysSection({ form }: WorkoutDaysSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'workoutDays',
  })

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())

  const addDay = () => {
    const newIndex = fields.length
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${fields.length + 1}`,
      exercises: [],
    })
    setExpandedDays(new Set([...Array.from(expandedDays), newIndex]))
  }

  const addExerciseToDay = (
    dayIndex: number,
    exercise: { id: string; name: string }
  ) => {
    const currentDay = form.getValues(`workoutDays.${dayIndex}`)
    form.setValue(`workoutDays.${dayIndex}.exercises`, [
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
    ])
  }

  const removeExercise = (dayIndex: number, exerciseIndex: number) => {
    const currentDay = form.getValues(`workoutDays.${dayIndex}`)
    form.setValue(
      `workoutDays.${dayIndex}.exercises`,
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

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Días de entrenamiento</h2>
        <Button type="button" onClick={addDay} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Agregar día
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No hay días agregados</p>
          <p className="text-sm">
            Haz clic en &quot;Agregar día&quot; para comenzar
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((field, dayIndex) => {
            const isExpanded = expandedDays.has(dayIndex)
            const day = form.watch(`workoutDays.${dayIndex}`)
            
            return (
              <div key={field.id} className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  
                  <Controller
                    name={`workoutDays.${dayIndex}.name`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="flex-1">
                        <Input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          placeholder="Nombre del día"
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleDayExpanded(dayIndex)}
                  >
                    <span className="text-sm">{isExpanded ? '−' : '+'}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(dayIndex)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="space-y-2 ml-7">
                    {day?.exercises?.map((exercise, exerciseIndex) => (
                      <ExerciseFormRow
                        key={exercise.id}
                        dayIndex={dayIndex}
                        exerciseIndex={exerciseIndex}
                        form={form}
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
