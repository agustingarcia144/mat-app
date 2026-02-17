'use client'

import { useDraggable } from '@dnd-kit/react'
import Image from 'next/image'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { Badge } from '@/components/ui/badge'

import fallbackThumbnail from '@/assets/mat-wolf-looking.png'

const LIBRARY_PREFIX = 'library-'

export interface LibraryExercise {
  _id: string
  name: string
  description?: string | null
  category?: string | null
  equipment?: string | null
  videoUrl?: string | null
}

interface LibraryExerciseCardProps {
  exercise: LibraryExercise
}

export function getLibraryExerciseDragId(exerciseId: string) {
  return `${LIBRARY_PREFIX}${exerciseId}`
}

export function parseLibraryExerciseDragId(
  dragId: string
): string | null {
  if (!dragId.startsWith(LIBRARY_PREFIX)) return null
  return dragId.slice(LIBRARY_PREFIX.length)
}

export default function LibraryExerciseCard({
  exercise,
}: LibraryExerciseCardProps) {
  const id = getLibraryExerciseDragId(exercise._id)
  const { ref, isDragging } = useDraggable({ id })

  const thumbnailUrl = exercise.videoUrl
    ? getVideoThumbnailUrl(exercise.videoUrl)
    : null

  return (
    <div
      ref={ref as (el: HTMLDivElement | null) => void}
      className={`h-[240px] flex flex-col border rounded-lg overflow-hidden transition-colors cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-50 ring-2 ring-primary' : 'hover:border-primary'
      }`}
    >
      <div className="aspect-video w-full shrink-0 bg-muted relative">
        <Image
          src={thumbnailUrl ?? fallbackThumbnail}
          alt={`Miniatura de ${exercise.name}`}
          fill
          className="object-cover"
          sizes="(max-width: 512px) 100vw, 512px"
        />
      </div>
      <div className="p-3 flex-1 min-h-0 flex flex-col">
        <h4 className="font-medium truncate">{exercise.name}</h4>
        {exercise.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 shrink-0">
            {exercise.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap min-h-0">
          {exercise.category && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {exercise.category}
            </Badge>
          )}
          {exercise.equipment && (
            <span className="text-xs text-muted-foreground truncate min-w-0">
              {exercise.equipment}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
