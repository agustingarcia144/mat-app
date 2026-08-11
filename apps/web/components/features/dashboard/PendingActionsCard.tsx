"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import StatsCard from "./StatsCard";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { isOrgAdminRole } from "@/lib/security/roles";
import { useDashboardScope } from "./dashboard-scope-context";

type PendingRow = {
  key: string;
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: string;
};

export default function PendingActionsCard() {
  const {
    responsibleUserId,
    scope,
    role,
    isLoading: isScopeLoading,
  } = useDashboardScope();
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const entitlement = useOrganizationEntitlement();

  const isAdmin = isOrgAdminRole(role);
  const canSeePayments =
    isAdmin && (entitlement?.dashboardCards.includes("payments") ?? false);
  const canSeePlanifications =
    entitlement?.dashboardCards.includes("planifications") ?? false;

  const { summary } = usePlanificationStatuses({
    responsibleUserId,
    skip: isScopeLoading || !canSeePlanifications,
  });

  const joinRequests = useQuery(
    api.joinGym.listPendingJoinRequests,
    canQueryCurrentOrganization && isAdmin ? {} : "skip",
  );

  const pendingPayments = useQuery(
    api.planPayments.getPendingByOrganization,
    canQueryCurrentOrganization && canSeePayments ? {} : "skip",
  );

  // Same query + args as usePlanificationStatuses, so the Convex client dedupes
  // it. Needed on its own because payments must be scoped even when the
  // planifications card is off.
  const myMemberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization && canSeePayments && scope === "mine"
      ? { responsibleUserId }
      : "skip",
  );

  const assignedMemberIds = useMemo(
    () => new Set((myMemberships ?? []).map((m: any) => m.userId)),
    [myMemberships],
  );

  const paymentsCount = useMemo(() => {
    if (!pendingPayments) return 0;
    if (scope === "all") return pendingPayments.length;
    // "Mis miembros": only payments from members I'm responsible for.
    return pendingPayments.filter((payment: any) =>
      assignedMemberIds.has(payment.userId),
    ).length;
  }, [pendingPayments, scope, assignedMemberIds]);

  const rows = useMemo(() => {
    const result: PendingRow[] = [];

    if (canSeePlanifications && summary.expired > 0) {
      result.push({
        key: "expired",
        label: `${summary.expired} planificación${summary.expired === 1 ? "" : "es"} vencida${summary.expired === 1 ? "" : "s"}`,
        count: summary.expired,
        href: "/dashboard/planifications",
        icon: XCircle,
        tone: "text-red-600 dark:text-red-400",
      });
    }

    if (canSeePlanifications && summary.expiringSoon > 0) {
      result.push({
        key: "expiring",
        label: `${summary.expiringSoon} por vencer esta semana`,
        count: summary.expiringSoon,
        href: "/dashboard/planifications",
        icon: AlertTriangle,
        tone: "text-yellow-600 dark:text-yellow-400",
      });
    }

    if (canSeePlanifications && summary.unassigned > 0) {
      result.push({
        key: "unassigned",
        label: `${summary.unassigned} sin planificación asignada`,
        count: summary.unassigned,
        href: "/dashboard/planifications",
        icon: ClipboardList,
        tone: "text-muted-foreground",
      });
    }

    if (isAdmin && joinRequests && joinRequests.length > 0) {
      result.push({
        key: "join",
        label: `${joinRequests.length} solicitud${joinRequests.length === 1 ? "" : "es"} de ingreso`,
        count: joinRequests.length,
        href: "/dashboard/members",
        icon: UserPlus,
        tone: "text-blue-600 dark:text-blue-400",
      });
    }

    if (canSeePayments && paymentsCount > 0) {
      result.push({
        key: "payments",
        label: `${paymentsCount} pago${paymentsCount === 1 ? "" : "s"} en revisión`,
        count: paymentsCount,
        href: "/dashboard/payments",
        icon: Wallet,
        tone: "text-green-600 dark:text-green-400",
      });
    }

    return result;
  }, [
    canSeePlanifications,
    canSeePayments,
    isAdmin,
    joinRequests,
    paymentsCount,
    summary,
  ]);

  const total = rows.reduce((acc, row) => acc + row.count, 0);

  return (
    <StatsCard
      title={total > 0 ? `Pendientes (${total})` : "Pendientes"}
      variant="list"
      compact
      className="min-h-[220px] w-full min-w-0 max-w-none md:h-auto"
    >
      {rows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">
            No tenés pendientes. Todo al día 🎉
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => {
            const Icon = row.icon;

            return (
              <Link
                key={row.key}
                href={row.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/40"
              >
                <Icon className={`h-4 w-4 shrink-0 ${row.tone}`} />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </StatsCard>
  );
}
