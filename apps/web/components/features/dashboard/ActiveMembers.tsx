"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CheckCircle, UserMinus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function monthLabelFromPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "short" }).format(
    new Date(year, month - 1, 1),
  );
}

export default function ActiveMembers() {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.metrics.getActiveMembersHistory,
    canQueryCurrentOrganization ? {} : "skip",
  );

  if (!data) return null;

  const { activeCount, months } = data;
  const maxMonthlyMembers = Math.max(...months.map((month) => month.count), 1);

  return (
    <Card className="flex min-h-[220px] w-full max-w-none flex-col rounded-2xl border bg-background/60 p-4 md:h-[220px] md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-semibold text-foreground">
          Miembros activos
        </div>
        <Link
          href="/dashboard/metrics/churn"
          className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/40"
        >
          <UserMinus className="h-4 w-4" />
          Ver mas +
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center py-2 md:py-0">
        <div className="grid w-full max-w-[520px] grid-cols-[auto_minmax(0,1fr)] items-center gap-5 md:gap-8">
          <div className="flex flex-col items-center justify-center gap-3">
            <p className="text-4xl font-semibold leading-none md:text-5xl">
              {activeCount}
            </p>
            <Badge variant="outline" className="gap-2 px-3">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              Activos
            </Badge>
          </div>

          <div className="flex h-[132px] min-w-0 items-end gap-2 rounded-xl border bg-background/30 px-3 pb-3 pt-4">
            {months.map((month) => {
              const heightPct = Math.max(
                (month.count / maxMonthlyMembers) * 100,
                month.count > 0 ? 16 : 8,
              );

              return (
                <div
                  key={month.period}
                  className="flex h-full min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <span className="text-sm font-semibold leading-none">
                    {month.count}
                  </span>
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-green-600 to-green-500"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {monthLabelFromPeriod(month.period)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
