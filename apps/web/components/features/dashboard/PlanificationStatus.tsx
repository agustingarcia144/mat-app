"use client";

import StatsCard from "./StatsCard";
import { Dumbbell, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { useDashboardScope } from "./dashboard-scope-context";

export default function PlanificationStatus() {
  const { responsibleUserId, isLoading: isScopeLoading } = useDashboardScope();

  const { isLoading, membersWithIssues, summary } = usePlanificationStatuses({
    responsibleUserId,
    skip: isScopeLoading,
  });

  const planSegments = [
    {
      label: "Asignadas",
      count: summary.assigned,
      pct: summary.assignedPct,
      color: "rgb(34 197 94)",
      tone: "bg-green-500",
    },
    {
      label: "Por vencer",
      count: summary.expiringSoon,
      pct: summary.expiringSoonPct,
      color: "rgb(234 179 8)",
      tone: "bg-yellow-500",
    },
    {
      label: "Vencidas",
      count: summary.expired,
      pct: summary.expiredPct,
      color: "rgb(239 68 68)",
      tone: "bg-red-500",
    },
    {
      label: "Sin asignar",
      count: summary.unassigned,
      pct: summary.unassignedPct,
      color: "rgb(107 114 128)",
      tone: "bg-gray-500",
    },
  ];

  const donutBackground = (() => {
    const validSegments = planSegments.filter((segment) => segment.count > 0);
    if (validSegments.length === 0) {
      return "conic-gradient(rgba(107, 114, 128, 0.18) 0deg 360deg)";
    }

    let currentDeg = 0;
    const stops = validSegments.map((segment) => {
      const nextDeg = currentDeg + (segment.pct / 100) * 360;
      const stop = `${segment.color} ${currentDeg}deg ${nextDeg}deg`;
      currentDeg = nextDeg;
      return stop;
    });

    if (currentDeg < 360) {
      stops.push(`rgba(107, 114, 128, 0.18) ${currentDeg}deg 360deg`);
    }

    return `conic-gradient(${stops.join(", ")})`;
  })();

  if (isLoading) return null;

  return (
    <StatsCard
      title="Estado de Planificaciones"
      variant="list"
      compact
      className="min-h-[460px] w-full min-w-0 max-w-none md:h-auto"
      actionLabel="Ver mas +"
      actionHref="/dashboard/planifications"
      actionIcon={Dumbbell}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 rounded-xl border bg-background/30 p-3 md:p-4">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between md:gap-6 md:pl-8">
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full md:h-24 md:w-24"
              style={{ background: donutBackground }}
            >
              <div className="absolute inset-[10px] rounded-full bg-background/95" />
              <div className="relative z-10 text-center">
                <p className="text-xl font-semibold leading-none">
                  {summary.assignedPct}%
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Activas
                </p>
              </div>
            </div>

            <div className="flex w-full flex-1 justify-center md:justify-center">
              <div className="grid w-full gap-2 text-sm text-muted-foreground md:w-auto">
                {planSegments.map((segment) => (
                  <div key={segment.label} className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${segment.tone}`}
                    />
                    <span>
                      {segment.label}: {segment.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {membersWithIssues.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              {summary.total === 0
                ? "No tenés miembros asignados todavía."
                : "Todos tus miembros pueden entrenar. Bien hecho! 🎉"}
            </p>
          </div>
        ) : (
          <div
            className={`min-h-0 pr-2 md:pr-3 ${
              membersWithIssues.length > 6
                ? "max-h-[252px] overflow-y-auto"
                : ""
            }`}
          >
            <div className="space-y-2">
              {membersWithIssues.map((m: any) => (
                <div
                  key={m.id}
                  className="flex flex-col justify-center border-b py-1.5 text-sm last:border-b-0"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {m.fullName || m.name}
                    </span>

                    {m.planStatus.status === "none" && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        Sin planificación
                      </span>
                    )}

                    {m.planStatus.status === "expired" && (
                      <Badge
                        variant="outline"
                        className="max-w-full shrink-0 gap-2 rounded-2xl border border-red-300 bg-red-100 px-3 py-1 text-left whitespace-normal text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-400 md:rounded-full"
                      >
                        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        Vencida
                        {m.planStatus.daysExpired !== null && (
                          <span className="font-normal text-red-700/80 dark:text-red-300/80">
                            (hace {m.planStatus.daysExpired} día
                            {m.planStatus.daysExpired !== 1 && "s"})
                          </span>
                        )}
                      </Badge>
                    )}

                    {m.planStatus.status === "expiring_soon" && (
                      <Badge
                        variant="outline"
                        className="max-w-full shrink-0 gap-2 rounded-2xl border border-yellow-300 bg-yellow-100 px-3 py-1 text-left whitespace-normal text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-500/20 dark:text-yellow-400 md:rounded-full"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                        Por vencer
                        {m.planStatus.daysLeft !== null && (
                          <span className="font-normal text-yellow-700/80 dark:text-yellow-300/80">
                            ({m.planStatus.daysLeft} día
                            {m.planStatus.daysLeft !== 1 && "s"})
                          </span>
                        )}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StatsCard>
  );
}
