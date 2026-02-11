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
      blocks: [],
      exercises: [],
    })
    setExpandedDays(new Set([...Array.from(expandedDays), newIndex]))
  }

  const addBlockToDay = (dayIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const currentBlocks = currentDay.blocks || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
      [
        ...currentBlocks,
        {
          id: `temp-block-${Date.now()}`,
          name: `Bloque ${currentBlocks.length + 1}`,
          order: currentBlocks.length,
          notes: '',
        },
      ]
    )
  }

  const removeBlockFromDay = (dayIndex: number, blockIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const block = currentDay.blocks?.[blockIndex]
    if (!block) return

    // Remove block
    const newBlocks = currentDay.blocks?.filter((_, i) => i !== blockIndex) || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
      newBlocks
    )

    // Remove blockId from exercises that were in this block
    const exercises = currentDay.exercises || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      exercises.map((ex) =>
        ex.blockId === block.id ? { ...ex, blockId: undefined, blockName: undefined } : ex
      )
    )
  }

  const addExerciseToDay = (
    dayIndex: number,
    exercise: { id: string; name: string },
    blockId?: string
  ) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const block = currentDay.blocks?.find((b) => b.id === blockId)
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      [
        ...currentDay.exercises,
        {
          id: `temp-ex-${Date.now()}`,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          blockId: blockId,
          blockName: block?.name,
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
    // Create new block IDs for copied blocks
    const newBlocks = (currentDay.blocks || []).map((block, idx) => ({
      ...block,
      id: `temp-block-${Date.now()}-${idx}`,
    }))
    // Create new exercise IDs and update block references
    const newExercises = (currentDay.exercises || []).map((ex, idx) => {
      const newBlockId = ex.blockId
        ? newBlocks.find((b, i) => (currentDay.blocks || [])[i]?.id === ex.blockId)?.id
        : undefined
      return {
        ...ex,
        id: `temp-ex-${Date.now()}-${idx}`,
        blockId: newBlockId,
      }
    })
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${fields.length + 1}`,
      dayOfWeek: currentDay.dayOfWeek,
      blocks: newBlocks,
      exercises: newExercises,
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
                  <div className="space-y-3 ml-11">
                    {/* Blocks */}
                    {day?.blocks?.map((block, blockIndex) => {
                      const blockExercises = (day.exercises || []).filter(
                        (ex) => ex.blockId === block.id
                      )
                      return (
                        <div
                          key={block.id}
                          className="border-l-2 border-primary/30 pl-3 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <Controller
                              name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks.${blockIndex}.name`}
                              control={form.control}
                              render={({ field, fieldState }) => (
                                <Field
                                  data-invalid={fieldState.invalid}
                                  className="flex-1"
                                >
                                  <Input
                                    {...field}
                                    aria-invalid={fieldState.invalid}
                                    placeholder="Nombre del bloque"
                                    className="h-8 font-medium"
                                  />
                                  {fieldState.invalid && (
                                    <FieldError errors={[fieldState.error]} />
                                  )}
                                </Field>
                              )}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                removeBlockFromDay(dayIndex, blockIndex)
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="space-y-2 ml-2">
                            {blockExercises.map((exercise) => {
                              const exerciseIndex = day.exercises?.findIndex(
                                (e) => e.id === exercise.id
                              )
                              if (exerciseIndex === undefined || exerciseIndex === -1)
                                return null
                              return (
                                <ExerciseFormRow
                                  key={exercise.id}
                                  dayIndex={dayIndex}
                                  exerciseIndex={exerciseIndex}
                                  form={form}
                                  weekIndex={weekIndex}
                                  onRemove={() =>
                                    removeExercise(dayIndex, exerciseIndex)
                                  }
                                />
                              )
                            })}
                            <ExerciseSelector
                              onSelect={(ex) =>
                                addExerciseToDay(dayIndex, ex, block.id)
                              }
                            />
                          </div>
                        </div>
                      )
                    })}

                    {/* Unblocked exercises */}
                    {(() => {
                      const unblockedExercises = (day.exercises || []).filter(
                        (ex) => !ex.blockId
                      )
                      if (unblockedExercises.length === 0 && !day.blocks?.length)
                        return null
                      return (
                        <div className="space-y-2">
                          {unblockedExercises.length > 0 && (
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              Sin bloque
                            </div>
                          )}
                          {unblockedExercises.map((exercise) => {
                            const exerciseIndex = day.exercises?.findIndex(
                              (e) => e.id === exercise.id
                            )
                            if (exerciseIndex === undefined || exerciseIndex === -1)
                              return null
                            return (
                              <ExerciseFormRow
                                key={exercise.id}
                                dayIndex={dayIndex}
                                exerciseIndex={exerciseIndex}
                                form={form}
                                weekIndex={weekIndex}
                                onRemove={() =>
                                  removeExercise(dayIndex, exerciseIndex)
                                }
                              />
                            )
                          })}
                          {unblockedExercises.length > 0 && (
                            <ExerciseSelector
                              onSelect={(ex) => addExerciseToDay(dayIndex, ex)}
                            />
                          )}
                        </div>
                      )
                    })()}

                    {/* Add Block Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addBlockToDay(dayIndex)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar bloque
                    </Button>

                    {/* Add Exercise Button (if no blocks) */}
                    {(!day.blocks || day.blocks.length === 0) && (
                      <ExerciseSelector
                        onSelect={(ex) => addExerciseToDay(dayIndex, ex)}
                      />
                    )}
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
