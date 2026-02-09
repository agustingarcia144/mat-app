'use client'

import { useState } from 'react'
import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { Skeleton } from '@/components/ui/skeleton'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import Image from 'next/image'
import ExerciseVideoDialog from '@/components/features/planifications/exercises/exercise-video-dialog'

export default function WorkoutDayCard({ day }: { day: any }) {
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<{
    url: string
    name: string
  } | null>(null)

  const dayExercises = useQuery(api.dayExercises.getByWorkoutDay, {
    workoutDayId: day._id,
  })

  const openVideoDialog = (url: string, name: string) => {
    setSelectedVideo({ url, name })
    setVideoDialogOpen(true)
  }

  return (
    <div className="border rounded-lg p-5 bg-background">
      <h3 className="text-lg font-semibold mb-3">{day.name}</h3>

      {dayExercises === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : dayExercises.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay ejercicios en este día
        </p>
      ) : (
        <div className="space-y-3">
          {dayExercises.map((ex, i) => {
            const thumbnailUrl = ex.exercise?.videoUrl
              ? getVideoThumbnailUrl(ex.exercise.videoUrl)
              : null

            return (
              <div
                key={ex._id}
                className="flex items-center gap-4 p-3 bg-muted/50 rounded-md"
              >
                <span className="text-sm font-medium text-muted-foreground w-6 shrink-0">
                  {i + 1}.
                </span>
                {thumbnailUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      openVideoDialog(
                        ex.exercise?.videoUrl ?? '',
                        ex.exercise?.name || 'Ejercicio'
                      )
                    }
                    className="relative shrink-0 w-16 h-16 rounded overflow-hidden bg-muted hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Image
                      src={thumbnailUrl}
                      alt={`Video de ${ex.exercise?.name || 'ejercicio'}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {ex.exercise?.name || 'Ejercicio eliminado'}
                  </p>
                  {ex.exercise?.category && (
                    <p className="text-xs text-muted-foreground">
                      {ex.exercise.category}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm shrink-0">
                  <span className="font-medium">{ex.sets}</span>
                  <span className="text-muted-foreground">×</span>
                  <span className="font-medium">{ex.reps}</span>
                  {ex.weight && (
                    <>
                      <span className="text-muted-foreground">@</span>
                      <span className="font-medium">{ex.weight}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
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
