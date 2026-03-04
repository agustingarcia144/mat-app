'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ResponsiveActionButton } from '@/components/ui/responsive-action-button'
import { ArrowLeft, BookOpen, CalendarDays, Plus } from 'lucide-react'
import { DragDropProvider } from '@dnd-kit/react'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import {
  LibraryExerciseNamesProvider,
  useLibraryExerciseNames,
} from '@/contexts/library-exercise-names-context'
import { useUnsavedNavigationGuard } from '@/contexts/unsaved-changes-context'
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { PlanificationForm } from '@repo/core/schemas'

const XL_BREAKPOINT = 1280

function DayEditDndContent({
  form,
  weekIndex,
  dayIndex,
  day,
  onAddBlock,
  onRemoveBlock,
  onAddExercise,
  onRemoveExercise,
  isCompactLayout,
  librarySheetOpen,
  onLibrarySheetOpenChange,
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
  isCompactLayout: boolean
  librarySheetOpen: boolean
  onLibrarySheetOpenChange: (open: boolean) => void
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

  const contentArea = (
    <div className="space-y-6 p-6 min-w-0 flex-1 min-h-0 overflow-auto">
      <div className="flex items-end justify-between gap-4">
        <Controller
          name={`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.name`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="flex-1 min-w-0">
              <label className="text-sm font-medium mb-1.5 block">
                Nombre del día
              </label>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                placeholder="Ej: Día 1, Piernas, etc."
                className="h-10"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <div className="flex items-center gap-2 shrink-0">
          {isCompactLayout && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLibrarySheetOpenChange(true)}
              className="gap-2"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Biblioteca
            </Button>
          )}
          <ResponsiveActionButton
            type="button"
            variant="outline"
            mobileSize="sm"
            onClick={onAddBlock}
            icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
            label="Agregar bloque"
            tooltip="Agregar bloque"
            className="text-xs"
          />
        </div>
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
  )

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="rounded-lg border bg-background overflow-hidden h-full min-h-0 flex flex-col relative">
        {isCompactLayout ? (
          <>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {contentArea}
            </div>
            <Sheet
              open={librarySheetOpen}
              onOpenChange={onLibrarySheetOpenChange}
            >
              <SheetContent
                side="right"
                className="w-full sm:max-w-md overflow-hidden flex flex-col"
              >
                <SheetHeader>
                  <SheetTitle>Biblioteca de ejercicios</SheetTitle>
                  <SheetDescription>
                    Haz clic en un ejercicio para añadirlo al día. Luego puedes
                    arrastrarlo entre bloques.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 flex flex-col mt-4 overflow-hidden">
                  <ExerciseSelector
                    className="flex-1 min-h-0"
                    onSelect={(ex) => {
                      onAddExercise(ex, undefined)
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className="flex-1 min-h-0 w-full items-stretch"
          >
            <ResizablePanel
              defaultSize={75}
              minSize={55}
              className="min-w-0 flex flex-col min-h-0"
            >
              {contentArea}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              defaultSize={25}
              minSize={18}
              collapsible
              collapsedSize={0}
              className="min-w-0 flex flex-col min-h-0"
            >
              <div className="p-4 flex flex-col flex-1 min-h-0">
                <h2 className="text-sm font-semibold mb-3 shrink-0">
                  Biblioteca de ejercicios
                </h2>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <ExerciseSelector className="flex-1 min-h-0" />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
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
  const router = useRouter()
  const { requestNavigation } = useUnsavedNavigationGuard()
  const { planificationId, form, setRedirectAfterSave } = usePlanificationForm()
  const day = form.watch(`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`)

  useEffect(() => {
    setRedirectAfterSave('edit')
    return () => {
      setRedirectAfterSave('view')
    }
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
    const realBlocksCount = currentBlocks.filter(
      (b) => b.id !== SIN_BLOQUE_ID
    ).length
    const newBlock = {
      id: `temp-block-${Date.now()}`,
      name: `Bloque ${realBlocksCount + 1}`,
      order: realBlocksCount,
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
  const isCompactLayout = !useMediaQuery(`(min-width: ${XL_BREAKPOINT}px)`)
  const [librarySheetOpen, setLibrarySheetOpen] = useState(false)
  const [weekDaysDialogOpen, setWeekDaysDialogOpen] = useState(false)

  const week = form.watch(`workoutWeeks.${weekIndex}`)
  const weekDays = week?.workoutDays ?? []

  const handleBackClick = () => {
    if (!requestNavigation(backHref)) return
    router.push(backHref)
  }

  if (dayIndex < 0 || dayIndex >= fields.length) {
    return (
      <div className="w-full py-6">
        <Button
          variant="link"
          className="mt-2 gap-0 px-2 md:gap-2 md:px-3"
          onClick={handleBackClick}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="sr-only md:not-sr-only">Volver</span>
        </Button>
        <p className="text-destructive text-center">Día no encontrado.</p>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between gap-2 mr-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-0 px-2 md:gap-2 md:px-3"
          onClick={handleBackClick}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="sr-only md:not-sr-only">Volver</span>
        </Button>
        <Dialog open={weekDaysDialogOpen} onOpenChange={setWeekDaysDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label="Ver ejercicios de otros días de la semana"
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              <span className="sr-only md:not-sr-only">
                Ver días de la semana
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Ejercicios por día
                {week?.name && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    — {week.name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Revisa qué ejercicios tienes planificados en cada día para evitar
              repetirlos.
            </p>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
              {weekDays.map((d, idx) => {
                const exercises = d?.exercises ?? []
                const isCurrentDay = idx === dayIndex
                return (
                  <div
                    key={d?.id ?? idx}
                    className={`rounded-lg border p-3 ${
                      isCurrentDay ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {d?.name || `Día ${idx + 1}`}
                      </span>
                      {isCurrentDay && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                          Editando
                        </span>
                      )}
                    </div>
                    {exercises.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin ejercicios
                      </p>
                    ) : (
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {exercises.map((ex, exIdx) => (
                          <li key={ex?.id ?? exIdx}>
                            • {ex?.exerciseName ?? 'Ejercicio'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="w-full p-3 md:p-6 flex flex-col min-h-0 h-[calc(100vh-6rem)]">
        <div className="flex-1 min-h-0 flex flex-col">
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
              isCompactLayout={isCompactLayout}
              librarySheetOpen={librarySheetOpen}
              onLibrarySheetOpenChange={setLibrarySheetOpen}
            />
          </LibraryExerciseNamesProvider>
        </div>
      </div>
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
