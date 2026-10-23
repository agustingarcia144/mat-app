import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CARD_IDS,
  DEFAULT_DASHBOARD_LAYOUT,
  computePlanStatus,
  filterDashboardPlans,
  moveDashboardCard,
  normalizeDashboardLayout,
  type DashboardPlanFilter,
  type PlanHealth,
} from "./dashboard";

const now = new Date("2026-10-23T12:00:00Z");
const day = 86_400_000;
const assignment = (days: number) => ({
  startDate: "2026-10-01T12:00:00Z",
  endDate: new Date(now.getTime() + days * day).toISOString(),
});
const member = (
  id: string,
  status: PlanHealth["status"],
  daysLeft: number | null = null,
  daysExpired: number | null = null,
) => ({ id, name: id, planStatus: { status, daysLeft, daysExpired } });

describe("dashboard plan health", () => {
  it.each([1, 5, 6, 7])("includes plans expiring in %i days", (days) => {
    expect(computePlanStatus(assignment(days), now)).toEqual({
      status: "expiring_soon",
      daysLeft: days,
      daysExpired: null,
    });
  });
  it("keeps plans just beyond seven days active", () => {
    expect(computePlanStatus(assignment(7 + 1 / day), now).status).toBe(
      "active",
    );
  });
  it("recognizes expiry at the current instant and overdue duration", () => {
    expect(computePlanStatus(assignment(0), now)).toEqual({
      status: "expired",
      daysLeft: 0,
      daysExpired: 0,
    });
    expect(computePlanStatus(assignment(-3), now).daysExpired).toBe(3);
  });
  it("distinguishes missing, invalid and future assignments", () => {
    expect(computePlanStatus(null, now).status).toBe("none");
    expect(computePlanStatus({ startDate: "invalid" }, now).status).toBe(
      "not_started",
    );
    expect(
      computePlanStatus({ ...assignment(7), startDate: "2026-10-24" }, now)
        .status,
    ).toBe("not_started");
  });
  it("continues accepting existing day/month/year dates", () => {
    expect(
      computePlanStatus({ startDate: "01/10/2026", endDate: "30/10/2026" }, now)
        .status,
    ).toBe("expiring_soon");
  });
  const members = [
    member("Sin plan", "none"),
    member("Próxima", "not_started"),
    member("Lejana", "expiring_soon", 7),
    member("Cercana", "expiring_soon", 1),
    member("Reciente", "expired", 0, 1),
    member("Antigua", "expired", 0, 20),
    member("Vigente", "active", 15),
  ];
  it.each([
    ["active", 1],
    ["expiring_soon", 2],
    ["expired", 2],
    ["unassigned", 2],
    ["attention", 6],
  ] satisfies [DashboardPlanFilter, number][])(
    "filters %s with matching summary counts",
    (filter, count) => {
      expect(filterDashboardPlans(members, filter)).toHaveLength(count);
    },
  );
  it("prioritizes oldest overdue, then nearest expiry, then unassigned", () => {
    expect(filterDashboardPlans(members, "attention").map((m) => m.id)).toEqual(
      ["Antigua", "Reciente", "Cercana", "Lejana", "Próxima", "Sin plan"],
    );
  });
  it("orders unassigned members by name even when a future plan has an end date", () => {
    expect(
      filterDashboardPlans(
        [member("Zoe", "not_started", 20), member("Ana", "none")],
        "unassigned",
      ).map((m) => m.id),
    ).toEqual(["Ana", "Zoe"]);
  });
  it("uses names to break ties and does not mutate the input", () => {
    const input = [
      member("Zoe", "expiring_soon", 2),
      member("Ana", "expiring_soon", 2),
    ];
    expect(
      filterDashboardPlans(input, "expiring_soon").map((m) => m.id),
    ).toEqual(["Ana", "Zoe"]);
    expect(input[0].id).toBe("Zoe");
    expect(filterDashboardPlans(input, "expired")).toEqual([]);
  });
});

describe("personal dashboard layouts", () => {
  it("uses independent copies of the existing default layout", () => {
    const layout = normalizeDashboardLayout();
    expect(layout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    layout.left.reverse();
    expect(DEFAULT_DASHBOARD_LAYOUT.left).toEqual(["pending", "classes"]);
  });
  it("preserves saved order and fills missing cards in their default columns", () => {
    expect(
      normalizeDashboardLayout({
        left: ["planifications"],
        right: ["pending"],
      }),
    ).toEqual({
      left: ["planifications", "classes"],
      right: ["pending", "members", "payments"],
    });
  });
  it("drops unknown and duplicate identifiers", () => {
    const result = normalizeDashboardLayout({
      left: ["members", "members", "unknown"],
      right: ["members"],
    });
    expect([...result.left, ...result.right].sort()).toEqual(
      [...DASHBOARD_CARD_IDS].sort(),
    );
  });
  it("keeps a deliberately empty column", () => {
    expect(
      normalizeDashboardLayout({ left: [], right: [...DASHBOARD_CARD_IDS] })
        .left,
    ).toEqual([]);
  });
  it("moves cards both up and down without duplicates or input mutation", () => {
    const layout = normalizeDashboardLayout();
    const down = moveDashboardCard(layout, "members", "right", 2);
    expect(down.right).toEqual(["payments", "planifications", "members"]);
    expect(moveDashboardCard(down, "members", "right", 0)).toEqual(layout);
    expect(layout).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });
  it("moves cards across columns including to an empty column", () => {
    const layout = { left: [], right: [...DASHBOARD_CARD_IDS] };
    const moved = moveDashboardCard(layout, "planifications", "left", 0);
    expect(moved.left).toEqual(["planifications"]);
    expect(moved.right).not.toContain("planifications");
  });
  it("preserves unavailable cards and clamps insertion positions", () => {
    const layout = normalizeDashboardLayout();
    const moved = moveDashboardCard(layout, "planifications", "left", 100);
    expect(moved.left).toEqual(["pending", "classes", "planifications"]);
    expect(moved.right).toEqual(["members", "payments"]);
    expect(moveDashboardCard(moved, "classes", "left", -1).left[0]).toBe(
      "classes",
    );
  });
});
