"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getVideoThumbnailUrl } from "@repo/core/utils";
import Image from "next/image";
import { Play } from "lucide-react";
import ExerciseVideoDialog from "@/components/features/planifications/exercises/exercise-video-dialog";
import matWolfFallback from "@/assets/mat-wolf-looking.png";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function formatTimeSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 && secs > 0
    ? `${mins} min ${secs} s`
    : mins > 0
      ? `${mins} min`
      : `${secs} s`;
}

function formatLoad(weight?: string, prPercentage?: number): string | null {
  if (weight?.trim()) return weight.trim();
  if (prPercentage != null && prPercentage > 0) return `${prPercentage}% RM`;
  return null;
}

type DayExercise = FunctionReturnType<
  typeof api.dayExercises.getByWorkoutDay
>[number];

/** Sets × reps × load · time, skipping whatever the trainer left empty. */
function Prescription({
  exercise,
  compact,
}: {
  exercise: DayExercise;
  compact: boolean;
}) {
  const parts = [
    exercise.sets != null && String(exercise.sets).trim() !== ""
      ? String(exercise.sets)
      : null,
    exercise.reps != null && String(exercise.reps).trim() !== ""
      ? String(exercise.reps)
      : null,
    formatLoad(exercise.weight, exercise.prPercentage),
  ].filter((part): part is string => part !== null);
  const time =
    exercise.timeSeconds != null && exercise.timeSeconds > 0
      ? formatTimeSeconds(exercise.timeSeconds)
      : null;

  if (parts.length === 0 && !time) return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap font-medium tabular-nums",
        compact ? "text-xs" : "text-sm",
      )}
    >
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="font-normal text-muted-foreground">×</span>
          )}
          {part}
        </span>
      ))}
      {time && (
        <>
          {parts.length > 0 && (
            <span className="font-normal text-muted-foreground">·</span>
          )}
          {time}
        </>
      )}
    </span>
  );
}

function ExerciseRow({
  exercise,
  index,
  compact,
  onPlay,
}: {
  exercise: DayExercise;
  index: number;
  compact: boolean;
  onPlay: (url: string, name: string) => void;
}) {
  const name = exercise.exercise?.name || "Ejercicio eliminado";
  const videoUrl = exercise.exercise?.videoUrl;
  const thumbnailUrl = videoUrl ? getVideoThumbnailUrl(videoUrl) : null;

  const thumbnail = (
    <button
      type="button"
      disabled={!videoUrl}
      onClick={() => videoUrl && onPlay(videoUrl, name)}
      aria-label={videoUrl ? `Ver video de ${name}` : undefined}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-md bg-muted",
        compact ? "size-9" : "size-11 sm:size-12",
        videoUrl ? "cursor-pointer" : "cursor-default",
      )}
    >
      <Image
        src={thumbnailUrl ?? matWolfFallback}
        alt=""
        fill
        className="object-cover"
        sizes={compact ? "36px" : "48px"}
        unoptimized={Boolean(thumbnailUrl)}
      />
      {videoUrl && (
        // Touch screens can't hover, so the play hint stays visible there.
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <Play className="size-4 fill-white text-white" aria-hidden />
        </span>
      )}
    </button>
  );

  const title = (
    <Tooltip>
      <TooltipTrigger asChild>
        <p
          className={cn(
            "min-w-0 text-sm font-medium",
            compact ? "line-clamp-2" : "line-clamp-2 sm:truncate",
          )}
        >
          {name}
        </p>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-muted/40">
        {thumbnail}
        <div className="min-w-0 flex-1 space-y-0.5">
          {title}
          <div className="text-muted-foreground">
            <Prescription exercise={exercise} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-2 transition-colors hover:bg-muted/40 sm:gap-3 sm:px-2">
      <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:w-5">
        {index + 1}
      </span>
      {thumbnail}
      <div className="min-w-0 flex-1">
        {title}
        {exercise.exercise?.category && (
          <p className="truncate text-xs text-muted-foreground">
            {exercise.exercise.category}
          </p>
        )}
        {/* Phones: the prescription drops under the name to free its width. */}
        <div className="mt-0.5 sm:hidden">
          <Prescription exercise={exercise} compact={false} />
        </div>
      </div>
      <div className="hidden shrink-0 sm:block">
        <Prescription exercise={exercise} compact={false} />
      </div>
    </div>
  );
}

