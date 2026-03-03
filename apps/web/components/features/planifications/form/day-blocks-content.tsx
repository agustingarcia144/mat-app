'use client'

import React, { useCallback } from 'react'
import { UseFormReturn, Controller } from 'react-hook-form'
import { Trash2, GripVertical, GripHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDraggable, useDroppable } from '@dnd-kit/react'
import ExerciseFormCard from '@/components/features/planifications/form/exercise-form-card'
import { Field, FieldError } from '@/components/ui/field'
import { PlanificationForm } from '@repo/core/schemas'

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export const BLOCK_PREFIX = 'block-'
export const EXERCISE_PREFIX = 'exercise-'
export const DROP_UNBLOCKED_ID = 'drop-unblocked'
export const DROP_BLOCK_PREFIX = 'drop-block-'
/** Default "Sin bloque" block id; don't persist this block if it has no exercises */
export const SIN_BLOQUE_ID = 'sin-bloque'

interface DayBlocksContentProps {
  form: UseFormReturn<PlanificationForm>
  weekIndex: number
  dayIndex: number
  day: {
    blocks?: Array<{ id: string; name: string; order: number; notes?: string }>
    exercises?: Array<{
      id: string
      blockId?: string
      blockName?: string
      [key: string]: unknown
    }>
  }
  onAddBlock: () => void
  onRemoveBlock: (blockIndex: number) => void
  onAddExercise: (
    exercise: { id: string; name: string },
    blockId?: string
  ) => void
  onRemoveExercise: (exerciseIndex: number) => void
}

function SortableBlockColumn({
  blockId,
  header,
  children,
}: {
  blockId: string
  header: React.ReactNode
  children: React.ReactNode
}) {
  const id = `${BLOCK_PREFIX}${blockId}`
  const { ref, handleRef, isDragging } = useDraggable({ id })
  const { ref: dropRef, isDropTarget } = useDroppable({ id })
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref(el)
      dropRef(el)
    },
    [ref, dropRef]
  )
  return (
    <div
      ref={setRef}
      className={`isolate flex flex-col min-h-0 items-stretch w-48 shrink-0 rounded-lg border bg-muted/30 overflow-hidden backface-hidden transform-[translateZ(0)] ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-primary/50' : ''}`}
    >
      <div
        ref={handleRef as (el: HTMLDivElement | null) => void}
        className="flex shrink-0 items-center justify-center cursor-grab active:cursor-grabbing touch-none text-muted-foreground py-1 border-b border-border/50 rounded-t-lg bg-muted/50"
        aria-hidden
      >
        <GripVertical className="h-4 w-4 rotate-90" />
      </div>
      {header}
      {children}
    </div>
  )
}

function SortableExerciseRow({
  exerciseId,
  children,
}: {
  exerciseId: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const id = `${EXERCISE_PREFIX}${exerciseId}`
  const { ref, handleRef, isDragging } = useDraggable({ id })
  const { ref: dropRef, isDropTarget } = useDroppable({ id })
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref(el)
      dropRef(el)
    },
    [ref, dropRef]
  )
  const handleNode = (
    <div
      ref={handleRef as (el: HTMLDivElement | null) => void}
        className="flex items-center justify-center cursor-grab active:cursor-grabbing touch-none text-muted-foreground py-1 border-b border-border rounded-t-lg bg-muted/50"
      aria-hidden
    >
      <GripHorizontal className="h-3.5 w-3.5" />
    </div>
  )
  return (
    <div
      ref={setRef}
      className={`${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-1 ring-primary/50 rounded-lg' : ''}`}
    >
      {children(handleNode)}
    </div>
  )
}

