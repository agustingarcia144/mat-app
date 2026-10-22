"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";
import { Panel, PanelSkeleton, TrendPill, plural } from "./dashboard-panel";
import { useDashboardScope } from "./dashboard-scope-context";

function monthLabelFromPeriod(period: string, month: "short" | "long") {
  const [year, monthNumber] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    month,
    ...(month === "long" ? { year: "numeric" } : {}),
  })
    .format(new Date(year, monthNumber - 1, 1))
    .replace(".", "");
}

export default function ActiveMembers() {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const {
    responsibleUserId,
    scope,
    isLoading: isScopeLoading,
  } = useDashboardScope();
  const data = useQuery(
    api.metrics.getActiveMembersHistory,
    canQueryCurrentOrganization && !isScopeLoading
      ? { responsibleUserId }
      : "skip",
  );

  if (!data) return <PanelSkeleton rows={3} />;

  const { activeCount, months } = data;
  const max = Math.max(...months.map((month) => month.count), 1);
  const lastIndex = months.length - 1;
  const previous = months[lastIndex - 1];
  const change = previous ? activeCount - previous.count : null;
  const peak = Math.max(...months.map((month) => month.count), 0);

  return (
    <Panel
      title={scope === "mine" ? "Mis miembros activos" : "Miembros activos"}
      description={`Últimos ${months.length} meses`}
      href="/dashboard/metrics/churn"
      linkLabel="Ver más"
    >
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,9rem)_1fr]">
        {/* Headline: who is active today and how it moved since last month */}
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-center">
          <div>
            <p className="text-5xl font-semibold leading-none tracking-tight tabular-nums">
              {activeCount}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">activos hoy</p>
          </div>
          <div className="flex flex-col items-end gap-1 sm:items-start">
            {change !== null && change !== 0 ? (
              <TrendPill trend={change > 0 ? "up" : "down"}>
                {change > 0 ? "+" : "−"}
                {Math.abs(change)} vs{" "}
                {monthLabelFromPeriod(previous.period, "short")}
              </TrendPill>
            ) : change === 0 ? (
              <TrendPill trend="neutral">
                Igual que {monthLabelFromPeriod(previous.period, "short")}
              </TrendPill>
            ) : null}
            {peak > activeCount ? (
              <span className="text-xs text-muted-foreground">
                Máximo: {peak}
              </span>
            ) : activeCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                Máximo del período
              </span>
            ) : null}
          </div>
        </div>

        {/* Monthly bars with the count on top, current month highlighted */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <div
            className="flex h-32 items-end gap-2 sm:gap-3"
            role="img"
            aria-label="Miembros activos de los últimos meses"
          >
            {months.map((month, index) => {
              const isCurrent = index === lastIndex;
              return (
                <Tooltip key={month.period}>
                  <TooltipTrigger asChild>
                    <div className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1">
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {month.count}
                      </span>
                      <div
                        className={cn(
                          "w-full max-w-10 rounded-md transition-colors",
                          isCurrent
                            ? "bg-emerald-500"
                            : month.count > 0
                              ? "bg-emerald-500/35 hover:bg-emerald-500/50"
                              : "bg-muted",
                        )}
                        style={{
                          height: `${Math.max((month.count / max) * 78, month.count > 0 ? 6 : 3)}%`,
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="first-letter:uppercase">
                      {monthLabelFromPeriod(month.period, "long")}
                    </p>
                    <p>
                      {plural(month.count, "miembro", "miembros")}
                      {month.isPaidBased ? " con la cuota paga" : " activos"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 sm:gap-3">
            {months.map((month, index) => (
              <span
                key={month.period}
                className={cn(
                  "flex-1 text-center text-xs capitalize text-muted-foreground",
                  index === lastIndex && "font-medium text-foreground",
                )}
              >
                {monthLabelFromPeriod(month.period, "short")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
