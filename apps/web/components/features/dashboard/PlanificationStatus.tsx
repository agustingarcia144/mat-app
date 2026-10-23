"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  filterDashboardPlans,
  type DashboardPlanFilter,
  type PlanHealth,
} from "@repo/core/utils";
import { cn } from "@/lib/utils";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { Panel, PanelEmpty, PanelSkeleton, plural } from "./dashboard-panel";
import { useDashboardScope } from "./dashboard-scope-context";

/** Keep the initial card compact; expand the matching records in place. */
const ATTENTION_LIMIT = 5;

function describeIssue(planStatus: PlanHealth) {
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
  if (planStatus.status === "active") {
    return {
      dot: "bg-emerald-500",
      text:
        planStatus.daysLeft !== null
          ? `Vence en ${plural(planStatus.daysLeft, "día", "días")}`
          : "Al día",
      tone: "text-emerald-600 dark:text-emerald-400",
    };
  }
  return {
    dot: "bg-muted-foreground/50",
    text:
      planStatus.status === "not_started"
        ? "Aún no iniciada"
        : "Sin planificación",
    tone: "text-muted-foreground",
  };
}

export default function PlanificationStatus() {
  const { organizationId, myUserId, responsibleUserId } = useDashboardScope();
  return (
    <PlanificationStatusList
      key={`${organizationId}:${myUserId}:${responsibleUserId ?? "all"}`}
    />
  );
}

function PlanificationStatusList() {
  const [filter, setFilter] = useState<DashboardPlanFilter>("attention");
  const [expanded, setExpanded] = useState(false);
  const { responsibleUserId, isLoading: isScopeLoading } = useDashboardScope();

  const { isLoading, members, summary } = usePlanificationStatuses({
    responsibleUserId,
    skip: isScopeLoading,
  });

  if (isLoading || isScopeLoading) return <PanelSkeleton rows={4} />;

  const segments = [
    {
      filter: "active",
      label: "Al día",
      count: summary.assigned,
      tone: "bg-emerald-500",
    },
    {
      filter: "expiring_soon",
      label: "Por vencer",
      count: summary.expiringSoon,
      tone: "bg-amber-500",
    },
    {
      filter: "expired",
      label: "Vencidas",
      count: summary.expired,
      tone: "bg-red-500",
    },
    {
      filter: "unassigned",
      label: "Sin asignar",
      count: summary.unassigned,
      tone: "bg-muted-foreground/40",
    },
  ] satisfies {
    filter: DashboardPlanFilter;
    label: string;
    count: number;
    tone: string;
  }[];

  const issues = filterDashboardPlans(members, filter);
  const listTitle =
    segments.find((segment) => segment.filter === filter)?.label ??
    "Necesitan atención";

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
              <button
                type="button"
                key={segment.label}
                aria-pressed={filter === segment.filter}
                onClick={() => {
                  setFilter(
                    filter === segment.filter ? "attention" : segment.filter,
                  );
                  setExpanded(false);
                }}
                className={cn(
                  "min-w-0 rounded-md p-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === segment.filter && "bg-accent ring-1 ring-border",
                )}
              >
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
              </button>
            ))}
          </div>

          <div className="mt-4 border-t pt-3">
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {filter === "attention"
                  ? "Todos tus miembros tienen planificación vigente."
                  : "No hay miembros con este estado."}
              </p>
            ) : (
              <>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {listTitle}
                </p>
                <ul className="-mx-1 divide-y divide-border/50">
                  {(expanded ? issues : issues.slice(0, ATTENTION_LIMIT)).map(
                    (member: any) => {
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
                    },
                  )}
                </ul>
                {issues.length > ATTENTION_LIMIT && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {expanded
                      ? "Ver menos"
                      : `Ver ${issues.length - ATTENTION_LIMIT} más`}
                    {expanded ? (
                      <ChevronUp className="size-3.5" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden />
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
