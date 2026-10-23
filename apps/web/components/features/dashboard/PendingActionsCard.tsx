"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSearch,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Panel, PanelSkeleton, plural } from "./dashboard-panel";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { usePlanificationStatuses } from "@/hooks/use-planification-statuses";
import { isOrgAdminRole } from "@/lib/security/roles";
import { useDashboardScope } from "./dashboard-scope-context";

type Tone = "danger" | "warning" | "info" | "neutral";

type PendingRow = {
  key: string;
  label: string;
  detail: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: Tone;
};

const TONE: Record<Tone, string> = {
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  neutral: "bg-muted text-muted-foreground",
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

  const { summary, isLoading: plansLoading } = usePlanificationStatuses({
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
        label: plural(
          summary.expired,
          "planificación vencida",
          "planificaciones vencidas",
        ),
        detail: "Extendelas o asigná una nueva.",
        count: summary.expired,
        href: "/dashboard/planifications",
        icon: XCircle,
        tone: "danger",
      });
    }

    if (canSeePlanifications && summary.expiringSoon > 0) {
      result.push({
        key: "expiring",
        label: `${summary.expiringSoon} por vencer esta semana`,
        detail: "Preparales la próxima planificación.",
        count: summary.expiringSoon,
        href: "/dashboard/planifications",
        icon: AlertTriangle,
        tone: "warning",
      });
    }

    if (canSeePlanifications && summary.unassigned > 0) {
      result.push({
        key: "unassigned",
        label: plural(
          summary.unassigned,
          "miembro sin planificación",
          "miembros sin planificación",
        ),
        detail: "No tienen rutina para entrenar.",
        count: summary.unassigned,
        href: "/dashboard/planifications",
        icon: ClipboardList,
        tone: "neutral",
      });
    }

    if (isAdmin && joinRequests && joinRequests.length > 0) {
      result.push({
        key: "join",
        label: plural(
          joinRequests.length,
          "solicitud de ingreso",
          "solicitudes de ingreso",
        ),
        detail: "Aprobalas para sumarlos al gimnasio.",
        count: joinRequests.length,
        href: "/dashboard/members",
        icon: UserPlus,
        tone: "info",
      });
    }

    if (canSeePayments && paymentsCount > 0) {
      result.push({
        key: "payments",
        label: plural(
          paymentsCount,
          "comprobante para revisar",
          "comprobantes para revisar",
        ),
        detail: "Aprobalos para dejar la cuota al día.",
        count: paymentsCount,
        href: "/dashboard/payments",
        icon: FileSearch,
        tone: "info",
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

  const isLoading =
    isScopeLoading ||
    (canSeePlanifications && plansLoading) ||
    (isAdmin && joinRequests === undefined) ||
    (canSeePayments && pendingPayments === undefined);
  if (isLoading) return <PanelSkeleton rows={2} />;

  return (
    <Panel
      title="Para resolver"
      description={
        rows.length > 0
          ? plural(
              rows.reduce((acc, row) => acc + row.count, 0),
              "pendiente",
              "pendientes",
            )
          : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-sm">
          <CheckCircle2
            className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <span>
            Todo al día.{" "}
            <span className="text-muted-foreground">
              No hay nada pendiente.
            </span>
          </span>
        </div>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-accent/40"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE[row.tone]}`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {row.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.detail}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
