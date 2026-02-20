'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { UseFormReturn, useFieldArray, useWatch } from 'react-hook-form'
import {
  Plus,
  Trash2,
  Copy,
  Pencil,
  GripVertical,
  MoreVertical,
  ChevronDown,
} from 'lucide-react'
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  useDragDropMonitor,
} from '@dnd-kit/react'
import { Button } from '@/components/ui/button'
import DayBlocksContent from '@/components/features/planifications/form/day-blocks-content'
import { PlanificationForm } from '@repo/core/schemas'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useIsMobile } from '@/hooks/use-mobile'

const DAY_CARD_PREFIX = 'day-card-'
const WEEKDAY_DROP_PREFIX = 'weekday-drop-'
const EMPTY_WORKOUT_DAYS: PlanificationForm['workoutWeeks'][0]['workoutDays'] = []

/** Must be a direct child of DragDropProvider so useDragDropMonitor receives the manager. */
function DragEndMonitor({
  onDragEnd,
  children,
}: {
  onDragEnd: (event: unknown, manager?: unknown) => void
  children: React.ReactNode
}) {
  useDragDropMonitor({ onDragEnd })
  return <>{children}</>
}

const DAY_NAMES = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const

function DraggableDayCard({
  weekIndex,
  dayIndex,
  children,
  withHandle,
}: {
  weekIndex: number
  dayIndex: number
  children: React.ReactNode
  withHandle?: boolean
}) {
  const id = `${DAY_CARD_PREFIX}${weekIndex}-${dayIndex}`
  const { ref, handleRef, isDragging } = useDraggable({ id })
  // Important: don't allow the active draggable to "drop onto itself".
  // If we do, the target can resolve to the source element and the operation looks like a no-op,
  // which makes moves between weekday columns feel like the item "snaps back".
  const { ref: dropRef, isDropTarget } = useDroppable({
    id,
    accept: (source: { id?: unknown }) => {
      const sourceId = String(source?.id ?? '')
      return sourceId.startsWith(DAY_CARD_PREFIX) && sourceId !== id
    },
  })
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
      className="flex items-center justify-center cursor-grab active:cursor-grabbing touch-none text-muted-foreground shrink-0 rounded-l border border-r-0 border-border py-1 px-1"
      aria-hidden
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  )
  return (
    <div
      ref={setRef}
      className={`${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-primary/50' : ''}`}
    >
      {withHandle ? (
        <div className="flex items-stretch gap-0 min-w-0 rounded-lg overflow-hidden border border-border">
          {handleNode}
          <div className="flex-1 min-w-0 bg-background">
            {children}
          </div>
        </div>
      ) : (
        <div
          ref={handleRef as (el: HTMLDivElement | null) => void}
          className="cursor-grab active:cursor-grabbing rounded-lg border border-border"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function WeekdayDropZone({
  weekIndex,
  dow,
  children,
  className,
}: {
  weekIndex: number
  dow: number
  children?: React.ReactNode
  className?: string
}) {
  const id = `${WEEKDAY_DROP_PREFIX}${weekIndex}-${dow}`
  const { ref, isDropTarget } = useDroppable({
    id,
    accept: (source: { id?: unknown }) =>
      String(source?.id ?? '').startsWith(DAY_CARD_PREFIX),
  })
  return (
    <div
      ref={ref as (el: HTMLDivElement | null) => void}
      className={`${className ?? ''} ${isDropTarget ? 'ring-2 ring-primary/50 bg-primary/5 rounded-lg min-h-[60px]' : ''}`}
    >
      {children ?? null}
    </div>
  )
}

/** Single day card used for both edit and new planification flows. */
function DayCardContent({
  day,
  blockCount,
  exerciseCount,
  isSummaryMode,
  planificationId,
  weekIndex,
  dayIndex,
  fieldId,
  isExpanded,
  exercisesVisible,
  onToggleExpand,
  onCopyDay,
  onRemove,
  onToggleExercisesVisible,
  expandedContent,
}: {
  day: any
  blockCount: number
  exerciseCount: number
  isSummaryMode: boolean
  planificationId?: string | null
  weekIndex: number
  dayIndex: number
  fieldId: string
  isExpanded: boolean
  exercisesVisible: boolean
  onToggleExpand: (fieldId: string) => void
  onCopyDay: (dayIndex: number) => void
  onRemove: (dayIndex: number) => void
  onToggleExercisesVisible: (fieldId: string) => void
  expandedContent: React.ReactNode
}) {
  return (
    <div className="p-2 text-sm flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-medium truncate flex-1" title={day?.name}>
          {day?.name || 'Sin nombre'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Abrir menú del día"
            >
              <MoreVertical className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isSummaryMode ? (
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/planifications/${planificationId}/edit/day/${weekIndex}/${dayIndex}`}
                  className="flex items-center gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => onToggleExpand(fieldId)}
                className="flex items-center gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                {isExpanded ? 'Cerrar' : 'Editar'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onCopyDay(dayIndex)}>
              <Copy className="h-3.5 w-3.5" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onRemove(dayIndex)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground">
        {blockCount} {blockCount === 1 ? 'bloque' : 'bloques'} · {exerciseCount}{' '}
        {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
      </p>
      {exerciseCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => onToggleExercisesVisible(fieldId)}
            className="text-xs text-primary hover:underline text-left"
          >
            {exercisesVisible ? 'Ocultar ejercicios' : 'Ver ejercicios'}
          </button>
          {exercisesVisible && (
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside max-h-24 overflow-y-auto">
              {(day?.exercises ?? []).map((ex: any) => (
                <li key={ex.id} className="truncate">
                  {ex.exerciseName}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {expandedContent}
    </div>
  )
}

interface WeekCalendarRowProps {
  form: UseFormReturn<PlanificationForm>
  weekIndex: number
  /** When set, calendar shows summary cards with links to day edit page. When absent (create flow), shows inline editing. */
  planificationId?: string | null
}

export default function WeekCalendarRow({
  form,
  weekIndex,
  planificationId,
}: WeekCalendarRowProps) {
  const isMobile = useIsMobile()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  })

  // Use a proper subscription so UI always rerenders on nested dayOfWeek changes.
  // Also compute `daysByWeekday` directly per-render to avoid stale memoization when
  // react-hook-form mutates arrays/objects in-place (same reference).
  const workoutDays =
    useWatch({
      control: form.control,
      name: `workoutWeeks.${weekIndex}.workoutDays`,
    }) ?? EMPTY_WORKOUT_DAYS

  const daysByWeekday = (() => {
    const map = new Map<number, number[]>()
    for (let dow = 1; dow <= 7; dow++) map.set(dow, [])
    workoutDays.forEach((day, index) => {
      const dow = day?.dayOfWeek ?? 1
      map.get(dow >= 1 && dow <= 7 ? dow : 1)!.push(index)
    })
    return map
  })()

  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set())
  const [exercisesVisibleDayIds, setExercisesVisibleDayIds] = useState<Set<string>>(new Set())
  const [expandedWeekdays, setExpandedWeekdays] = useState<Set<number>>(
    new Set(DAY_NAMES.map((day) => day.value))
  )
  const nextIdRef = useRef(0)

  const addDay = (dayOfWeek: number) => {
    if (planificationId) {
      return // Navigation handled by Link (edit flow)
    }
    const newId = `temp-${++nextIdRef.current}`
    append({
      id: newId,
      name: `Día ${fields.length + 1}`,
      dayOfWeek,
      blocks: [],
      exercises: [],
    })
    setExpandedDayIds(new Set([...Array.from(expandedDayIds), newId]))
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
          id: `temp-block-${++nextIdRef.current}`,
          name: `Bloque ${currentBlocks.length + 1}`,
          order: currentBlocks.length,
          notes: '',
        },
      ],
      { shouldDirty: true }
    )
  }

  const removeBlockFromDay = (dayIndex: number, blockIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const block = currentDay.blocks?.[blockIndex]
    if (!block) return

    const newBlocks = currentDay.blocks?.filter((_, i) => i !== blockIndex) || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.blocks`,
      newBlocks,
      { shouldDirty: true }
    )

    const exercises = currentDay.exercises || []
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      exercises.map((ex) =>
        ex.blockId === block.id ? { ...ex, blockId: undefined, blockName: undefined } : ex
      ),
      { shouldDirty: true }
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
          id: `temp-ex-${++nextIdRef.current}`,
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
  }

  const removeExercise = (dayIndex: number, exerciseIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    form.setValue(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises`,
      currentDay.exercises.filter((_, i) => i !== exerciseIndex),
      { shouldDirty: true }
    )
  }

  const toggleDayExpanded = (fieldId: string) => {
    const newExpanded = new Set(expandedDayIds)
    if (newExpanded.has(fieldId)) {
      newExpanded.delete(fieldId)
    } else {
      newExpanded.add(fieldId)
    }
    setExpandedDayIds(newExpanded)
  }

  const toggleExercisesVisible = (fieldId: string) => {
    const next = new Set(exercisesVisibleDayIds)
    if (next.has(fieldId)) next.delete(fieldId)
    else next.add(fieldId)
    setExercisesVisibleDayIds(next)
  }

  const onDragEndCallback = useCallback(
    (event: any, manager?: any) => {
      if (event?.canceled) return
      const op =
        event?.operation ??
        manager?.dragOperation ??
        manager?.operation ??
        event?.detail?.operation
      const sourceId = String(op?.source?.id ?? '')
      const targetId = String(op?.target?.id ?? '')
      if (!sourceId || !targetId || sourceId === targetId) return

      if (!sourceId.startsWith(DAY_CARD_PREFIX)) return

      let targetDow: number

      if (targetId.startsWith(DAY_CARD_PREFIX)) {
        // Dropped on another day card: move to that day's column
        const targetSuffix = targetId.slice(DAY_CARD_PREFIX.length)
        const targetParts = targetSuffix.split('-')
        const targetWeek = parseInt(targetParts[0], 10)
        const targetDayIndex = parseInt(targetParts[1], 10)
        if (
          Number.isNaN(targetDayIndex) ||
          targetWeek !== weekIndex
        )
          return
        const targetDay = form.getValues(
          `workoutWeeks.${weekIndex}.workoutDays.${targetDayIndex}`
        )
        targetDow = targetDay?.dayOfWeek ?? 1
        if (targetDow < 1 || targetDow > 7) targetDow = 1
      } else if (targetId.startsWith(WEEKDAY_DROP_PREFIX)) {
        // Dropped on weekday zone
        const targetSuffix = targetId.slice(WEEKDAY_DROP_PREFIX.length)
        const targetParts = targetSuffix.split('-')
        const targetWeek = parseInt(targetParts[0], 10)
        targetDow = parseInt(targetParts[1], 10)
        if (
          Number.isNaN(targetDow) ||
          targetWeek !== weekIndex ||
          targetDow < 1 ||
          targetDow > 7
        )
          return
      } else {
        return
      }

      const sourceSuffix = sourceId.slice(DAY_CARD_PREFIX.length)
      const sourceParts = sourceSuffix.split('-')
      const sourceWeek = parseInt(sourceParts[0], 10)
      const sourceDayIndex = parseInt(sourceParts[1], 10)
      if (
        Number.isNaN(sourceDayIndex) ||
        sourceWeek !== weekIndex
      )
        return

      form.setValue(
        `workoutWeeks.${weekIndex}.workoutDays.${sourceDayIndex}.dayOfWeek`,
        targetDow as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        { shouldDirty: true }
      )
    },
    [form, weekIndex]
  )

  const copyDay = (dayIndex: number) => {
    const currentDay = form.getValues(
      `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`
    )
    const newBlocks = (currentDay.blocks || []).map((block) => ({
      ...block,
      id: `temp-block-${++nextIdRef.current}`,
    }))
    const newExercises = (currentDay.exercises || []).map((ex) => {
      const newBlockId = ex.blockId
        ? newBlocks.find((b, i) => (currentDay.blocks || [])[i]?.id === ex.blockId)?.id
        : undefined
      return {
        ...ex,
        id: `temp-ex-${++nextIdRef.current}`,
        blockId: newBlockId,
      }
    })
    const dayOfWeek = currentDay.dayOfWeek ?? 1
    append({
      id: `temp-${++nextIdRef.current}`,
      name: `Día ${fields.length + 1}`,
      dayOfWeek,
      blocks: newBlocks,
      exercises: newExercises,
    })
  }

  const isSummaryMode = !!planificationId
  const toggleWeekdayExpanded = (dayOfWeek: number) => {
    const next = new Set(expandedWeekdays)
    if (next.has(dayOfWeek)) next.delete(dayOfWeek)
    else next.add(dayOfWeek)
    setExpandedWeekdays(next)
  }

  const renderAddDayButton = (dayOfWeek: number) => {
    if (isSummaryMode) {
      return (
        <Button variant='ghost' size='icon' className='h-7 w-7' asChild>
          <Link
            href={`/dashboard/planifications/${planificationId}/edit/day/new?weekIndex=${weekIndex}&dayOfWeek=${dayOfWeek}`}
          >
            <Plus className='h-3.5 w-3.5 text-muted-foreground' />
          </Link>
        </Button>
      )
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={() => addDay(dayOfWeek)}
          >
            <Plus className='h-3.5 w-3.5 text-muted-foreground' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Agregar día</TooltipContent>
      </Tooltip>
    )
  }

  const renderDayCards = (dayIndices: number[]) =>
    dayIndices.map((dayIndex) => {
      const field = fields[dayIndex]
      if (!field) return null

      const day = form.watch(`workoutWeeks.${weekIndex}.workoutDays.${dayIndex}`)
      const blockCount = day?.blocks?.length ?? 0
      const exerciseCount = day?.exercises?.length ?? 0
      const isExpanded = expandedDayIds.has(field.id)
      const exercisesVisible = exercisesVisibleDayIds.has(field.id)

      const expandedContent =
        !isSummaryMode && isExpanded ? (
          <div className='mt-2 border-t pt-2 max-h-[320px] overflow-y-auto overflow-x-hidden rounded-md pr-1 -mr-1'>
            <DayBlocksContent
              form={form}
              weekIndex={weekIndex}
              dayIndex={dayIndex}
              day={day ?? { exercises: [] }}
              onAddBlock={() => addBlockToDay(dayIndex)}
              onRemoveBlock={(blockIndex) =>
                removeBlockFromDay(dayIndex, blockIndex)
              }
              onAddExercise={(ex, blockId) =>
                addExerciseToDay(dayIndex, ex, blockId)
              }
              onRemoveExercise={(exerciseIndex) =>
                removeExercise(dayIndex, exerciseIndex)
              }
            />
          </div>
        ) : null

      return (
        <DraggableDayCard
          key={field.id}
          weekIndex={weekIndex}
          dayIndex={dayIndex}
          withHandle
        >
          <DayCardContent
            day={day}
            blockCount={blockCount}
            exerciseCount={exerciseCount}
            isSummaryMode={isSummaryMode}
            planificationId={planificationId}
            weekIndex={weekIndex}
            dayIndex={dayIndex}
            fieldId={field.id}
            isExpanded={isExpanded}
            exercisesVisible={exercisesVisible}
            onToggleExpand={toggleDayExpanded}
            onCopyDay={copyDay}
            onRemove={remove}
            onToggleExercisesVisible={toggleExercisesVisible}
            expandedContent={expandedContent}
          />
        </DraggableDayCard>
      )
    })

  return (
    <DragDropProvider onDragEnd={onDragEndCallback}>
      <DragEndMonitor onDragEnd={onDragEndCallback}>
        {isMobile ? (
          <div className='space-y-2'>
            {DAY_NAMES.map(({ value: dow, label }) => {
              const dayIndices = daysByWeekday.get(dow) ?? []
              const isExpanded = expandedWeekdays.has(dow)

              return (
                <Collapsible key={dow} open={isExpanded}>
                  <div className='rounded-lg border bg-muted/20'>
                    <div className='flex items-center justify-between gap-2 p-2'>
                      <button
                        type='button'
                        onClick={() => toggleWeekdayExpanded(dow)}
                        className='flex min-w-0 flex-1 items-center gap-2 text-left'
                        aria-expanded={isExpanded}
                      >
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                        <span className='truncate text-sm font-medium text-muted-foreground'>
                          {label}
                        </span>
                        <span className='text-xs text-muted-foreground/80'>
                          {dayIndices.length}
                        </span>
                      </button>
                      {renderAddDayButton(dow)}
                    </div>
                    <CollapsibleContent className='px-2 pb-2'>
                      <WeekdayDropZone
                        weekIndex={weekIndex}
                        dow={dow}
                        className='rounded-lg p-1'
                      >
                        <div className='space-y-2'>{renderDayCards(dayIndices)}</div>
                      </WeekdayDropZone>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <div className='grid min-w-[560px] grid-cols-7 gap-2'>
              {DAY_NAMES.map(({ value: dow, label }) => {
                const dayIndices = daysByWeekday.get(dow) ?? []
                return (
                  <div
                    key={dow}
                    className='flex min-h-[100px] flex-col rounded-lg border bg-muted/20 p-2'
                  >
                    <div className='mb-2 flex shrink-0 items-center justify-between'>
                      <span className='text-sm font-medium text-muted-foreground'>
                        {label}
                      </span>
                      {renderAddDayButton(dow)}
                    </div>
                    <div className='relative flex min-h-[60px] flex-1 flex-col'>
                      <WeekdayDropZone
                        weekIndex={weekIndex}
                        dow={dow}
                        className='absolute inset-0 z-0 rounded-lg'
                      />
                      <div className='relative z-10 flex-1 space-y-2 pointer-events-none'>
                        <div className='pointer-events-auto'>
                          {renderDayCards(dayIndices)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DragEndMonitor>
    </DragDropProvider>
  )
}
