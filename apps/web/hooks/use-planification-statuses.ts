"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "convex/react";
import { mapMembershipsToMembers } from "@repo/core/utils";

import { api } from "@/convex/_generated/api";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

export type PlanStatus =
  | "none"
  | "not_started"
  | "active"
  | "expiring_soon"
  | "expired";

function safeDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(`${year}-${month}-${day}`);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function computePlanStatus(assignment: any) {
  if (!assignment) {
    return { status: "none", daysLeft: null, daysExpired: null };
  }

  const start = safeDate(assignment.startDate);
  const end = safeDate(assignment.endDate);
  const now = new Date();

  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

  if (!start || !end) {
    return { status: "not_started", daysLeft: null, daysExpired: null };
  }

  const daysLeftRaw = diffDays(now, end);
  const daysLeft = Math.max(daysLeftRaw, 0);

  const daysExpiredRaw = diffDays(end, now);
  const daysExpired = end <= now ? Math.max(daysExpiredRaw, 0) : null;

  if (end <= now) {
    return { status: "expired", daysLeft: 0, daysExpired };
  }

  if (start > now) {
    return { status: "not_started", daysLeft, daysExpired: null };
  }

  if (daysLeft <= 5) {
    return { status: "expiring_soon", daysLeft, daysExpired: null };
  }

  return { status: "active", daysLeft, daysExpired: null };
}

function getDateTime(value: any, fallback: number) {
  return safeDate(value)?.getTime() ?? fallback;
}

function pickRelevantAssignment(assignments: any[] | undefined) {
  const activeAssignments =
    assignments?.filter((a: any) => a.status === "active") ?? [];

  if (activeAssignments.length === 0) return null;

  const withStatus = activeAssignments.map((assignment: any) => ({
    assignment,
    planStatus: computePlanStatus(assignment),
  }));

  const byNewestStart = (a: any, b: any) =>
    getDateTime(b.assignment.startDate, 0) -
      getDateTime(a.assignment.startDate, 0) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);

  const byNextStart = (a: any, b: any) =>
    getDateTime(a.assignment.startDate, Number.MAX_SAFE_INTEGER) -
      getDateTime(b.assignment.startDate, Number.MAX_SAFE_INTEGER) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);

  const byLatestEnd = (a: any, b: any) =>
    getDateTime(b.assignment.endDate, 0) -
      getDateTime(a.assignment.endDate, 0) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);

  const current = withStatus
    .filter(
      ({ planStatus }: any) =>
        planStatus.status === "active" || planStatus.status === "expiring_soon",
    )
    .sort(byNewestStart);

  if (current[0]) return current[0].assignment;

  const upcoming = withStatus
    .filter(({ planStatus }: any) => planStatus.status === "not_started")
    .sort(byNextStart);

  if (upcoming[0]) return upcoming[0].assignment;

  const expired = withStatus
    .filter(({ planStatus }: any) => planStatus.status === "expired")
    .sort(byLatestEnd);

  return expired[0]?.assignment ?? activeAssignments[0] ?? null;
}

const normalize = (v?: string) => v?.toLowerCase().trim() ?? "";

type Options = {
  /** When set, only members assigned to this staff member are considered. */
  responsibleUserId?: string;
  /** Skip everything (e.g. while the scope is still resolving). */
  skip?: boolean;
};

/**
 * Planification health of the organization's members.
 *
 * Shared by the dashboard's "Estado de Planificaciones" card and the
 * "Pendientes" card so the per-member assignment fan-out happens once.
 */
export function usePlanificationStatuses({
  responsibleUserId,
  skip = false,
}: Options = {}) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization && !skip ? { responsibleUserId } : "skip",
  );

  const members = useMemo(() => {
    if (!memberships) return [];

    const all = mapMembershipsToMembers(memberships);

    return all.filter(
      (m: any) => normalize(m.role) === "member" && m.usesPlanification !== false,
    );
  }, [memberships]);

  const queries = useMemo(() => {
    if (!members.length) return {};

    return Object.fromEntries(
      members.map((m: any) => [
        m.id,
        {
          query: api.planificationAssignments.getByUser,
          args: { userId: m.id },
        },
      ]),
    );
  }, [members]);

  const assignmentsByUser = useQueries(queries);

  const membersWithStatuses = useMemo(() => {
    if (!members.length) return [];

    return members.map((m: any) => {
      const res = assignmentsByUser[m.id];
      const assignments = res instanceof Error ? undefined : res;

      const activeAssignment = pickRelevantAssignment(assignments);

      return { ...m, planStatus: computePlanStatus(activeAssignment) };
    });
  }, [members, assignmentsByUser]);

  const membersWithIssues = useMemo(
    () =>
      membersWithStatuses.filter(
        (m: any) =>
          m.planStatus.status === "none" ||
          m.planStatus.status === "expired" ||
          m.planStatus.status === "expiring_soon",
      ),
    [membersWithStatuses],
  );

  const summary = useMemo(() => {
    const total = membersWithStatuses.length;

    const countBy = (...statuses: PlanStatus[]) =>
      membersWithStatuses.filter((member: any) =>
        statuses.includes(member.planStatus.status),
      ).length;

    const assigned = countBy("active");
    const expiringSoon = countBy("expiring_soon");
    const expired = countBy("expired");
    const unassigned = countBy("none", "not_started");

    const toPercent = (value: number) =>
      total > 0 ? Math.round((value / total) * 100) : 0;

    return {
      total,
      assigned,
      expiringSoon,
      expired,
      unassigned,
      assignedPct: toPercent(assigned),
      expiringSoonPct: toPercent(expiringSoon),
      expiredPct: toPercent(expired),
      unassignedPct: toPercent(unassigned),
    };
  }, [membersWithStatuses]);

  return {
    isLoading: memberships === undefined,
    members: membersWithStatuses,
    membersWithIssues,
    summary,
  };
}
