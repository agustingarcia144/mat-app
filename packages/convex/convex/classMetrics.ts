import { query } from "./_generated/server";
import {
  requireAdmin,
  requireCurrentOrganizationMembership,
} from "./permissions";

function getPeriod(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getHour(ts: number) {
  return new Date(ts).getHours();
}

function getDayOfWeek(ts: number) {
  // 0 = Sunday ... 6 = Saturday
  return new Date(ts).getDay();
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const getClassMetrics = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const now = Date.now();

    // ── Fetch data ──────────────────────────────────────────────────────────
    const [schedules, reservations, classes] = await Promise.all([
      ctx.db
        .query("classSchedules")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
      ctx.db
        .query("classReservations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
      ctx.db
        .query("classes")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
    ]);

    const classMap = new Map(classes.map((c) => [c._id, c]));

    // Past non-cancelled schedules
    const pastSchedules = schedules.filter(
      (s) => s.startTime < now && s.status !== "cancelled",
    );

    // Non-cancelled reservations on past schedules
    const pastScheduleIds = new Set(pastSchedules.map((s) => s._id));
    const activeReservations = reservations.filter(
      (r) => r.status !== "cancelled" && pastScheduleIds.has(r.scheduleId),
    );

    const attended = activeReservations.filter((r) => r.status === "attended").length;
    const noShow = activeReservations.filter((r) => r.status === "no_show").length;
    const confirmed = activeReservations.filter((r) => r.status === "confirmed").length;
    const totalCancelled = reservations.filter((r) => r.status === "cancelled").length;
    const totalEverReserved = reservations.length;

    const closedReservations = attended + noShow; // past + resolved
    const attendanceRate =
      closedReservations > 0
        ? Math.round((attended / closedReservations) * 1000) / 10
        : null;
    const noShowRate =
      closedReservations > 0
        ? Math.round((noShow / closedReservations) * 1000) / 10
        : null;
    const cancellationRate =
      totalEverReserved > 0
        ? Math.round((totalCancelled / totalEverReserved) * 1000) / 10
        : null;

    // Average occupancy (past schedules with capacity > 0)
    const occupancyData = pastSchedules
      .filter((s) => s.capacity > 0)
      .map((s) => {
        const count = activeReservations.filter(
          (r) => r.scheduleId === s._id,
        ).length;
        return count / s.capacity;
      });
    const avgOccupancyRate =
      occupancyData.length > 0
        ? Math.round(
            (occupancyData.reduce((a, b) => a + b, 0) / occupancyData.length) *
              1000,
          ) / 10
        : null;

    // ── Busiest hours ────────────────────────────────────────────────────────
    const hourCounts: Record<number, number> = {};
    for (const s of pastSchedules) {
      const h = getHour(s.startTime);
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }
    const busiestHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: Number(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── Busiest days of week ─────────────────────────────────────────────────
    const dayCounts: Record<number, number> = {};
    for (const s of pastSchedules) {
      const d = getDayOfWeek(s.startTime);
      dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    }
    const busiestDays = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      label: DAY_LABELS[i] ?? "",
      count: dayCounts[i] ?? 0,
    }));

    // ── Most popular classes ─────────────────────────────────────────────────
    const classCounts: Record<
      string,
      { reservations: number; attended: number; noShow: number; schedules: number }
    > = {};
    for (const s of pastSchedules) {
      const id = s.classId as string;
      if (!classCounts[id]) {
        classCounts[id] = { reservations: 0, attended: 0, noShow: 0, schedules: 0 };
      }
      classCounts[id]!.schedules += 1;
    }
    for (const r of activeReservations) {
      const id = r.classId as string;
      if (!classCounts[id]) continue;
      classCounts[id]!.reservations += 1;
      if (r.status === "attended") classCounts[id]!.attended += 1;
      if (r.status === "no_show") classCounts[id]!.noShow += 1;
    }
    const popularClasses = Object.entries(classCounts)
      .map(([classId, stats]) => {
        const cls = classMap.get(classId as any);
        const closed = stats.attended + stats.noShow;
        return {
          classId,
          name: cls?.name ?? "Clase eliminada",
          schedules: stats.schedules,
          reservations: stats.reservations,
          attended: stats.attended,
          attendanceRate:
            closed > 0
              ? Math.round((stats.attended / closed) * 1000) / 10
              : null,
        };
      })
      .sort((a, b) => b.reservations - a.reservations)
      .slice(0, 6);

    // ── Monthly trend (last 6 months) ────────────────────────────────────────
    const monthlyMap: Record<
      string,
      { period: string; schedulesHeld: number; attended: number; noShow: number; totalReservations: number }
    > = {};

    // seed last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[p] = { period: p, schedulesHeld: 0, attended: 0, noShow: 0, totalReservations: 0 };
    }

    for (const s of pastSchedules) {
      const p = getPeriod(s.startTime);
      if (!monthlyMap[p]) continue;
      monthlyMap[p]!.schedulesHeld += 1;
    }
    for (const r of activeReservations) {
      const schedule = schedules.find((s) => s._id === r.scheduleId);
      if (!schedule) continue;
      const p = getPeriod(schedule.startTime);
      if (!monthlyMap[p]) continue;
      monthlyMap[p]!.totalReservations += 1;
      if (r.status === "attended") monthlyMap[p]!.attended += 1;
      if (r.status === "no_show") monthlyMap[p]!.noShow += 1;
    }

    const monthlyTrend = Object.values(monthlyMap).map((m) => ({
      ...m,
      attendanceRate:
        m.attended + m.noShow > 0
          ? Math.round((m.attended / (m.attended + m.noShow)) * 1000) / 10
          : null,
    }));

    return {
      overview: {
        totalSchedulesHeld: pastSchedules.length,
        totalReservations: activeReservations.length,
        totalAttended: attended,
        totalNoShow: noShow,
        totalConfirmedPending: confirmed,
        attendanceRate,
        noShowRate,
        cancellationRate,
        avgOccupancyRate,
      },
      busiestHours,
      busiestDays,
      popularClasses,
      monthlyTrend,
    };
  },
});
