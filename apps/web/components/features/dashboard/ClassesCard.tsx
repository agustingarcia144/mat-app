"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { format, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";

import { api } from "@/convex/_generated/api";
import { type Doc, type Id } from "@/convex/_generated/dataModel";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";
import {
  OccupancyBar,
  Panel,
  PanelEmpty,
  PanelSkeleton,
  plural,
} from "./dashboard-panel";
import { useDashboardScope } from "./dashboard-scope-context";
import { useTodayBounds } from "./use-today-bounds";

type Props = {
  onOpenDetail: (id: Id<"classSchedules">) => void;
  /** How many classes after today to list. */
  upcomingLimit?: number;
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function dayLabel(timestamp: number) {
  if (isTomorrow(timestamp)) return "Mañana";
  return format(timestamp, "EEE d", { locale: es }).replace(".", "");
}

function TimePill({ timestamp }: { timestamp: number }) {
  return (
    <span className="w-12 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-xs font-medium tabular-nums">
      {format(timestamp, "HH:mm")}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-medium text-muted-foreground">{children}</p>
  );
}

/** Today's agenda plus the next week, in one panel so empty days stay small. */
export default function ClassesCard({
  onOpenDetail,
  upcomingLimit = 5,
}: Props) {
  const canQuery = useCanQueryCurrentOrganization();
  const { scope, myUserId, isLoading: isScopeLoading } = useDashboardScope();
  const dayBounds = useTodayBounds();
  const [now] = useState(() => Date.now());
  const inChargeUserId = scope === "mine" ? myUserId : undefined;

  const todaySchedules = useQuery(
    api.classSchedules.getScheduleSummaryForDay,
    canQuery ? dayBounds : "skip",
  );
  const upcomingSchedules = useQuery(
    api.classSchedules.getUpcoming,
    canQuery ? { limit: 40 } : "skip",
  );
  const classes = useQuery(
    api.classes.getByOrganization,
    canQuery ? { activeOnly: true } : "skip",
  );

  const today = useMemo(
    () =>
      (todaySchedules ?? [])
        .filter((s: any) => s.status !== "cancelled")
        .filter(
          (s: any) => !inChargeUserId || s.inChargeUserId === inChargeUserId,
        )
        .sort((a: any, b: any) => a.startTime - b.startTime),
    [todaySchedules, inChargeUserId],
  );

  const upcoming = useMemo(() => {
    if (!upcomingSchedules || !classes) return [];
    const classNames = new Map(
      classes.map((item: Doc<"classes">) => [item._id, item.name]),
    );
    return upcomingSchedules
      .filter(
        (s: Doc<"classSchedules">) =>
          s.startTime > dayBounds.dayEndTime &&
          s.startTime <= dayBounds.dayEndTime + WINDOW_MS &&
          s.status !== "cancelled" &&
          (!inChargeUserId || s.inChargeUserId === inChargeUserId),
      )
      .sort(
        (a: Doc<"classSchedules">, b: Doc<"classSchedules">) =>
          a.startTime - b.startTime,
      )
      .slice(0, upcomingLimit)
      .map((s: Doc<"classSchedules">) => ({
        ...s,
        className: classNames.get(s.classId) ?? "Clase",
      }));
  }, [
    classes,
    dayBounds.dayEndTime,
    inChargeUserId,
    upcomingLimit,
    upcomingSchedules,
  ]);

  if (
    todaySchedules === undefined ||
    upcomingSchedules === undefined ||
    classes === undefined ||
    isScopeLoading
  ) {
    return <PanelSkeleton rows={4} />;
  }

  const booked = today.reduce(
    (acc: number, s: any) => acc + (s.reservationCounts?.confirmed ?? 0),
    0,
  );

  return (
    <Panel
      title={scope === "mine" ? "Mis clases" : "Clases"}
      description={
        today.length > 0
          ? `Hoy: ${plural(today.length, "clase", "clases")} · ${plural(booked, "reserva", "reservas")}`
          : undefined
      }
      href="/dashboard/classes"
      linkLabel="Agenda"
    >
      {today.length === 0 && upcoming.length === 0 ? (
        <PanelEmpty>
          {scope === "mine"
            ? "No tenés clases a tu cargo esta semana."
            : "No hay clases programadas esta semana."}
        </PanelEmpty>
      ) : (
        <div className="space-y-4">
          <div>
            <SectionLabel>Hoy</SectionLabel>
            {today.length === 0 ? (
              <p className="py-1.5 text-sm text-muted-foreground">
                Sin clases hoy.
              </p>
            ) : (
              <ul
                className={cn(
                  "-mx-1 space-y-0.5",
                  today.length > 6 && "max-h-[304px] overflow-y-auto",
                )}
              >
                {today.map((schedule: any) => {
                  const isPast = (schedule.endTime ?? schedule.startTime) < now;
                  const isLive =
                    !isPast &&
                    schedule.startTime <= now &&
                    schedule.endTime > now;
                  return (
                    <li key={schedule._id}>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(schedule._id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-accent/40",
                          isPast && "opacity-50",
                        )}
                      >
                        <TimePill timestamp={schedule.startTime} />
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-sm">
                            {schedule.className}
                          </span>
                          {isLive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              En curso
                            </span>
                          )}
                        </span>
                        <OccupancyBar
                          taken={schedule.reservationCounts?.confirmed ?? 0}
                          capacity={schedule.capacity}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t pt-3">
            <SectionLabel>Próximos días</SectionLabel>
            {upcoming.length === 0 ? (
              <p className="py-1.5 text-sm text-muted-foreground">
                Nada en los próximos 7 días.
              </p>
            ) : (
              <ul className="-mx-1 space-y-0.5">
                {upcoming.map((schedule, index) => {
                  const label = dayLabel(schedule.startTime);
                  const showDay =
                    index === 0 ||
                    label !== dayLabel(upcoming[index - 1].startTime);
                  return (
                    <li key={schedule._id}>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(schedule._id)}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <TimePill timestamp={schedule.startTime} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {schedule.className}
                        </span>
                        <span className="w-14 shrink-0 truncate text-right text-xs capitalize text-muted-foreground">
                          {showDay ? label : ""}
                        </span>
                        <OccupancyBar
                          taken={schedule.currentReservations ?? 0}
                          capacity={schedule.capacity}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
