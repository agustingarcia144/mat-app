import Image from "next/image";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import WorkoutDayCard from "./workout-day-card";
import matWolfLooking from "@/assets/mat-wolf-looking.png";

export default function WorkoutWeekCard({
  week,
}: {
  week: Doc<"workoutWeeks">;
}) {
  const workoutDays = useQuery(api.workoutDays.getByWeek, {
    weekId: week._id,
  });

  return (
    <section className="rounded-xl border bg-card p-2 sm:p-3 md:p-5">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1.5 pt-1 sm:mb-3 sm:pt-0 md:mb-4">
        <h2 className="text-lg font-semibold">{week.name}</h2>
        {workoutDays !== undefined && workoutDays.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {workoutDays.length === 1 ? "1 día" : `${workoutDays.length} días`}
          </span>
        )}
      </div>

      {workoutDays === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : workoutDays.length === 0 ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-14 w-14 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>Semana sin días</EmptyTitle>
            <EmptyDescription>
              Editá la planificación para agregar días de entrenamiento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {workoutDays.map((day: Doc<"workoutDays">) => (
            <WorkoutDayCard key={day._id} day={day} />
          ))}
        </div>
      )}
    </section>
  );
}
