'use client'

import { UseFormReturn, Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  const day = form.watch(
    `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
  )
  const blocks = ((day as any)?.blocks || []) as Array<{ id: string; name: string }>

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{exercise?.exerciseName}</p>
        {blocks.length > 0 && (
          <Controller
            name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.blockId`}
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value || '__none__'}
                onValueChange={(v) => {
                  const selectedBlock = blocks.find((b: { id: string; name: string }) => b.id === v)
                  field.onChange(v === '__none__' ? undefined : v)
                  form.setValue(
                    `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.blockName`,
                    selectedBlock?.name
                  )
                }}
              >
                <SelectTrigger className="h-7 w-[140px] mt-1 text-xs">
                  <SelectValue placeholder="Sin bloque" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin bloque</SelectItem>
                  {blocks.map((block: { id: string; name: string }) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.sets`}
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
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.reps`}
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
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}.weight`}
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