function ExerciseGroup({
  label,
  accent,
  exercises,
  compact,
  onPlay,
}: {
  label: string;
  accent: boolean;
  exercises: DayExercise[];
  compact: boolean;
  onPlay: (url: string, name: string) => void;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-1"}>
      <div
        className={cn(
          "flex items-baseline gap-2 text-xs",
          accent &&
            (compact
              ? "border-b border-border/60 pb-2"
              : "border-l-2 border-primary/40 pl-2"),
          !compact && !accent && "pl-1 sm:pl-2",
        )}
      >
        <span className="truncate font-medium text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground/70">
          {exercises.length}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {exercises.map((ex, i) => (
          <ExerciseRow
            key={ex._id}
            exercise={ex}
            index={i}
            compact={compact}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}

export default function WorkoutDayCard({
  day,
  compact = false,
}: {
  day: Doc<"workoutDays">;
  compact?: boolean;
}) {
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const dayExercises = useQuery(api.dayExercises.getByWorkoutDay, {
    workoutDayId: day._id,
  });

  const blocks = useQuery(api.exerciseBlocks.getByWorkoutDay, {
    workoutDayId: day._id,
  });

  const groups = useMemo(() => {
    if (!dayExercises || !blocks) return [];

    const byBlock = new Map<string, DayExercise[]>();
    const unblocked: DayExercise[] = [];
    dayExercises.forEach((ex: DayExercise) => {
      if (ex.blockId) {
        const blockExercises = byBlock.get(ex.blockId) || [];
        blockExercises.push(ex);
        byBlock.set(ex.blockId, blockExercises);
      } else {
        unblocked.push(ex);
      }
    });

    const byOrder = (a: { order: number }, b: { order: number }) =>
      a.order - b.order;
    const result = [...blocks]
      .sort(byOrder)
      .map((block: { _id: string; name: string }) => ({
        key: block._id,
        label: block.name,
        accent: true,
        exercises: (byBlock.get(block._id) || []).sort(byOrder),
      }))
      .filter((group) => group.exercises.length > 0);

    if (unblocked.length > 0) {
      result.push({
        key: "unblocked",
        // With no blocks at all the header would be noise.
        label: result.length > 0 ? "Sin bloque" : "Ejercicios",
        accent: false,
        exercises: unblocked.sort(byOrder),
      });
    }
    return result;
  }, [dayExercises, blocks]);

  const openVideoDialog = (url: string, name: string) => {
    setSelectedVideo({ url, name });
    setVideoDialogOpen(true);
  };

  const exerciseCount = dayExercises?.length ?? 0;

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-background",
        compact ? "bg-background/50 p-3 md:p-4" : "p-2 sm:p-3 md:p-4",
      )}
    >
      <div
        className={cn(
          "flex items-baseline justify-between gap-2",
          compact ? "mb-4" : "mb-2 px-1 pt-1 sm:mb-3 sm:px-2 sm:pt-0",
        )}
      >
        <h3 className="truncate text-base font-semibold">{day.name}</h3>
        {dayExercises !== undefined && exerciseCount > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {exerciseCount === 1
              ? "1 ejercicio"
              : `${exerciseCount} ejercicios`}
          </span>
        )}
      </div>

      {dayExercises === undefined || blocks === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={compact ? "h-12" : "h-14"} />
          ))}
        </div>
      ) : dayExercises.length === 0 ? (
        compact ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Sin ejercicios
          </p>
        ) : (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia>
                <Image
                  src={matWolfFallback}
                  alt=""
                  className="h-12 w-12 object-contain"
                />
              </EmptyMedia>
              <EmptyTitle>Sin ejercicios</EmptyTitle>
              <EmptyDescription>
                Editá la planificación para agregar ejercicios a este día.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <ExerciseGroup
              key={group.key}
              label={group.label}
              accent={group.accent}
              exercises={group.exercises}
              compact={compact}
              onPlay={openVideoDialog}
            />
          ))}
        </div>
      )}

      <ExerciseVideoDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        videoUrl={selectedVideo?.url ?? null}
        exerciseName={selectedVideo?.name ?? ""}
      />
    </div>
  );
}
