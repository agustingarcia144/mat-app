'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

type DayForCompare = PlanificationForm['workoutWeeks'][0]['workoutDays'][0]

/** Normalize a day for comparison: ignore temp ids, treat "Sin bloque" consistently (empty blocks vs only Sin bloque = same). */
function normalizedDaySignature(day: DayForCompare | null | undefined): string {
  if (!day) return JSON.stringify({ name: '', blocks: [], exercises: [] })
  const userBlocks = (day.blocks ?? []).filter((b) => b.id !== SIN_BLOQUE_ID)
  const blocksKey = userBlocks
    .sort((a, b) => a.order - b.order)
    .map((b) => ({ name: b.name, order: b.order, notes: b.notes ?? '' }))
  const exercisesKey = (day.exercises ?? []).map((e) => ({
    exerciseId: e.exerciseId,
    blockId: e.blockId ?? SIN_BLOQUE_ID,
    sets: e.sets,
    reps: e.reps,
    weight: e.weight ?? '',
    timeSeconds: e.timeSeconds,
    notes: e.notes ?? '',
  }))
  return JSON.stringify({
    name: day.name ?? '',
    dayOfWeek: day.dayOfWeek,
    blocks: blocksKey,
    exercises: exercisesKey,
  })
}

function normalizedDayEqual(
  a: DayForCompare | null | undefined,
  b: DayForCompare | null | undefined
): boolean {
  return normalizedDaySignature(a) === normalizedDaySignature(b)
}

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
        (targetId.startsWith(DROP_BLOCK_PREFIX) ||
          targetId.startsWith(BLOCK_PREFIX))
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

export function DayEditPageContent({
  weekIndex,
  dayIndex,
}: {
  weekIndex: number
  dayIndex: number
}) {
  const searchParams = useSearchParams()
  const isNewDay = searchParams.get('new') === '1'
  const { planificationId, form, onSubmit, isSaving, setRedirectAfterSave } =
    usePlanificationForm()
  const toastId = 'day-unsaved-changes'
  const planificationToastId = 'planification-unsaved-changes'
  // Snapshot of form state when we entered this page; used by Descartar to revert and for unsaved detection.
  const entrySnapshotRef = useRef<PlanificationForm | null>(null)
  const [entrySnapshot, setEntrySnapshot] = useState<PlanificationForm | null>(
    null
  )

  useEffect(() => {
    if (entrySnapshotRef.current === null) {
      const snapshot = JSON.parse(
        JSON.stringify(form.getValues())
      ) as PlanificationForm
      entrySnapshotRef.current = snapshot
      // One-time snapshot for unsaved detection; state needed so we don't read ref during render.
      // eslint-disable-next-line -- run-once snapshot after mount
      setEntrySnapshot(snapshot)
    }
  }, [form])

  const initialDay =
    entrySnapshot?.workoutWeeks?.[weekIndex]?.workoutDays?.[dayIndex]
  // Only watch this day so we re-render when its data changes; persist happens on toast "Guardar cambios".
  const day = form.watch(`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`)
  const hasUnsavedChanges = isNewDay
    ? true
    : entrySnapshot === null
      ? false
      : !normalizedDayEqual(initialDay, day)

  const handleSave = useCallback(
    () =>
      form.handleSubmit(async (data) => {
        await onSubmit(data)
        toast.dismiss(toastId)
      })(),
    [form, onSubmit]
  )

  // Show toast only when there are unsaved changes; dismiss when user reverts or after save.
  // Dismiss the other page's toast so only one toast is visible when switching between edit and day edit.
  useEffect(() => {
    if (hasUnsavedChanges) {
      toast.dismiss(planificationToastId)
      toast.message('Tienes cambios sin guardar', {
        id: toastId,
        position: 'bottom-center',
        duration: Infinity,
        dismissible: false,
        action: {
          label: isSaving ? 'Guardando…' : 'Guardar cambios',
          onClick: () => {
            if (!isSaving) handleSave()
          },
        },
      })
    } else {
      toast.dismiss(toastId)
    }
  }, [hasUnsavedChanges, isSaving, handleSave])

  useEffect(() => {
    setRedirectAfterSave('edit')
    return () => setRedirectAfterSave('view')
  }, [setRedirectAfterSave])

  const { fields } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  })

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
            timeSeconds: undefined,
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

  const backHref = `/dashboard/planifications/${planificationId}/edit`

  if (dayIndex < 0 || dayIndex >= fields.length) {
    return (
      <div className="w-full py-6">
        <Button variant="link" asChild className="mt-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Link>
        </Button>
        <p className="text-destructive">Día no encontrado.</p>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
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

export default function EditDayPage({
  params,
}: {
  params: Promise<{ id: string; weekIndex: string; dayIndex: string }>
}) {
  const { weekIndex, dayIndex } = use(params)
  return (
    <DayEditPageContent
      weekIndex={Number(weekIndex)}
      dayIndex={Number(dayIndex)}
    />
  )
}