function BlockExercisesDropZone({
  blockId,
  children,
}: {
  blockId: string
  children: React.ReactNode
}) {
  const id = `${DROP_BLOCK_PREFIX}${blockId}`
  const { ref, isDropTarget } = useDroppable({ id })
  return (
    <div
      ref={ref as (el: HTMLDivElement | null) => void}
      className={`flex-1 min-h-0 flex flex-col rounded-md transition-colors overflow-hidden ${isDropTarget ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}
    >
      {children}
    </div>
  )
}

export default function DayBlocksContent({
  form,
  weekIndex,
  dayIndex,
  day,
  onAddBlock,
  onRemoveBlock,
  onAddExercise,
  onRemoveExercise,
}: DayBlocksContentProps) {
  const blocksPath = `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`
  const blocks = day?.blocks ?? []

  return (
    <div className="flex items-stretch gap-3 overflow-x-auto pb-2 min-h-[320px]">
      {blocks.map((block, blockIndex) => {
        const blockExercises = (day.exercises || []).filter(
          (ex) =>
            ex.blockId === block.id ||
            (block.id === SIN_BLOQUE_ID && !ex.blockId)
        )
        const isSinBloque = block.id === SIN_BLOQUE_ID
        const blockHeaderContent = (
          <div className="flex items-center gap-1.5 min-w-0 shrink-0 border-b border-border/50 p-1.5">
            <Controller
              name={`${blocksPath}.${blockIndex}.name` as any}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  className="flex-1 min-w-0"
                >
                  <Input
                    {...field}
                    value={String(field.value ?? '')}
                    aria-invalid={fieldState.invalid}
                    placeholder="Nombre del bloque"
                    className="h-7 text-xs font-medium border-0 shadow-none focus-visible:border focus-visible:border-input focus-visible:shadow-sm"
                    disabled={isSinBloque}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            {!isSinBloque && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onRemoveBlock(blockIndex)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        )
        return (
          <React.Fragment key={block.id}>
            {isSinBloque ? (
              <div className="flex flex-col min-h-0 items-stretch w-48 shrink-0 rounded-lg border bg-muted/30 overflow-hidden">
                <div className="shrink-0">
                  {blockHeaderContent}
                </div>
                <BlockExercisesDropZone blockId={block.id}>
                  <div className="flex flex-col gap-1.5 p-1.5 min-h-0 flex-1 overflow-y-auto">
                    {blockExercises.map((exercise) => {
                      const exerciseIndex = day.exercises?.findIndex(
                        (e) => e.id === exercise.id
                      )
                      if (exerciseIndex === undefined || exerciseIndex === -1)
                        return null
                      return (
                        <SortableExerciseRow
                          key={exercise.id}
                          exerciseId={exercise.id}
                        >
                          {(handle) => (
                            <ExerciseFormCard
                              dragHandle={handle}
                              dayIndex={dayIndex}
                              exerciseIndex={exerciseIndex}
                              form={form}
                              weekIndex={weekIndex}
                              onRemove={() => onRemoveExercise(exerciseIndex)}
                              exerciseId={
                                (exercise as { exerciseId?: string }).exerciseId
                              }
                            />
                          )}
                        </SortableExerciseRow>
                      )
                    })}
                  </div>
                </BlockExercisesDropZone>
              </div>
            ) : (
              <SortableBlockColumn
                blockId={block.id}
                header={blockHeaderContent}
              >
                <BlockExercisesDropZone blockId={block.id}>
                  <div className="flex flex-col gap-1.5 p-1.5 min-h-0 flex-1 overflow-y-auto">
                    {blockExercises.map((exercise) => {
                      const exerciseIndex = day.exercises?.findIndex(
                        (e) => e.id === exercise.id
                      )
                      if (exerciseIndex === undefined || exerciseIndex === -1)
                        return null
                      return (
                        <SortableExerciseRow
                          key={exercise.id}
                          exerciseId={exercise.id}
                        >
                          {(handle) => (
                            <ExerciseFormCard
                              dragHandle={handle}
                              dayIndex={dayIndex}
                              exerciseIndex={exerciseIndex}
                              form={form}
                              weekIndex={weekIndex}
                              onRemove={() => onRemoveExercise(exerciseIndex)}
                              exerciseId={
                                (exercise as { exerciseId?: string }).exerciseId
                              }
                            />
                          )}
                        </SortableExerciseRow>
                      )
                    })}
                  </div>
                </BlockExercisesDropZone>
              </SortableBlockColumn>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
