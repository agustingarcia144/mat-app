import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const UNLIMITED_WEEKLY_CLASS_LIMIT = 9999;

type PlanWithClassLimit = {
  weeklyClassLimit: number;
};

export type MonthlyClassUsage = {
  used: number;
  limit: number;
  remaining: number;
  weeksTouched: number;
  billingPeriod: string;
  cycleStartMs: number;
  cycleEndMs: number;
  isUnlimited: boolean;
  hasReachedLimit: boolean;
};

export async function getTimezoneForOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<string> {
  const organization = await ctx.db.get(organizationId);
  return organization?.timezone && organization.timezone.trim() !== ""
    ? organization.timezone
    : "UTC";
}

export function getCalendarMonthCycle(timestamp: number, timezone: string) {
  const parts = getZonedParts(timestamp, timezone);
  const year = parts.year;
  const month = parts.month;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const cycleStartMs = zonedLocalTimeToUtcMs(
    year,
    month,
    1,
    0,
    0,
    0,
    0,
    timezone,
  );
  const cycleEndMs = zonedLocalTimeToUtcMs(
    nextMonthYear,
    nextMonth,
    1,
    0,
    0,
    0,
    0,
    timezone,
  );

  return {
    year,
    month,
    billingPeriod: `${year}-${String(month).padStart(2, "0")}`,
    cycleStartMs,
    cycleEndMs,
  };
}

export function getWeeksTouchedByCalendarMonth(
  year: number,
  month: number,
): number {
  const firstDayLocalMs = Date.UTC(year, month - 1, 1);
  const lastDayLocalMs = Date.UTC(year, month, 0);
  const firstWeekStartMs =
    firstDayLocalMs - getMondayOffsetDays(firstDayLocalMs) * DAY_MS;
  const lastWeekStartMs =
    lastDayLocalMs - getMondayOffsetDays(lastDayLocalMs) * DAY_MS;

  return Math.floor((lastWeekStartMs - firstWeekStartMs) / WEEK_MS) + 1;
}

export function getMonthlyClassLimit(
  weeklyClassLimit: number,
  weeksTouched: number,
): number {
  return weeklyClassLimit * weeksTouched;
}

export function isUnlimitedClassPlan(weeklyClassLimit: number): boolean {
  return weeklyClassLimit >= UNLIMITED_WEEKLY_CLASS_LIMIT;
}

export async function countMonthlyClassReservations(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
  cycleStartMs: number,
  cycleEndMs: number,
): Promise<number> {
  const indexedReservations = await ctx.db
    .query("classReservations")
    .withIndex("by_organization_user_start_time", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("userId", userId)
        .gte("scheduleStartTime", cycleStartMs)
        .lt("scheduleStartTime", cycleEndMs),
    )
    .filter((q) => q.neq(q.field("status"), "cancelled"))
    .collect();

  const countedReservationIds = new Set(
    indexedReservations.map((reservation) => reservation._id),
  );
  let count = indexedReservations.length;

  // Legacy rows created before scheduleStartTime existed are still counted
  // until the backfill migration has fully populated them.
  const legacyCandidates = await ctx.db
    .query("classReservations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.and(
        q.eq(q.field("organizationId"), organizationId),
        q.neq(q.field("status"), "cancelled"),
      ),
    )
    .collect();

  for (const reservation of legacyCandidates) {
    if (countedReservationIds.has(reservation._id)) continue;
    if (reservation.scheduleStartTime !== undefined) continue;

    const schedule = await ctx.db.get(reservation.scheduleId);
    if (
      schedule &&
      schedule.startTime >= cycleStartMs &&
      schedule.startTime < cycleEndMs
    ) {
      count += 1;
    }
  }

  return count;
}

export async function getMonthlyClassUsageForSchedule(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
  plan: PlanWithClassLimit,
  scheduleStartTime: number,
): Promise<MonthlyClassUsage> {
  const timezone = await getTimezoneForOrganization(ctx, organizationId);
  const cycle = getCalendarMonthCycle(scheduleStartTime, timezone);
  const weeksTouched = getWeeksTouchedByCalendarMonth(
    cycle.year,
    cycle.month,
  );
  const limit = getMonthlyClassLimit(plan.weeklyClassLimit, weeksTouched);
  const used = await countMonthlyClassReservations(
    ctx,
    organizationId,
    userId,
    cycle.cycleStartMs,
    cycle.cycleEndMs,
  );
  const isUnlimited = isUnlimitedClassPlan(plan.weeklyClassLimit);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    weeksTouched,
    billingPeriod: cycle.billingPeriod,
    cycleStartMs: cycle.cycleStartMs,
    cycleEndMs: cycle.cycleEndMs,
    isUnlimited,
    hasReachedLimit: !isUnlimited && used >= limit,
  };
}

function getMondayOffsetDays(localDateUtcMs: number): number {
  const dayOfWeek = new Date(localDateUtcMs).getUTCDay();
  return (dayOfWeek + 6) % 7;
}

function getZonedParts(timestamp: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: parseInt(partMap.year!, 10),
    month: parseInt(partMap.month!, 10),
    day: parseInt(partMap.day!, 10),
    hour: parseInt(partMap.hour!, 10),
    minute: parseInt(partMap.minute!, 10),
    second: parseInt(partMap.second!, 10),
  };
}

function getTimezoneOffsetMs(timestamp: number, timezone: string): number {
  const parts = getZonedParts(timestamp, timezone);
  const zonedAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return zonedAsUtcMs - timestamp;
}

function zonedLocalTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timezone: string,
): number {
  const localAsUtcMs = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  let utcMs = localAsUtcMs - getTimezoneOffsetMs(localAsUtcMs, timezone);
  const adjustedOffset = getTimezoneOffsetMs(utcMs, timezone);
  utcMs = localAsUtcMs - adjustedOffset;
  return utcMs;
}
