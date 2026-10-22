"use client";

import { useQuery } from "convex/react";
import { Dumbbell } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import WorkoutDayCard from "./workout-day-card";

const DAY_NAMES = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 7, label: "Domingo", short: "Dom" },
] as const;

interface WorkoutWeekHorizontalViewProps {
  week: Doc<"workoutWeeks">;
}

export default function WorkoutWeekHorizontalView({
  week,
}: WorkoutWeekHorizontalViewProps) {
  const workoutDays = useQuery(api.workoutDays.getByWeek, {
    weekId: week._id,
  });
  const daysByWeekday = new Map<number, Doc<"workoutDays">[]>();
  for (const day of workoutDays ?? []) {
    const dow = day.dayOfWeek ?? 1;
    const key = dow >= 1 && dow <= 7 ? dow : 1;
    const days = daysByWeekday.get(key) ?? [];
    days.push(day);
    daysByWeekday.set(key, days);
  }

  if (workoutDays === undefined) {
    return (
      <section
        aria-label={`Cargando ${week.name}`}
        className="overflow-hidden rounded-xl border bg-card"
      >
        <div className="space-y-5 border-b p-4 md:p-5">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map(({ value }) => (
              <Skeleton key={value} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{week.name}</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dumbbell className="size-3.5" aria-hidden />
            {workoutDays.length}{" "}
            {workoutDays.length === 1 ? "sesión" : "sesiones"}
          </span>
        </div>
        <div
          className="grid grid-cols-7 gap-1.5 md:gap-2"
          aria-label="Distribución semanal"
        >
          {DAY_NAMES.map(({ value, label, short }) => {
            const count = daysByWeekday.get(value)?.length ?? 0;
            return (
              <div
                key={value}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-2 rounded-lg border px-1 py-2.5 text-center",
                  count > 0
                    ? "border-primary/20 bg-primary/5"
                    : "border-transparent bg-muted/25 text-muted-foreground",
                )}
                aria-label={`${label}: ${count > 0 ? `${count} ${count === 1 ? "sesión" : "sesiones"}` : "descanso"}`}
              >
                <span className={cn("text-xs", count > 0 && "font-semibold")}>
                  <span className="lg:hidden">{short}</span>
                  <span className="hidden lg:inline">{label}</span>
                </span>
                {count > 0 ? (
                  <span className="flex h-4 items-center gap-1.5 text-primary">
                    <Dumbbell className="size-3.5" aria-hidden />
                    <span className="hidden text-[11px] sm:inline">
                      {count} {count === 1 ? "sesión" : "sesiones"}
                    </span>
                  </span>
                ) : (
                  <span
                    className="flex h-4 items-center text-[11px] text-muted-foreground/60"
                    aria-hidden
                  >
                    <span className="sm:hidden">—</span>
                    <span className="hidden sm:inline">Descanso</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {workoutDays.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Esta semana todavía no tiene sesiones de entrenamiento.
        </p>
      ) : (
        <div className="grid items-start gap-5 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          {DAY_NAMES.flatMap(({ value, label }) =>
            (daysByWeekday.get(value) ?? []).map((day) => (
              <div key={day._id} className="min-w-0">
                <div className="mb-2.5 flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-hidden
                  />
                  <h3 className="text-xs font-semibold text-muted-foreground">
                    {label}
                  </h3>
                </div>
                <WorkoutDayCard day={day} compact />
              </div>
            )),
          )}
        </div>
      )}
    </section>
  );
}
