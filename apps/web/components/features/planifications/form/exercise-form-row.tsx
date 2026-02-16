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
  weekIndex: number
  dayIndex: number
  exerciseIndex: number
  form: UseFormReturn<PlanificationForm>
  onRemove: () => void
}

export default function ExerciseFormRow({
  weekIndex,
  dayIndex,
  exerciseIndex,
  form,
  onRemove,
}: ExerciseFormRowProps) {
  const exercise = form.watch(
    `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}`
  )

  return (
    <div className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-md">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{exercise?.exerciseName}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Controller
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.sets`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-12">
              <Input
                {...field}
                type="number"
                min="1"
                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                aria-invalid={fieldState.invalid}
                placeholder="S"
                className="h-7 text-center text-xs"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <span className="text-muted-foreground text-xs">×</span>

        <Controller
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.reps`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-14">
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                placeholder="R"
                className="h-7 text-center text-xs"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.weight`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="w-16">
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                placeholder="Peso"
                className="h-7 text-xs"
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
          onClick={onRemove}
          className="h-7 w-7 shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
