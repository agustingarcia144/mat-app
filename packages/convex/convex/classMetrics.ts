import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from "./permissions";

function getPeriod(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getHour(ts: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(new Date(ts));
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getDayOfWeek(ts: number, timezone: string) {
  // 0 = Sunday ... 6 = Saturday
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).formatToParts(new Date(ts));
  const label = parts.find((p) => p.type === "weekday")?.value ?? "";
  return WEEKDAY_MAP[label] ?? 0;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Occupancy / attendance / popularity rollup. Shared by the dashboard and
 * Mati (`ai.runReport`). Callers are responsible for authorization.
 */
export async function computeClassMetrics(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const now = Date.now();

  // ── Fetch data ──────────────────────────────────────────────────────────
  const organization = await ctx.db.get(organizationId);
  const timezone = organization?.timezone ?? "UTC";

  const [schedules, reservations, classes] = await Promise.all([
    ctx.db
      .query("classSchedules")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
    ctx.db
      .query("classReservations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
    ctx.db
      .query("classes")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
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

  const attended = activeReservations.filter(
    (r) => r.status === "attended",
  ).length;
  const noShow = activeReservations.filter(
    (r) => r.status === "no_show",
  ).length;
  const confirmed = activeReservations.filter(
    (r) => r.status === "confirmed",
  ).length;
  const totalCancelled = reservations.filter(
    (r) => r.status === "cancelled",
  ).length;
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
    const h = getHour(s.startTime, timezone);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const busiestHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Busiest days of week ─────────────────────────────────────────────────
  const dayCounts: Record<number, number> = {};
  for (const s of pastSchedules) {
    const d = getDayOfWeek(s.startTime, timezone);
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
    {
      reservations: number;
      attended: number;
      noShow: number;
      schedules: number;
    }
  > = {};
  for (const s of pastSchedules) {
    const id = s.classId as string;
    if (!classCounts[id]) {
      classCounts[id] = {
        reservations: 0,
        attended: 0,
        noShow: 0,
        schedules: 0,
      };
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
          closed > 0 ? Math.round((stats.attended / closed) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.reservations - a.reservations)
    .slice(0, 6);

  // ── Monthly trend (last 6 months) ────────────────────────────────────────
  const monthlyMap: Record<
    string,
    {
      period: string;
      schedulesHeld: number;
      attended: number;
      noShow: number;
      totalReservations: number;
    }
  > = {};

  // seed last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[p] = {
      period: p,
      schedulesHeld: 0,
      attended: 0,
      noShow: 0,
      totalReservations: 0,
    };
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
}

export const getClassMetrics = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdmin(ctx, organizationId);
    return await computeClassMetrics(ctx, organizationId);
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;

const ATTENDANCE_BUCKETS = [
  { key: "none", label: "0", min: 0, max: 0 },
  { key: "low", label: "1-3", min: 1, max: 3 },
  { key: "mid", label: "4-7", min: 4, max: 7 },
  { key: "high", label: "8-12", min: 8, max: 12 },
  { key: "top", label: "13+", min: 13, max: Infinity },
] as const;

/** Local YYYY-MM-DD for a timestamp, matching `workoutDaySessions.performedOn`. */
function getDateKey(ts: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(ts));
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function getDayOfWeekFromDateKey(key: string) {
  const parsed = parseDateKey(key);
  return parsed === null ? null : new Date(parsed).getUTCDay();
}

/**
 * Per-member attendance ranking: who shows up the most and who went cold.
 *
 * Attendance is counted in *days present*, not in class check-ins, because a
 * member reaches the gym through either of two independent signals:
 *
 *  1. a class reservation checked in as `attended`, and
 *  2. a planification session logged for the day (`workoutDaySessions`) — the
 *     path taken by members who train on their own plan and never book a class.
 *
 * Ranking on check-ins alone would report every plan-only member as "never
 * came". A day counts once no matter how many signals land on it, so the two
 * sources never double-count each other.
 *
 * The roster comes from active `member` memberships instead of from the
 * activity history, so members with zero attendance still appear — those are
 * exactly the ones worth surfacing at the bottom of the ranking. Cancelled
 * schedules are ignored so a class the gym called off never counts against
 * anyone.
 */
/**
 * Per-member attendance ranking and dormancy. Shared by the dashboard and
 * Mati (`ai.runReport`). Callers are responsible for authorization.
 */
export async function computeMemberAttendanceMetrics(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  args: { rangeDays?: number },
) {
  const now = Date.now();
  const rangeDays = Math.max(0, Math.floor(args.rangeDays ?? 0));
  const rangeStart = rangeDays > 0 ? now - rangeDays * DAY_MS : 0;

  const organization = await ctx.db.get(organizationId);
  const timezone = organization?.timezone ?? "UTC";

  const todayKey = getDateKey(now, timezone);
  const rangeStartKey = rangeDays > 0 ? getDateKey(rangeStart, timezone) : null;

  const [schedules, reservations, classes, memberships, workoutSessions] =
    await Promise.all([
      ctx.db
        .query("classSchedules")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("classReservations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("classes")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_role", (q) =>
          q.eq("organizationId", organizationId).eq("role", "member"),
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect(),
      ctx.db
        .query("workoutDaySessions")
        .withIndex("by_organization_performedOn", (q) =>
          rangeStartKey
            ? q
                .eq("organizationId", organizationId)
                .gte("performedOn", rangeStartKey)
            : q.eq("organizationId", organizationId),
        )
        .filter((q) => q.neq(q.field("status"), "skipped"))
        .collect(),
    ]);

  const classNameById = new Map(classes.map((c) => [String(c._id), c.name]));
  const scheduleById = new Map(schedules.map((s) => [String(s._id), s]));

  type MemberStats = {
    /** Distinct local days the member was present, from any signal. */
    activeDays: Set<string>;
    classAttended: number;
    sessionsLogged: number;
    noShow: number;
    cancelled: number;
    upcoming: number;
    lastActivityOn: string | null;
    classCounts: Map<string, number>;
    dayCounts: number[];
  };

  const statsByUser = new Map<string, MemberStats>();
  const emptyStats = (): MemberStats => ({
    activeDays: new Set(),
    classAttended: 0,
    sessionsLogged: 0,
    noShow: 0,
    cancelled: 0,
    upcoming: 0,
    lastActivityOn: null,
    classCounts: new Map(),
    dayCounts: Array.from({ length: 7 }, () => 0),
  });

  // Only members currently on the roster are ranked; skip everyone else's rows.
  const rosterUserIds = new Set(memberships.map((m) => m.userId));

  let earliestConsidered: number | null = null;

  // Org-wide member-days per weekday (0 = Sunday), for the attendance heatmap.
  const weekdayCounts = Array.from({ length: 7 }, () => 0);

  const markPresent = (stats: MemberStats, dateKey: string) => {
    if (stats.lastActivityOn === null || dateKey > stats.lastActivityOn) {
      stats.lastActivityOn = dateKey;
    }
    // Weekday tally follows days present, so a day carrying both a check-in
    // and a logged session is not counted twice.
    if (stats.activeDays.has(dateKey)) return;
    stats.activeDays.add(dateKey);
    const day = getDayOfWeekFromDateKey(dateKey);
    if (day !== null) {
      stats.dayCounts[day] = (stats.dayCounts[day] ?? 0) + 1;
      weekdayCounts[day] = (weekdayCounts[day] ?? 0) + 1;
    }
  };

  // ── Signal 1: class check-ins ────────────────────────────────────────────
  for (const reservation of reservations) {
    if (!rosterUserIds.has(reservation.userId)) continue;

    const schedule = scheduleById.get(String(reservation.scheduleId));
    // `scheduleStartTime` is denormalized but optional on legacy rows.
    const startTime = reservation.scheduleStartTime ?? schedule?.startTime;
    if (typeof startTime !== "number") continue;
    if (schedule?.status === "cancelled") continue;
    if (startTime < rangeStart) continue;

    const stats = statsByUser.get(reservation.userId) ?? emptyStats();

    if (startTime > now) {
      // Reserved but not held yet: informational only, never part of the ranking.
      if (reservation.status !== "cancelled") stats.upcoming += 1;
      statsByUser.set(reservation.userId, stats);
      continue;
    }

    if (earliestConsidered === null || startTime < earliestConsidered) {
      earliestConsidered = startTime;
    }

    if (reservation.status === "attended") {
      stats.classAttended += 1;
      markPresent(stats, getDateKey(startTime, timezone));
      const classId = String(reservation.classId);
      stats.classCounts.set(classId, (stats.classCounts.get(classId) ?? 0) + 1);
    } else if (reservation.status === "no_show") {
      stats.noShow += 1;
    } else if (reservation.status === "cancelled") {
      stats.cancelled += 1;
    }

    statsByUser.set(reservation.userId, stats);
  }

  // ── Signal 2: planification sessions ─────────────────────────────────────
  for (const session of workoutSessions) {
    if (!rosterUserIds.has(session.userId)) continue;
    if (session.performedOn > todayKey) continue;

    const stats = statsByUser.get(session.userId) ?? emptyStats();
    stats.sessionsLogged += 1;
    markPresent(stats, session.performedOn);
    statsByUser.set(session.userId, stats);

    const performedAt = parseDateKey(session.performedOn);
    if (
      performedAt !== null &&
      (earliestConsidered === null || performedAt < earliestConsidered)
    ) {
      earliestConsidered = performedAt;
    }
  }

  // Weeks of observation, used for the per-week average.
  const observedFrom = rangeDays > 0 ? rangeStart : (earliestConsidered ?? now);
  const observedWeeks = Math.max((now - observedFrom) / (7 * DAY_MS), 1);
  const todayAt = parseDateKey(todayKey) ?? now;

  const members = await Promise.all(
    memberships.map(async (member) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_externalId", (q) => q.eq("externalId", member.userId))
        .first();
      const name =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        member.userId;

      const stats = statsByUser.get(member.userId) ?? emptyStats();
      const closed = stats.classAttended + stats.noShow;
      const activeDays = stats.activeDays.size;
      const lastActivityAt =
        stats.lastActivityOn === null
          ? null
          : parseDateKey(stats.lastActivityOn);

      // How this member reaches the gym, so a plan-only member is never read
      // as absent just because they do not book classes.
      const source: "classes" | "planification" | "mixed" | "none" =
        stats.classAttended > 0 && stats.sessionsLogged > 0
          ? "mixed"
          : stats.classAttended > 0
            ? "classes"
            : stats.sessionsLogged > 0
              ? "planification"
              : "none";

      let favoriteClassId: string | null = null;
      let favoriteClassCount = 0;
      for (const [classId, count] of Array.from(stats.classCounts.entries())) {
        if (count > favoriteClassCount) {
          favoriteClassId = classId;
          favoriteClassCount = count;
        }
      }

      let favoriteDay = -1;
      let favoriteDayCount = 0;
      for (let day = 0; day < stats.dayCounts.length; day += 1) {
        const count = stats.dayCounts[day] ?? 0;
        if (count > favoriteDayCount) {
          favoriteDay = day;
          favoriteDayCount = count;
        }
      }

      return {
        userId: member.userId,
        name,
        email: user?.email ?? null,
        imageUrl: user?.imageUrl ?? null,
        joinedAt: member.joinedAt,
        source,
        // Ranking metric: distinct days present, from either signal.
        activeDays,
        classAttended: stats.classAttended,
        sessionsLogged: stats.sessionsLogged,
        noShow: stats.noShow,
        cancelled: stats.cancelled,
        upcoming: stats.upcoming,
        closedReservations: closed,
        // Only meaningful for members who book classes; null for the rest.
        attendanceRate:
          closed > 0
            ? Math.round((stats.classAttended / closed) * 1000) / 10
            : null,
        perWeek: Math.round((activeDays / observedWeeks) * 10) / 10,
        lastActivityOn: stats.lastActivityOn,
        lastActivityAt,
        daysSinceLastActivity:
          lastActivityAt === null
            ? null
            : Math.max(0, Math.round((todayAt - lastActivityAt) / DAY_MS)),
        favoriteClass:
          favoriteClassId === null
            ? null
            : {
                name: classNameById.get(favoriteClassId) ?? "Clase eliminada",
                count: favoriteClassCount,
              },
        favoriteDay:
          favoriteDay < 0
            ? null
            : {
                day: favoriteDay,
                label: DAY_LABELS[favoriteDay] ?? "",
                count: favoriteDayCount,
              },
      };
    }),
  );

  // Most days present first; ties broken by the most recent visit, then name.
  const ranked = members.sort((a, b) => {
    if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
    if ((b.lastActivityAt ?? 0) !== (a.lastActivityAt ?? 0)) {
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
    }
    return a.name.localeCompare(b.name);
  });

  const totalActiveDays = ranked.reduce((sum, m) => sum + m.activeDays, 0);
  const totalClassAttended = ranked.reduce(
    (sum, m) => sum + m.classAttended,
    0,
  );
  const totalSessionsLogged = ranked.reduce(
    (sum, m) => sum + m.sessionsLogged,
    0,
  );
  const totalNoShow = ranked.reduce((sum, m) => sum + m.noShow, 0);
  const activeMembers = ranked.length;
  const membersWithAttendance = ranked.filter((m) => m.activeDays > 0).length;

  const dayValues = ranked.map((m) => m.activeDays).sort((a, b) => a - b);
  const medianActiveDays =
    dayValues.length === 0
      ? 0
      : dayValues.length % 2 === 1
        ? (dayValues[(dayValues.length - 1) / 2] ?? 0)
        : Math.round(
            (((dayValues[dayValues.length / 2 - 1] ?? 0) +
              (dayValues[dayValues.length / 2] ?? 0)) /
              2) *
              10,
          ) / 10;

  const distribution = ATTENDANCE_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: ranked.filter(
      (m) => m.activeDays >= bucket.min && m.activeDays <= bucket.max,
    ).length,
  }));

  // How the roster splits across the two signals. Makes it obvious when a gym
  // runs mostly on planifications and class check-ins alone would mislead.
  const bySource = {
    classes: ranked.filter((m) => m.source === "classes").length,
    planification: ranked.filter((m) => m.source === "planification").length,
    mixed: ranked.filter((m) => m.source === "mixed").length,
    none: ranked.filter((m) => m.source === "none").length,
  };

  // Members who used to come but have not shown up in a while.
  const dormantMembers = ranked
    .filter(
      (m) => m.daysSinceLastActivity !== null && m.daysSinceLastActivity >= 21,
    )
    .sort(
      (a, b) => (b.daysSinceLastActivity ?? 0) - (a.daysSinceLastActivity ?? 0),
    )
    .slice(0, 10);

  return {
    range: {
      days: rangeDays,
      startAt: rangeDays > 0 ? rangeStart : (earliestConsidered ?? null),
      weeks: Math.round(observedWeeks * 10) / 10,
    },
    overview: {
      activeMembers,
      membersWithAttendance,
      inactiveMembers: activeMembers - membersWithAttendance,
      totalActiveDays,
      totalClassAttended,
      totalSessionsLogged,
      totalNoShow,
      avgActiveDaysPerMember:
        activeMembers > 0
          ? Math.round((totalActiveDays / activeMembers) * 10) / 10
          : 0,
      medianActiveDays,
      avgPerWeek:
        activeMembers > 0
          ? Math.round((totalActiveDays / activeMembers / observedWeeks) * 10) /
            10
          : 0,
    },
    bySource,
    distribution,
    weekdayDistribution: DAY_LABELS.map((label, day) => ({
      day,
      label,
      count: weekdayCounts[day] ?? 0,
    })),
    dormantMembers,
    members: ranked,
  };
}

export const getMemberAttendanceMetrics = query({
  args: {
    // Rolling window in days. 0 (or omitted) = full history.
    rangeDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdminOrTrainer(ctx, organizationId);
    return await computeMemberAttendanceMetrics(ctx, organizationId, args);
  },
});
