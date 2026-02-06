'use client'

import { UseFormReturn, Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
  Field,
  FieldError,
} from '@/components/ui/field'
import { PlanificationForm } from '@repo/core/schemas'

interface ExerciseFormRowProps {
  dayIndex: number
  exerciseIndex: number
  form: UseFormReturn<PlanificationForm>
  onRemove: () => void
}

export default function ExerciseFormRow({
  dayIndex,
  exerciseIndex,
  form,
  onRemove,
}: ExerciseFormRowProps) {
  const exercise = form.watch(
    `workoutDays.${dayIndex}.exercises.${exerciseIndex}`
  )

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{exercise?.exerciseName}</p>
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name={`workoutDays.${dayIndex}.exercises.${exerciseIndex}.sets`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-16">
              <Input
                {...field}
                type="number"
                min="1"
                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                aria-invalid={fieldState.invalid}
                placeholder="Sets"
                className="h-8 text-center"
              />
              <span className="text-xs text-muted-foreground text-center block mt-0.5">
                series
              </span>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <span className="text-muted-foreground">×</span>

        <Controller
          name={`workoutDays.${dayIndex}.exercises.${exerciseIndex}.reps`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-20">
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                placeholder="Reps"
                className="h-8 text-center"
              />
              <span className="text-xs text-muted-foreground text-center block mt-0.5">
                reps
              </span>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name={`workoutDays.${dayIndex}.exercises.${exerciseIndex}.weight`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-24">
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                placeholder="Peso"
                className="h-8"
              />
              <span className="text-xs text-muted-foreground text-center block mt-0.5">
                peso
              </span>
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
          onClick={onRemove}
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
