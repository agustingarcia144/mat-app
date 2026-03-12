'use client'

import { useMemo, useState } from 'react'
import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'
import { useQuery } from 'convex/react'
import { Skeleton } from '@/components/ui/skeleton'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import Image from 'next/image'
import ExerciseVideoDialog from '@/components/features/planifications/exercises/exercise-video-dialog'
import matWolfFallback from '@/assets/mat-wolf-looking.png'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function formatTimeSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 && secs > 0
    ? `${mins} min ${secs} s`
    : mins > 0
      ? `${mins} min`
      : `${secs} s`
}

function formatLoad(weight?: string, prPercentage?: number): string | null {
  if (weight?.trim()) return weight.trim()
  if (prPercentage != null && prPercentage > 0) return `${prPercentage}% PR`
  return null
}

export default function WorkoutDayCard({
  day,
  compact = false,
}: {
  day: Doc<'workoutDays'>
  compact?: boolean
}) {
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<{
    url: string
    name: string
  } | null>(null)

  const dayExercises = useQuery(api.dayExercises.getByWorkoutDay, {
    workoutDayId: day._id,
  })

  const blocks = useQuery(api.exerciseBlocks.getByWorkoutDay, {
    workoutDayId: day._id,
  })

  type ExerciseType = NonNullable<typeof dayExercises>[0]

  const { exercisesByBlock, unblockedExercises } = useMemo(() => {
    if (!dayExercises || !blocks) {
      return {
        exercisesByBlock: new Map<string, ExerciseType[]>(),
        unblockedExercises: [] as ExerciseType[],
      }
    }

    const byBlock = new Map<string, ExerciseType[]>()
    const unblocked: ExerciseType[] = []

    dayExercises.forEach((ex: ExerciseType) => {
      if (ex.blockId) {
        const blockExercises = byBlock.get(ex.blockId) || []
        blockExercises.push(ex)
        byBlock.set(ex.blockId, blockExercises)
      } else {
        unblocked.push(ex)
      }
    })

    // Sort exercises within each block by order
    byBlock.forEach((exercises: ExerciseType[]) => {
      exercises.sort((a: ExerciseType, b: ExerciseType) => a.order - b.order)
    })
    unblocked.sort((a: ExerciseType, b: ExerciseType) => a.order - b.order)

    return { exercisesByBlock: byBlock, unblockedExercises: unblocked }
  }, [dayExercises, blocks])

  const openVideoDialog = (url: string, name: string) => {
    setSelectedVideo({ url, name })
    setVideoDialogOpen(true)
  }

  return (
    <div
      className={`border rounded-lg bg-background min-w-0 overflow-hidden ${compact ? 'p-3' : 'p-5'}`}
    >
      <h3
        className={`font-semibold mb-3 truncate ${compact ? 'text-sm' : 'text-lg'}`}
      >
        {day.name}
      </h3>

      {dayExercises === undefined || blocks === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : dayExercises.length === 0 ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfFallback}
                alt=""
                className="h-14 w-14 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>No hay ejercicios</EmptyTitle>
            <EmptyDescription>
              No hay ejercicios en este día. Arrastra ejercicios desde la
              biblioteca.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className={
            compact
              ? 'space-y-2 max-h-72 overflow-y-auto pr-1'
              : 'space-y-4'
          }
        >
          {/* Exercises grouped by blocks */}
          {blocks
            .sort(
              (a: { order: number }, b: { order: number }) => a.order - b.order
            )
            .map((block: { _id: string; name: string }) => {
              const blockExercises = exercisesByBlock.get(block._id) || []
              if (blockExercises.length === 0) return null

              return (
                <div
                  key={block._id}
                  className={compact ? 'space-y-1' : 'space-y-2'}
                >
                  <h4
                    className={`font-semibold text-muted-foreground border-l-2 border-primary/30 pl-2 truncate ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    {block.name}
                  </h4>
                  <div
                    className={compact ? 'space-y-1 ml-1' : 'space-y-2 ml-2'}
                  >
                    {blockExercises.map((ex: ExerciseType, i) => {
                      const thumbnailUrl = ex.exercise?.videoUrl
                        ? getVideoThumbnailUrl(ex.exercise.videoUrl)
                        : null
                      const loadLabel = formatLoad(ex.weight, ex.prPercentage)
                      const hasReps =
                        ex.reps != null && String(ex.reps).trim() !== ''
                      const hasSets =
                        ex.sets != null && String(ex.sets).trim() !== ''
                      const setsRepsEl = (
                        <div
                          className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}
                        >
                          {hasSets && (
                            <span className="font-medium">{ex.sets}</span>
                          )}
                          {hasReps && (
                            <>
                              {hasSets && (
                                <span className="text-muted-foreground">
                                  ×
                                </span>
                              )}
                              <span className="font-medium">{ex.reps}</span>
                            </>
                          )}
                          {loadLabel && (
                            <>
                              {(hasSets || hasReps) && (
                                <span className="text-muted-foreground">
                                  x
                                </span>
                              )}
                              <span className="font-medium">{loadLabel}</span>
                            </>
                          )}
                          {ex.timeSeconds != null && ex.timeSeconds > 0 && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="font-medium">
                                {formatTimeSeconds(ex.timeSeconds)}
                              </span>
                            </>
                          )}
                        </div>
                      )

                      if (compact) {
                        return (
                          <div
                            key={ex._id}
                            className="flex flex-col gap-1.5 p-2 bg-muted/50 rounded-md min-w-0"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium text-muted-foreground shrink-0">
                                {i + 1}.
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="font-medium truncate text-sm min-w-0">
                                    {ex.exercise?.name || 'Ejercicio eliminado'}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {ex.exercise?.name || 'Ejercicio eliminado'}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  ex.exercise?.videoUrl &&
                                  openVideoDialog(
                                    ex.exercise.videoUrl,
                                    ex.exercise?.name || 'Ejercicio'
                                  )
                                }
                                className="relative shrink-0 w-10 h-10 rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity cursor-pointer"
                              >
                                <Image
                                  src={thumbnailUrl ?? matWolfFallback}
                                  alt={`Video de ${ex.exercise?.name || 'ejercicio'}`}
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              </button>
                              {setsRepsEl}
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={ex._id}
                          className="flex items-center p-3 gap-4 bg-muted/50 rounded-md min-w-0"
                        >
                          <span className="text-sm font-medium text-muted-foreground w-5 shrink-0">
                            {i + 1}.
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              ex.exercise?.videoUrl &&
                              openVideoDialog(
                                ex.exercise.videoUrl,
                                ex.exercise?.name || 'Ejercicio'
                              )
                            }
                            className="relative shrink-0 w-16 h-16 rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <Image
                              src={thumbnailUrl ?? matWolfFallback}
                              alt={`Video de ${ex.exercise?.name || 'ejercicio'}`}
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          </button>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="font-medium truncate text-sm">
                                  {ex.exercise?.name || 'Ejercicio eliminado'}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                {ex.exercise?.name || 'Ejercicio eliminado'}
                              </TooltipContent>
                            </Tooltip>
                            {ex.exercise?.category && (
                              <p className="text-xs text-muted-foreground truncate">
                                {ex.exercise.category}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">{setsRepsEl}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

          {/* Unblocked exercises */}
          {unblockedExercises.length > 0 && (
            <div className={compact ? 'space-y-1' : 'space-y-2'}>
              <h4
                className={`font-semibold text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}
              >
                Sin bloque
              </h4>
              <div className={compact ? 'space-y-1' : 'space-y-2'}>
                {unblockedExercises.map((ex, i) => {
                  const thumbnailUrl = ex.exercise?.videoUrl
                    ? getVideoThumbnailUrl(ex.exercise.videoUrl)
                    : null
                  const loadLabel = formatLoad(ex.weight, ex.prPercentage)
                  const hasReps =
                    ex.reps != null && String(ex.reps).trim() !== ''
                  const hasSets =
                    ex.sets != null && String(ex.sets).trim() !== ''
                  const setsRepsEl = (
                    <div
                      className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}
                    >
                      {hasSets && (
                        <span className="font-medium">{ex.sets}</span>
                      )}
                      {hasReps && (
                        <>
                          {hasSets && (
                            <span className="text-muted-foreground">×</span>
                          )}
                          <span className="font-medium">{ex.reps}</span>
                        </>
                      )}
                      {loadLabel && (
                        <>
                          {(hasSets || hasReps) && (
                            <span className="text-muted-foreground">x</span>
                          )}
                          <span className="font-medium">{loadLabel}</span>
                        </>
                      )}
                      {ex.timeSeconds != null && ex.timeSeconds > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium">
                            {formatTimeSeconds(ex.timeSeconds)}
                          </span>
                        </>
                      )}
                    </div>
                  )

                  if (compact) {
                    return (
                      <div
                        key={ex._id}
                        className="flex flex-col gap-1.5 p-2 bg-muted/50 rounded-md min-w-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-muted-foreground shrink-0">
                            {i + 1}.
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="font-medium truncate text-sm min-w-0">
                                {ex.exercise?.name || 'Ejercicio eliminado'}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              {ex.exercise?.name || 'Ejercicio eliminado'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              ex.exercise?.videoUrl &&
                              openVideoDialog(
                                ex.exercise.videoUrl,
                                ex.exercise?.name || 'Ejercicio'
                              )
                            }
                            className="relative shrink-0 w-10 h-10 rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <Image
                              src={thumbnailUrl ?? matWolfFallback}
                              alt={`Video de ${ex.exercise?.name || 'ejercicio'}`}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </button>
                          {setsRepsEl}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={ex._id}
                      className="flex items-center p-3 gap-4 bg-muted/50 rounded-md min-w-0"
                    >
                      <span className="text-sm font-medium text-muted-foreground w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          ex.exercise?.videoUrl &&
                          openVideoDialog(
                            ex.exercise.videoUrl,
                            ex.exercise?.name || 'Ejercicio'
                          )
                        }
                        className="relative shrink-0 w-16 h-16 rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Image
                          src={thumbnailUrl ?? matWolfFallback}
                          alt={`Video de ${ex.exercise?.name || 'ejercicio'}`}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </button>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="font-medium truncate text-sm">
                              {ex.exercise?.name || 'Ejercicio eliminado'}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            {ex.exercise?.name || 'Ejercicio eliminado'}
                          </TooltipContent>
                        </Tooltip>
                        {ex.exercise?.category && (
                          <p className="text-xs text-muted-foreground truncate">
                            {ex.exercise.category}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">{setsRepsEl}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <ExerciseVideoDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        videoUrl={selectedVideo?.url ?? null}
        exerciseName={selectedVideo?.name ?? ''}
      />
    </div>
  )
}
