"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { CheckCircle, UserMinus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { month: "short" }).format(date);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDateMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfMonth(timestamp: number) {
  const date = new Date(timestamp);
  return startOfDateMonth(date);
}

export default function ActiveMembers() {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? { includeInactive: true } : "skip",
  );
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    canQueryCurrentOrganization ? {} : "skip",
  );

  const memberMemberships = useMemo(
    () =>
      (memberships ?? []).filter(
        (member: any) => member.role?.toLowerCase() === "member",
      ),
    [memberships],
  );

  const assignedPlanUserIds = useMemo(
    () =>
      new Set(
        (subscriptions ?? [])
          .filter((subscription: any) => subscription.status !== "cancelled")
          .map((subscription: any) => subscription.userId),
      ),
    [subscriptions],
  );

  const monthlyMembers = useMemo(() => {
    const now = new Date();
    const currentMonth = startOfDateMonth(now);
    const currentMonthKey = monthKey(currentMonth);
    const defaultStartMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1,
    );
    const firstJoinedAt = memberMemberships.reduce<number | null>(
      (earliest, member: any) => {
        const joinedAt = member.joinedAt ?? member.createdAt;
        if (typeof joinedAt !== "number") return earliest;
        return earliest === null ? joinedAt : Math.min(earliest, joinedAt);
      },
      null,
    );
    const firstDataMonth =
      firstJoinedAt === null ? defaultStartMonth : startOfMonth(firstJoinedAt);
    const startMonth =
      firstDataMonth > defaultStartMonth ? firstDataMonth : defaultStartMonth;

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + index,
        1,
      );
      return {
        key: monthKey(date),
        label: monthLabel(date),
        startAt: date.getTime(),
        endAt: endOfMonth(date).getTime(),
      };
    });

    return months.map((month) => {
      const isFutureMonth = month.startAt > currentMonth.getTime();
      const isCurrentMonth = month.key === currentMonthKey;

      return {
        ...month,
        count: isFutureMonth
          ? 0
          : isCurrentMonth
            ? memberMemberships.filter((member: any) =>
                assignedPlanUserIds.has(member.userId),
              ).length
          : memberMemberships.filter((member: any) => {
              const joinedAt = member.joinedAt ?? member.createdAt;
              const status = member.status?.toLowerCase();
              const inactiveSince =
                status === "inactive" ? (member.updatedAt ?? null) : null;

              return (
                typeof joinedAt === "number" &&
                joinedAt <= month.endAt &&
                (typeof inactiveSince !== "number" ||
                  inactiveSince >= month.startAt)
              );
            }).length,
      };
    });
  }, [assignedPlanUserIds, memberMemberships]);

  const activeCount = memberMemberships.filter((member: any) =>
    assignedPlanUserIds.has(member.userId),
  ).length;
  const maxMonthlyMembers = Math.max(
    ...monthlyMembers.map((month) => month.count),
    1,
  );

  if (!memberships || !subscriptions) return null;

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
            {monthlyMembers.map((month) => {
              const heightPct = Math.max(
                (month.count / maxMonthlyMembers) * 100,
                month.count > 0 ? 16 : 8,
              );

              return (
                <div
                  key={month.key}
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
                    {month.label}
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
