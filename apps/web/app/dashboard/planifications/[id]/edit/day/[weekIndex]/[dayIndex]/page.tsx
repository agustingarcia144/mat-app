'use client'

import { use, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DragDropProvider } from '@dnd-kit/react'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import {
  LibraryExerciseNamesProvider,
  useLibraryExerciseNames,
} from '@/contexts/library-exercise-names-context'
import { useFieldArray, Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import DayBlocksContent, {
  arrayMove,
  BLOCK_PREFIX,
  EXERCISE_PREFIX,
  DROP_UNBLOCKED_ID,
  DROP_BLOCK_PREFIX,
  SIN_BLOQUE_ID,
} from '@/components/features/planifications/form/day-blocks-content'
import { parseLibraryExerciseDragId } from '@/components/features/planifications/exercises/library-exercise-card'
import ExerciseSelector from '@/components/features/planifications/exercises/exercise-selector'
import { Field, FieldError } from '@/components/ui/field'
import type { PlanificationForm } from '@repo/core/schemas'

function DayEditDndContent({
  form,
  weekIndex,
  dayIndex,
  day,
  onAddBlock,
  onRemoveBlock,
  onAddExercise,
  onRemoveExercise,
}: {
  form: ReturnType<typeof usePlanificationForm>['form']
  weekIndex: number
  dayIndex: number
  day: PlanificationForm['workoutWeeks'][0]['workoutDays'][0]
  onAddBlock: () => void
  onRemoveBlock: (blockIndex: number) => void
  onAddExercise: (
    exercise: { id: string; name: string },
    blockId?: string
  ) => void
  onRemoveExercise: (exerciseIndex: number) => void
}) {
  const libraryNames = useLibraryExerciseNames()
  const blocksPath = `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`
  const exercisesPath = `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`

  const handleDragEnd = useCallback(
    (event: unknown) => {
      const op = (
        event as {
          operation?: { source?: { id?: string }; target?: { id?: string } }
        }
      )?.operation
      const source = op?.source
      const target = op?.target
      if (!source?.id || !target?.id || source.id === target.id) return

      const sourceId = String(source.id)
      const targetId = String(target.id)

      // Drop from library onto block or unblocked
      const libraryExerciseId = parseLibraryExerciseDragId(sourceId)
      if (libraryExerciseId != null) {
        const name =
          libraryNames?.getName(libraryExerciseId) ?? libraryExerciseId
        let blockId: string | undefined
        if (targetId === DROP_UNBLOCKED_ID) blockId = undefined
        else if (targetId.startsWith(DROP_BLOCK_PREFIX))
          blockId = targetId.slice(DROP_BLOCK_PREFIX.length)
        else if (targetId.startsWith(BLOCK_PREFIX))
          blockId = targetId.slice(BLOCK_PREFIX.length)
        else blockId = undefined
        if (targetId === DROP_UNBLOCKED_ID || blockId != null) {
          onAddExercise({ id: libraryExerciseId, name }, blockId)
        }
        return
      }

      // Reorder blocks
      if (
        sourceId.startsWith(BLOCK_PREFIX) &&
        targetId.startsWith(BLOCK_PREFIX)
      ) {
        const blocks =
          (form.getValues as (path: string) => { id: string }[])(blocksPath) ??
          []
        const fromIndex = blocks.findIndex(
          (b: { id: string }) => `${BLOCK_PREFIX}${b.id}` === sourceId
        )
        const toIndex = blocks.findIndex(
          (b: { id: string }) => `${BLOCK_PREFIX}${b.id}` === targetId
        )
        if (fromIndex === -1 || toIndex === -1) return
        form.setValue(
          blocksPath as any,
          arrayMove(blocks, fromIndex, toIndex) as any,
          { shouldDirty: true }
        )
        return
      }

      // Move or reorder exercise: target is another exercise (same or different block)
      if (
        sourceId.startsWith(EXERCISE_PREFIX) &&
        targetId.startsWith(EXERCISE_PREFIX)
      ) {
        const exercises =
          (
            form.getValues as (path: string) => {
              id: string
              blockId?: string
              blockName?: string
              [key: string]: unknown
            }[]
          )(exercisesPath) ?? []
        const blocks =
          (form.getValues as (path: string) => { id: string; name: string }[])(
            blocksPath
          ) ?? []
        const sourceExId = sourceId.slice(EXERCISE_PREFIX.length)
        const targetExId = targetId.slice(EXERCISE_PREFIX.length)
        const fromIdx = exercises.findIndex((e) => e.id === sourceExId)
        const toIdx = exercises.findIndex((e) => e.id === targetExId)
        if (fromIdx === -1 || toIdx === -1) return
        const targetBlockId = exercises[toIdx]?.blockId ?? SIN_BLOQUE_ID
        const targetBlock =
          targetBlockId === SIN_BLOQUE_ID
            ? { id: SIN_BLOQUE_ID, name: 'Sin bloque' }
            : blocks.find((b) => b.id === targetBlockId)
        const targetBlockName = targetBlock?.name ?? 'Sin bloque'
        const exerciseToMove = {
          ...exercises[fromIdx],
          blockId: targetBlockId,
          blockName: targetBlockName,
        }
        const newExercises = exercises.filter((e) => e.id !== sourceExId)
        const newToIdx = newExercises.findIndex((e) => e.id === targetExId)
        if (newToIdx === -1) return
        newExercises.splice(newToIdx, 0, exerciseToMove)
        form.setValue(exercisesPath as any, newExercises as any, {
          shouldDirty: true,
        })
        return
      }

      // Move exercise into a block drop zone (e.g. empty area of block)
      if (
        sourceId.startsWith(EXERCISE_PREFIX) &&
        (targetId.startsWith(DROP_BLOCK_PREFIX) || targetId.startsWith(BLOCK_PREFIX))
      ) {
        const targetBlockId = targetId.startsWith(DROP_BLOCK_PREFIX)
          ? targetId.slice(DROP_BLOCK_PREFIX.length)
          : targetId.slice(BLOCK_PREFIX.length)
        const exercises =
          (
            form.getValues as (path: string) => {
              id: string
              blockId?: string
              blockName?: string
              [key: string]: unknown
            }[]
          )(exercisesPath) ?? []
        const blocks =
          (form.getValues as (path: string) => { id: string; name: string }[])(
            blocksPath
          ) ?? []
        const sourceExId = sourceId.slice(EXERCISE_PREFIX.length)
        const fromIdx = exercises.findIndex((e) => e.id === sourceExId)
        if (fromIdx === -1) return
        const targetBlock =
          targetBlockId === SIN_BLOQUE_ID
            ? { id: SIN_BLOQUE_ID, name: 'Sin bloque' }
            : blocks.find((b) => b.id === targetBlockId)
        const targetBlockName = targetBlock?.name ?? 'Sin bloque'
        const exerciseToMove = {
          ...exercises[fromIdx],
          blockId: targetBlockId,
          blockName: targetBlockName,
        }
        const newExercises = exercises.filter((e) => e.id !== sourceExId)
        let insertIdx = 0
        newExercises.forEach((e, i) => {
          const inBlock =
            e.blockId === targetBlockId ||
            (targetBlockId === SIN_BLOQUE_ID && !e.blockId)
          if (inBlock) insertIdx = i + 1
        })
        newExercises.splice(insertIdx, 0, exerciseToMove)
        form.setValue(exercisesPath as any, newExercises as any, {
          shouldDirty: true,
        })
      }
    },
    [form, blocksPath, exercisesPath, libraryNames, onAddExercise]
  )

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[1fr_380px] gap-6 items-start min-w-0">
        <div className="space-y-6 rounded-lg border p-6 bg-background min-w-0">
          <div className="flex items-end justify-between gap-4">
            <Controller
              name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.name`}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  className="flex-1 min-w-0"
                >
                  <label className="text-sm font-medium mb-1.5 block">
                    Nombre del día
                  </label>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    placeholder="Ej: Día 1, Piernas, etc."
                    className="h-10"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddBlock}
              className="h-9 shrink-0 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Agregar bloque
            </Button>
          </div>

          <DayBlocksContent
            form={form}
            weekIndex={weekIndex}
            dayIndex={dayIndex}
            day={day ?? { exercises: [] }}
            onAddBlock={onAddBlock}
            onRemoveBlock={onRemoveBlock}
            onAddExercise={onAddExercise}
            onRemoveExercise={onRemoveExercise}
          />
        </div>

        <div className="rounded-lg border p-4 bg-background shrink-0 flex flex-col h-[calc(100vh-320px)] min-h-[280px]">
          <h2 className="text-sm font-semibold mb-3 shrink-0">
            Biblioteca de ejercicios
          </h2>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ExerciseSelector className="h-full" />
          </div>
        </div>
      </div>
    </DragDropProvider>
  )
}

export default function EditDayPage({
  params,
}: {
  params: Promise<{ id: string; weekIndex: string; dayIndex: string }>
}) {
  const { planificationId, form, onSubmit, isSaving, setRedirectAfterSave } =
    usePlanificationForm()
  // Subscribe to form values so this component re-renders when user edits (formState.isDirty
  // updates inside RHF but the consumer must re-render to run the toast effect).
  form.watch()
  const isDirty = form.formState.isDirty
  const handleSave = useCallback(
    () => form.handleSubmit(onSubmit)(),
    [form, onSubmit]
  )

  const toastId = 'day-unsaved-changes'
  useEffect(() => {
    if (isDirty) {
      toast.message('Tienes cambios sin guardar', {
        id: toastId,
        position: 'bottom-center',
        duration: Infinity,
        dismissible: false,
        action: {
          label: isSaving ? 'Guardando…' : 'Guardar cambios',
          onClick: () => {
            if (!isSaving) {
              toast.dismiss(toastId)
              handleSave()
            }
          },
        },
      })
    } else {
      toast.dismiss(toastId)
    }
  }, [isDirty, isSaving, handleSave])

  useEffect(() => {
    return () => {
      toast.dismiss(toastId)
    }
  }, [])

  useEffect(() => {
    setRedirectAfterSave('edit')
    return () => setRedirectAfterSave('view')
  }, [setRedirectAfterSave])

  const { weekIndex: weekIndexStr, dayIndex: dayIndexStr } = use(params)
  const weekIndex = Number(weekIndexStr)
  const dayIndex = Number(dayIndexStr)

  const { fields } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  })

  const day = form.watch(`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`)

  useEffect(() => {
    if (!day) return
    const blocks = day.blocks ?? []
    const hasSinBloque = blocks.some((b) => b.id === SIN_BLOQUE_ID)
    if (blocks.length === 0) {
      form.setValue(
        `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
        [
          {
            id: SIN_BLOQUE_ID,
            name: 'Sin bloque',
            order: 0,
            notes: '',
          },
        ]
      )
    } else if (!hasSinBloque) {
      form.setValue(
        `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
        [
          ...blocks,
          {
            id: SIN_BLOQUE_ID,
            name: 'Sin bloque',
            order: blocks.length,
            notes: '',
          },
        ]
      )
    }
  }, [day?.blocks, form, weekIndex, dayIndex, day])

  const addBlockToDay = () => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const currentBlocks = currentDay.blocks || []
    const newBlock = {
      id: `temp-block-${Date.now()}`,
      name: `Bloque ${currentBlocks.length + 1}`,
      order: currentBlocks.length,
      notes: '',
    }
    const lastBlock = currentBlocks[currentBlocks.length - 1]
    const newBlocks =
      lastBlock?.id === SIN_BLOQUE_ID
        ? [...currentBlocks.slice(0, -1), newBlock, lastBlock]
        : [...currentBlocks, newBlock]
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
      newBlocks,
      { shouldDirty: true }
    )
  }

  const removeBlockFromDay = (blockIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const block = currentDay.blocks?.[blockIndex]
    if (!block) return

    const newBlocks =
      currentDay.blocks?.filter((_, i) => i !== blockIndex) || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
      newBlocks,
      { shouldDirty: true }
    )

    const exercises = currentDay.exercises || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      exercises.map((ex) =>
        ex.blockId === block.id
          ? { ...ex, blockId: undefined, blockName: undefined }
          : ex
      ),
      { shouldDirty: true }
    )
  }

  const addExerciseToDay = useCallback(
    (exercise: { id: string; name: string }, blockId?: string) => {
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
        ],
        { shouldDirty: true }
      )
    },
    [form, weekIndex, dayIndex]
  )

  const removeExercise = (exerciseIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      currentDay.exercises.filter((_, i) => i !== exerciseIndex),
      { shouldDirty: true }
    )
  }

  if (dayIndex < 0 || dayIndex >= fields.length) {
    return (
      <div className="w-full py-6">
        <p className="text-destructive">Día no encontrado.</p>
        <Button variant="link" asChild className="mt-2">
          <Link href={`/dashboard/planifications/${planificationId}/edit`}>
            Volver a la planificación
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/dashboard/planifications/${planificationId}/edit`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al calendario
          </Link>
        </Button>

        <h1 className="text-2xl font-bold">Editar día</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Los cambios se guardan al hacer clic en &quot;Guardar cambios&quot; en
          la planificación.
        </p>
      </div>

      <LibraryExerciseNamesProvider>
        <DayEditDndContent
          form={form}
          weekIndex={weekIndex}
          dayIndex={dayIndex}
          day={day ?? { exercises: [] }}
          onAddBlock={addBlockToDay}
          onRemoveBlock={removeBlockFromDay}
          onAddExercise={addExerciseToDay}
          onRemoveExercise={removeExercise}
        />
      </LibraryExerciseNamesProvider>
    </div>
  )
}
