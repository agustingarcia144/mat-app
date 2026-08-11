"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Clock, Users } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import StatsCard from "./StatsCard";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { useDashboardScope } from "./dashboard-scope-context";

type Props = {
  onOpenDetail: (id: Id<"classSchedules">) => void;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function TodayClassesCard({ onOpenDetail }: Props) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const { scope, myUserId, isLoading: isScopeLoading } = useDashboardScope();

  const dayBounds = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return { dayStartTime: start, dayEndTime: start + 24 * 60 * 60 * 1000 - 1 };
  }, []);

  const schedules = useQuery(
    api.classSchedules.getScheduleSummaryForDay,
    canQueryCurrentOrganization ? dayBounds : "skip",
  );

  const visibleSchedules = useMemo(() => {
    if (!schedules) return [];

    return schedules
      .filter((schedule: any) => schedule.status !== "cancelled")
      .filter((schedule: any) =>
        scope === "mine" && myUserId
          ? schedule.inChargeUserId === myUserId
          : true,
      )
      .sort((a: any, b: any) => a.startTime - b.startTime);
  }, [schedules, scope, myUserId]);

  if (schedules === undefined || isScopeLoading) return null;

  return (
    <StatsCard
      title={scope === "mine" ? "Mis clases de hoy" : "Clases de hoy"}
      variant="list"
      compact
      className="min-h-[220px] w-full min-w-0 max-w-none md:h-auto"
      actionLabel="Ver mas +"
      actionHref="/dashboard/classes"
      actionIcon={Clock}
    >
      {visibleSchedules.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">
            {scope === "mine"
              ? "No tenés turnos a tu cargo hoy."
              : "No hay clases programadas para hoy."}
          </p>
        </div>
      ) : (
        <div
          className={`min-h-0 space-y-1 ${
            visibleSchedules.length > 4 ? "max-h-[220px] overflow-y-auto" : ""
          }`}
        >
          {visibleSchedules.map((schedule: any) => (
            <button
              key={schedule._id}
              type="button"
              onClick={() => onOpenDetail(schedule._id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent/40"
            >
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatTime(schedule.startTime)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {schedule.className}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {schedule.reservationCounts?.confirmed ?? 0}
                {typeof schedule.capacity === "number"
                  ? `/${schedule.capacity}`
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </StatsCard>
  );
}
