"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { isOrgAdminRole } from "@/lib/security/roles";
import { cn } from "@/lib/utils";
import {
  formatArs,
  KpiTile,
  percentChange,
  plural,
  type Trend,
} from "./dashboard-panel";
import { useDashboardScope } from "./dashboard-scope-context";
import { useTodayBounds } from "./use-today-bounds";

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** Headline numbers for the day; each tile links to the page behind it. */
export default function DashboardKpis() {
  const canQuery = useCanQueryCurrentOrganization();
  const entitlement = useOrganizationEntitlement();
  const {
    role,
    scope,
    myUserId,
    responsibleUserId,
    isLoading: isScopeLoading,
  } = useDashboardScope();
  const [now] = useState(() => Date.now());
  const dayBounds = useTodayBounds();

  const cards = entitlement?.dashboardCards ?? [];
  const showMembers = cards.includes("members");
  const showClasses = cards.includes("classes");
  const showPlanifications = cards.includes("planifications");
  const showPayments = isOrgAdminRole(role) && cards.includes("payments");

  const members = useQuery(
    api.metrics.getActiveMembersHistory,
    canQuery && !isScopeLoading && showMembers ? { responsibleUserId } : "skip",
  );
  const schedules = useQuery(
    api.classSchedules.getScheduleSummaryForDay,
    canQuery && showClasses ? dayBounds : "skip",
  );
  const { summary, isLoading: plansLoading } = usePlanificationStatuses({
    responsibleUserId,
    skip: isScopeLoading || !showPlanifications,
  });
  const metrics = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery && showPayments ? {} : "skip",
  );
  // Staff without payments access see their own commission instead.
  const commission = useQuery(
    api.payroll.getMyCommissionSummary,
    canQuery && !showPayments ? {} : "skip",
  );

  const todayClasses = useMemo(
    () =>
      (schedules ?? [])
        .filter((s: any) => s.status !== "cancelled")
        .filter((s: any) =>
          scope === "mine" && myUserId ? s.inChargeUserId === myUserId : true,
        )
        .sort((a: any, b: any) => a.startTime - b.startTime),
    [schedules, scope, myUserId],
  );

  if (!entitlement || isScopeLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[96px] rounded-xl sm:h-[112px]" />
        ))}
      </div>
    );
  }

  const tiles: React.ReactNode[] = [];

  if (showMembers) {
    const months = members?.months ?? [];
    const previous = months.length >= 2 ? months[months.length - 2] : null;
    const diff = members && previous ? members.activeCount - previous.count : 0;
    const change =
      members && previous
        ? percentChange(members.activeCount, previous.count)
        : null;
    tiles.push(
      <KpiTile
        key="members"
        label={scope === "mine" ? "Mis miembros activos" : "Miembros activos"}
        value={members ? members.activeCount : "…"}
        href="/dashboard/members"
        pill={
          change ?? (diff ? `${diff > 0 ? "+" : "−"}${Math.abs(diff)}` : null)
        }
        trend={diff > 0 ? "up" : diff < 0 ? "down" : "neutral"}
        detail={
          !members || !previous
            ? null
            : diff === 0
              ? "Igual que el mes anterior"
              : `${diff > 0 ? "Subió" : "Bajó"} ${Math.abs(diff)} vs mes anterior`
        }
      />,
    );
  }

  if (showClasses) {
    const nextClass = todayClasses.find((s: any) => s.startTime >= now);
    tiles.push(
      <KpiTile
        key="classes"
        label={scope === "mine" ? "Mis clases hoy" : "Clases hoy"}
        value={schedules ? todayClasses.length : "…"}
        href="/dashboard/classes"
        pill={nextClass ? formatTime(nextClass.startTime) : null}
        detail={
          !schedules
            ? null
            : nextClass
              ? `Próxima: ${nextClass.className}`
              : todayClasses.length > 0
                ? "No quedan clases hoy"
                : "Sin clases programadas"
        }
      />,
    );
  }

  if (showPlanifications) {
    const needsAttention = summary.expired + summary.expiringSoon;
    const planTrend: Trend =
      summary.expired > 0 ? "down" : needsAttention > 0 ? "warning" : "up";
    tiles.push(
      <KpiTile
        key="plans"
        label="Planificaciones al día"
        value={plansLoading ? "…" : `${summary.assignedPct}%`}
        href="/dashboard/planifications"
        pill={
          plansLoading || summary.total === 0
            ? null
            : summary.expired > 0
              ? plural(summary.expired, "vencida", "vencidas")
              : summary.expiringSoon > 0
                ? `${summary.expiringSoon} por vencer`
                : "Al día"
        }
        trend={planTrend}
        detail={
          plansLoading
            ? null
            : summary.total === 0
              ? "Sin miembros asignados"
              : `${summary.assigned} de ${summary.total} miembros entrenando`
        }
      />,
    );
  }

  if (showPayments) {
    const overview = metrics?.overview;
    const rate = overview?.collectionRatePct ?? 0;
    tiles.push(
      <KpiTile
        key="payments"
        label="Cobrado este mes"
        value={overview ? formatArs(overview.approvedRevenueArs) : "…"}
        href="/dashboard/finance"
        pill={overview ? `${rate}%` : null}
        trend={rate >= 80 ? "up" : rate >= 50 ? "warning" : "down"}
        detail={
          overview
            ? `De ${formatArs(overview.expectedRevenueArs)} esperados`
            : null
        }
      >
        {overview ? (
          <div
            className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Cobranza del mes"
            aria-valuenow={rate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
        ) : null}
      </KpiTile>,
    );
  } else if (commission) {
    tiles.push(
      <KpiTile
        key="commission"
        label="Mi comisión"
        value={formatArs(commission.commissionAmount)}
        pill={`${commission.commissionPercentage}%`}
        detail={`Sobre ${formatArs(commission.base)} · ${plural(commission.assignedMemberCount, "miembro", "miembros")}`}
      />,
    );
  }

  if (tiles.length === 0) return null;

  // An odd tile out spans the full row on phones instead of sitting alone.
  const items =
    tiles.length % 2 === 1
      ? [
          ...tiles.slice(0, -1),
          <div key="last" className="col-span-2 grid lg:col-span-1">
            {tiles[tiles.length - 1]}
          </div>,
        ]
      : tiles;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:gap-3",
        tiles.length >= 4 && "lg:grid-cols-4",
        tiles.length === 3 && "lg:grid-cols-3",
      )}
    >
      {items}
    </div>
  );
}
