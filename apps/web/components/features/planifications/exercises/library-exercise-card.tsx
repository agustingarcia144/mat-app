"use client";

import { useDraggable } from "@dnd-kit/react";
import Image from "next/image";
import { getVideoThumbnailUrl } from "@repo/core/utils";

import fallbackThumbnail from "@/assets/mat-wolf-looking.png";

const LIBRARY_PREFIX = "library-";

export interface LibraryExercise {
  _id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  equipment?: string | null;
  videoUrl?: string | null;
}

interface LibraryExerciseCardProps {
  exercise: LibraryExercise;
}

export function getLibraryExerciseDragId(exerciseId: string) {
  return `${LIBRARY_PREFIX}${exerciseId}`;
}

export function parseLibraryExerciseDragId(dragId: string): string | null {
  if (!dragId.startsWith(LIBRARY_PREFIX)) return null;
  return dragId.slice(LIBRARY_PREFIX.length);
}

export default function LibraryExerciseCard({
  exercise,
}: LibraryExerciseCardProps) {
  const id = getLibraryExerciseDragId(exercise._id);
  const { ref, isDragging } = useDraggable({ id });

  const thumbnailUrl = exercise.videoUrl
    ? getVideoThumbnailUrl(exercise.videoUrl)
    : null;

  return (
    <div
      ref={ref as (el: HTMLDivElement | null) => void}
      className={`min-h-20 flex items-center gap-3 border bg-background p-2.5 rounded-lg overflow-hidden transition-colors cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? "opacity-50 ring-2 ring-primary" : "hover:border-primary"
      }`}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        <Image
          src={thumbnailUrl ?? fallbackThumbnail}
          alt={`Miniatura de ${exercise.name}`}
          fill
          className={thumbnailUrl ? "object-cover" : "object-contain p-1"}
          sizes="56px"
          unoptimized={Boolean(thumbnailUrl)}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h4 className="text-sm font-medium leading-snug">{exercise.name}</h4>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {exercise.category && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {exercise.category}
            </span>
          )}
          {exercise.equipment && (
            <span className="text-xs text-muted-foreground truncate min-w-0">
              {exercise.equipment}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
