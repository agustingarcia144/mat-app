export const DASHBOARD_CARD_IDS = [
  "pending",
  "classes",
  "members",
  "payments",
  "planifications",
] as const;
export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];
export type DashboardColumn = "left" | "right";
export type DashboardLayout = Record<DashboardColumn, DashboardCardId[]>;
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  left: ["pending", "classes"],
  right: ["members", "payments", "planifications"],
};
export function isDashboardCardId(value: unknown): value is DashboardCardId {
  return DASHBOARD_CARD_IDS.some((id) => id === value);
}
export function normalizeDashboardLayout(
  value?: {
    left?: readonly unknown[];
    right?: readonly unknown[];
  } | null,
): DashboardLayout {
  const result: DashboardLayout = { left: [], right: [] };
  const seen = new Set<DashboardCardId>();
  for (const column of ["left", "right"] as const) {
    for (const id of value?.[column] ?? []) {
      if (isDashboardCardId(id) && !seen.has(id)) {
        result[column].push(id);
        seen.add(id);
      }
    }
  }
  for (const column of ["left", "right"] as const) {
    for (const id of DEFAULT_DASHBOARD_LAYOUT[column]) {
      if (!seen.has(id)) result[column].push(id);
    }
  }
  return result;
}
/** Index is the insertion position after removing the moved card. */
export function moveDashboardCard(
  layout: DashboardLayout,
  id: DashboardCardId,
  column: DashboardColumn,
  index: number,
): DashboardLayout {
  const next = {
    left: layout.left.filter((item) => item !== id),
    right: layout.right.filter((item) => item !== id),
  };
  next[column].splice(Math.max(0, Math.min(index, next[column].length)), 0, id);
  return next;
}
export type PlanStatus =
  | "none"
  | "not_started"
  | "active"
  | "expiring_soon"
  | "expired";
export type DashboardPlanFilter =
  | "attention"
  | "active"
  | "expiring_soon"
  | "expired"
  | "unassigned";
export type PlanHealth = {
  status: PlanStatus;
  daysLeft: number | null;
  daysExpired: number | null;
};
export function safePlanDate(value: unknown): Date | null {
  if (
    !value ||
    (typeof value !== "string" &&
      typeof value !== "number" &&
      !(value instanceof Date))
  )
    return null;
  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const date = new Date(`${year}-${month}-${day}`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function computePlanStatus(
  assignment: { startDate?: unknown; endDate?: unknown } | null | undefined,
  now = new Date(),
): PlanHealth {
  if (!assignment) return { status: "none", daysLeft: null, daysExpired: null };
  const start = safePlanDate(assignment.startDate);
  const end = safePlanDate(assignment.endDate);
  if (!start || !end)
    return { status: "not_started", daysLeft: null, daysExpired: null };
  const day = 86_400_000;
  const daysLeft = Math.max(
    Math.ceil((end.getTime() - now.getTime()) / day),
    0,
  );
  if (end <= now)
    return {
      status: "expired",
      daysLeft: 0,
      daysExpired: Math.max(
        Math.ceil((now.getTime() - end.getTime()) / day),
        0,
      ),
    };
  if (start > now)
    return { status: "not_started", daysLeft, daysExpired: null };
  return {
    status: daysLeft <= 7 ? "expiring_soon" : "active",
    daysLeft,
    daysExpired: null,
  };
}
type HealthMember = {
  id: string;
  fullName?: string | null;
  name?: string | null;
  planStatus: PlanHealth;
};
const PRIORITY: Record<PlanStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  none: 2,
  not_started: 2,
  active: 3,
};
export function filterDashboardPlans<T extends HealthMember>(
  members: readonly T[],
  filter: DashboardPlanFilter,
): T[] {
  return members
    .filter(({ planStatus: { status } }) => {
      if (filter === "attention") return status !== "active";
      if (filter === "unassigned")
        return status === "none" || status === "not_started";
      return status === filter;
    })
    .sort((a, b) => {
      const priority =
        PRIORITY[a.planStatus.status] - PRIORITY[b.planStatus.status];
      const urgency =
        a.planStatus.status === "expired" && b.planStatus.status === "expired"
          ? (b.planStatus.daysExpired ?? 0) - (a.planStatus.daysExpired ?? 0)
          : (a.planStatus.status === "active" ||
                a.planStatus.status === "expiring_soon") &&
              a.planStatus.status === b.planStatus.status
            ? (a.planStatus.daysLeft ?? Infinity) -
              (b.planStatus.daysLeft ?? Infinity)
            : 0;
      return (
        priority ||
        (Number.isNaN(urgency) ? 0 : urgency) ||
        (a.fullName || a.name || "").localeCompare(
          b.fullName || b.name || "",
          "es",
        ) ||
        a.id.localeCompare(b.id)
      );
    });
}
