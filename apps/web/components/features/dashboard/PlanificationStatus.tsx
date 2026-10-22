"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { Panel, PanelEmpty, PanelSkeleton, plural } from "./dashboard-panel";
import { useDashboardScope } from "./dashboard-scope-context";

/** Keeps the panel close to the left column's height; the rest is one click away. */
const ATTENTION_LIMIT = 5;

const ISSUE_ORDER: Record<string, number> = {
  expired: 0,
  expiring_soon: 1,
  none: 2,
  not_started: 2,
};

function describeIssue(planStatus: {
  status: string;
  daysLeft: number | null;
  daysExpired: number | null;
}) {
  if (planStatus.status === "expired") {
    return {
      dot: "bg-red-500",
      text:
        planStatus.daysExpired !== null
          ? planStatus.daysExpired === 0
            ? "Venció hoy"
            : `Venció hace ${plural(planStatus.daysExpired, "día", "días")}`
          : "Vencida",
      tone: "text-red-600 dark:text-red-400",
    };
  }
  if (planStatus.status === "expiring_soon") {
    return {
      dot: "bg-amber-500",
      text:
        planStatus.daysLeft !== null
          ? planStatus.daysLeft === 0
            ? "Vence hoy"
            : `Vence en ${plural(planStatus.daysLeft, "día", "días")}`
          : "Por vencer",
      tone: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    dot: "bg-muted-foreground/50",
    text: "Sin planificación",
    tone: "text-muted-foreground",
  };
}

export default function PlanificationStatus() {
  const { responsibleUserId, isLoading: isScopeLoading } = useDashboardScope();

  const { isLoading, membersWithIssues, summary } = usePlanificationStatuses({
    responsibleUserId,
    skip: isScopeLoading,
  });

  if (isLoading || isScopeLoading) return <PanelSkeleton rows={4} />;

  const segments = [
    { label: "Al día", count: summary.assigned, tone: "bg-emerald-500" },
    { label: "Por vencer", count: summary.expiringSoon, tone: "bg-amber-500" },
    { label: "Vencidas", count: summary.expired, tone: "bg-red-500" },
    {
      label: "Sin asignar",
      count: summary.unassigned,
      tone: "bg-muted-foreground/40",
    },
  ];

  const issues = [...membersWithIssues].sort(
    (a: any, b: any) =>
      (ISSUE_ORDER[a.planStatus.status] ?? 3) -
      (ISSUE_ORDER[b.planStatus.status] ?? 3),
  );

  return (
    <Panel
      title="Planificaciones"
      description={
        summary.total > 0
          ? `${summary.assigned} de ${summary.total} miembros al día`
          : undefined
      }
      href="/dashboard/planifications"
    >
      {summary.total === 0 ? (
        <PanelEmpty>No tenés miembros asignados todavía.</PanelEmpty>
      ) : (
        <>
          <div
            className="flex h-2 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={segments
              .map((s) => `${s.label}: ${s.count}`)
              .join(", ")}
          >
            {segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <div
                  key={segment.label}
                  className={segment.tone}
                  style={{ flexGrow: segment.count }}
                />
              ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {segments.map((segment) => (
              <div key={segment.label} className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      segment.tone,
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{segment.label}</span>
                </p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    segment.count === 0 && "text-muted-foreground",
                  )}
                >
                  {segment.count}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t pt-3">
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos tus miembros tienen planificación vigente.
              </p>
            ) : (
              <>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Necesitan atención
                </p>
                <ul className="-mx-1 divide-y divide-border/50">
                  {issues.slice(0, ATTENTION_LIMIT).map((member: any) => {
                    const issue = describeIssue(member.planStatus);
                    return (
                      <li
                        key={member.id}
                        className="flex items-center gap-3 px-1 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {member.fullName || member.name}
                        </span>
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 text-xs",
                            issue.tone,
                          )}
                        >
                          <span
                            className={cn("size-1.5 rounded-full", issue.dot)}
                            aria-hidden
                          />
                          {issue.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {issues.length > ATTENTION_LIMIT && (
                  <Link
                    href="/dashboard/planifications"
                    className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Ver {issues.length - ATTENTION_LIMIT} más
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
