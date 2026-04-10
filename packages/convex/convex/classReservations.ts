import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  requireActiveOrgContext,
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import { getDayAndMinutesInZone } from "./fixedClassSlots";

/**
 * Reserve a spot in a class
 */
export const reserve = mutation({
  args: {
    scheduleId: v.id("classSchedules"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await requireOrganizationMembership(ctx, schedule.organizationId);

    // Check if schedule is cancelled
    if (schedule.status === "cancelled") {
      throw new Error("This class has been cancelled");
    }

    // Check if schedule is in the past
    if (schedule.status === "completed") {
      throw new Error("This class has already been completed");
    }

    // Get class template for booking window
    const classTemplate = await ctx.db.get(schedule.classId);
    if (!classTemplate) {
      throw new Error("Class not found");
    }

    // Check booking window
    const now = Date.now();
    const bookingWindowMs =
      classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000;
    const earliestBookingTime = schedule.startTime - bookingWindowMs;

    if (now < earliestBookingTime) {
      throw new Error(
        `Booking opens ${classTemplate.bookingWindowDays} days before the class`,
      );
    }

    if (now >= schedule.startTime) {
      throw new Error("Cannot book a class that has already started");
    }

    // Check for duplicate reservation
    const existing = await ctx.db
      .query("classReservations")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), identity.subject),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();

    if (existing) {
      throw new Error("You have already reserved this class");
    }

    // Plan enforcement: check suspension and weekly class limit
    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", schedule.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (subscription) {
      if (subscription.status === "suspended") {
        throw new Error(
          "Tu plan está suspendido por falta de pago. Realizá el pago para poder reservar.",
        );
      }

      const plan = await ctx.db.get(subscription.planId);
      if (plan) {
        const weeklyCount = await countWeeklyReservations(
          ctx,
          schedule.organizationId,
          identity.subject,
          schedule.startTime,
        );
        if (weeklyCount >= plan.weeklyClassLimit) {
          throw new Error(
            `Alcanzaste tu límite de ${plan.weeklyClassLimit} clase${plan.weeklyClassLimit === 1 ? "" : "s"} por semana.`,
          );
        }
      }
    }

    // Re-fetch schedule to avoid TOCTOU race condition
    const currentSchedule = await ctx.db.get(args.scheduleId);
    if (!currentSchedule) {
      throw new Error("Schedule not found");
    }

    // Check capacity again with latest data
    if (currentSchedule.currentReservations >= currentSchedule.capacity) {
      throw new Error("This class is full");
    }

    // Create reservation
    const reservationId = await ctx.db.insert("classReservations", {
      scheduleId: args.scheduleId,
      classId: currentSchedule.classId,
      organizationId: currentSchedule.organizationId,
      userId: identity.subject,
      status: "confirmed",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Increment reservation count atomically
    await ctx.db.patch(args.scheduleId, {
      currentReservations: currentSchedule.currentReservations + 1,
      updatedAt: now,
    });

    return reservationId;
  },
});

/**
 * Cancel a reservation
 */
export const cancel = mutation({
  args: {
    id: v.id("classReservations"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const reservation = await ctx.db.get(args.id);
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    // Check if user owns this reservation
    if (reservation.userId !== identity.subject) {
      // Check if user is admin/trainer who can cancel for others
      const isStaff = await requireAdminOrTrainer(
        ctx,
        reservation.organizationId,
      ).catch(() => false);
      if (!isStaff) {
        throw new Error("You can only cancel your own reservations");
      }
    }

    // Check if already cancelled
    if (reservation.status === "cancelled") {
      throw new Error("This reservation is already cancelled");
    }

    // Get schedule and class for cancellation window check
    const schedule = await ctx.db.get(reservation.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    const classTemplate = await ctx.db.get(reservation.classId);
    if (!classTemplate) {
      throw new Error("Class not found");
    }

    // Check cancellation window (only for regular members)
    if (reservation.userId === identity.subject) {
      const now = Date.now();
      const cancellationWindowMs =
        classTemplate.cancellationWindowHours * 60 * 60 * 1000;
      const latestCancellationTime = schedule.startTime - cancellationWindowMs;

      if (now > latestCancellationTime) {
        throw new Error(
          `Cancellations must be made at least ${classTemplate.cancellationWindowHours} hours before the class`,
        );
      }
    }

    const now = Date.now();
    const wasFull = schedule.currentReservations >= schedule.capacity;

    // Update reservation status
    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    // Decrement reservation count
    await ctx.db.patch(reservation.scheduleId, {
      currentReservations: Math.max(0, schedule.currentReservations - 1),
      updatedAt: now,
    });

    // Notify alert subscribers that a spot opened up
    if (
      wasFull &&
      schedule.startTime > now &&
      schedule.status === "scheduled"
    ) {
      await ctx.runMutation(
        internal.pushNotifications.sendSpotAvailableAlerts,
        {
          scheduleId: reservation.scheduleId,
          className: classTemplate.name,
        },
      );
    }
  },
});

/**
 * Check in a member (admin/trainer only)
 */
export const checkIn = mutation({
  args: {
    id: v.id("classReservations"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const reservation = await ctx.db.get(args.id);
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    await requireAdminOrTrainer(ctx, reservation.organizationId);

    if (reservation.status !== "confirmed") {
      throw new Error("Can only check in confirmed reservations");
    }

    const now = Date.now();
    const schedule = await ctx.db.get(reservation.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    const checkInOpensAt = schedule.startTime - 20 * 60 * 1000;

    if (now < checkInOpensAt) {
      throw new Error("Check-in opens 20 minutes before class starts");
    }

    await ctx.db.patch(args.id, {
      status: "attended",
      checkedInAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Self check-in for members.
 * Allowed from 20 minutes before class start until 6 hours after class end.
 */
export const checkInSelf = mutation({
  args: {
    id: v.id("classReservations"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const reservation = await ctx.db.get(args.id);
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    await requireOrganizationMembership(ctx, reservation.organizationId);

    if (reservation.userId !== identity.subject) {
      throw new Error("You can only check in your own reservations");
    }

    if (reservation.status !== "confirmed") {
      throw new Error("Can only check in confirmed reservations");
    }

    const schedule = await ctx.db.get(reservation.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    const now = Date.now();
    const checkInOpensAt = schedule.startTime - 20 * 60 * 1000;
    const checkInClosesAt = schedule.endTime + 6 * 60 * 60 * 1000;

    if (now < checkInOpensAt) {
      throw new Error("Check-in opens 20 minutes before class starts");
    }

    if (now > checkInClosesAt) {
      throw new Error("Check-in is no longer available for this class");
    }

    await ctx.db.patch(args.id, {
      status: "attended",
      checkedInAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a member as no-show (admin/trainer only)
 */
export const markNoShow = mutation({
  args: {
    id: v.id("classReservations"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const reservation = await ctx.db.get(args.id);
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    await requireAdminOrTrainer(ctx, reservation.organizationId);

    if (reservation.status !== "confirmed") {
      throw new Error("Can only mark confirmed reservations as no-show");
    }

    await ctx.db.patch(args.id, {
      status: "no_show",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get all reservations for a schedule
 */
export const getBySchedule = query({
  args: {
    scheduleId: v.id("classSchedules"),
  },
  handler: async (ctx, args) => {
    // Get the schedule to check organization
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await requireOrganizationMembership(ctx, schedule.organizationId);

    return await ctx.db
      .query("classReservations")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
  },
});

/**
 * Get reservations for a schedule with user details (admin/trainer only)
 */
export const getByScheduleWithUsers = query({
  args: {
    scheduleId: v.id("classSchedules"),
    statusFilter: v.optional(
      v.union(
        v.literal("confirmed"),
        v.literal("cancelled"),
        v.literal("attended"),
        v.literal("no_show"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get the schedule to check organization
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Only admin/trainer can access user details
    await requireAdminOrTrainer(ctx, schedule.organizationId);

    let reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    // Filter by status if provided
    if (args.statusFilter) {
      reservations = reservations.filter((r) => r.status === args.statusFilter);
    }

    const organization = await ctx.db.get(schedule.organizationId);
    const timezone =
      organization?.timezone && organization.timezone.trim() !== ""
        ? organization.timezone
        : "UTC";
    const { dayOfWeek: scheduleDay, startTimeMinutes: scheduleMinutes } =
      getDayAndMinutesInZone(schedule.startTime, timezone);

    // Enrich with minimal user data and isFixedSlot
    const enrichedReservations = await Promise.all(
      reservations.map(async (reservation) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) =>
            q.eq("externalId", reservation.userId),
          )
          .first();

        const fixedSlot = await ctx.db
          .query("fixedClassSlots")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", schedule.organizationId)
              .eq("userId", reservation.userId),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("classId"), schedule.classId),
              q.eq(q.field("dayOfWeek"), scheduleDay),
              q.eq(q.field("startTimeMinutes"), scheduleMinutes),
            ),
          )
          .first();

        return {
          ...reservation,
          user: user
            ? {
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                email: user.email,
                imageUrl: user.imageUrl,
              }
            : null,
          isFixedSlot: !!fixedSlot,
        };
      }),
    );

    return enrichedReservations;
  },
});

/**
 * Get all reservations for a user
 */
export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    return reservations.filter(
      (reservation) => reservation.organizationId === organizationId,
    );
  },
});

/**
 * Get upcoming reservations for a user
 */
export const getUpcomingByUser = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;
    const now = Date.now();

    // Get user's confirmed reservations
    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", identity.subject).eq("status", "confirmed"),
      )
      .collect();
    const scopedReservations = reservations.filter(
      (reservation) => reservation.organizationId === organizationId,
    );

    // Enrich with schedule data and filter to upcoming
    const upcomingReservations = await Promise.all(
      scopedReservations.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId);
        const classTemplate = await ctx.db.get(reservation.classId);

        return {
          ...reservation,
          schedule,
          class: classTemplate,
        };
      }),
    );

    // Filter to upcoming and sort by start time
    return upcomingReservations
      .filter((r) => r.schedule && r.schedule.startTime > now)
      .sort(
        (a, b) => (a.schedule?.startTime ?? 0) - (b.schedule?.startTime ?? 0),
      );
  },
});

/**
 * Get reservations in the check-in window for the Proximas list.
 * Returns non-cancelled reservations where:
 *   now >= schedule.startTime - 20min AND now <= schedule.endTime + 6h
 * so we can show the correct badge (Reservado / Asististe / No show) as soon as the window opens.
 */
export const getReservationsInCheckInWindow = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;
    const now = Date.now();
    const opensBeforeMs = 20 * 60 * 1000;
    const closesAfterMs = 6 * 60 * 60 * 1000;

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const relevant = reservations.filter(
      (r) => r.status !== "cancelled" && r.organizationId === organizationId,
    );

    const enriched = await Promise.all(
      relevant.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId);
        const classTemplate = await ctx.db.get(reservation.classId);
        return {
          ...reservation,
          schedule,
          class: classTemplate,
        };
      }),
    );

    return enriched
      .filter(
        (r) =>
          r.schedule &&
          r.schedule.startTime - opensBeforeMs <= now &&
          now <= r.schedule.endTime + closesAfterMs,
      )
      .sort(
        (a, b) => (a.schedule?.startTime ?? 0) - (b.schedule?.startTime ?? 0),
      );
  },
});

/**
 * Get past reservations for a user.
 * Includes non-cancelled reservations with schedule/class populated.
 */
export const getPastByUser = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;
    const now = Date.now();

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const relevant = reservations.filter(
      (r) => r.status !== "cancelled" && r.organizationId === organizationId,
    );

    const enriched = await Promise.all(
      relevant.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId);
        const classTemplate = await ctx.db.get(reservation.classId);
        return {
          ...reservation,
          schedule,
          class: classTemplate,
        };
      }),
    );

    return enriched
      .filter((r) => r.schedule && r.schedule.startTime < now)
      .sort(
        (a, b) => (b.schedule?.startTime ?? 0) - (a.schedule?.startTime ?? 0),
      );
  },
});

/**
 * Get user's reservations for a specific day (by start/end of day timestamps).
 * Returns non-cancelled reservations with schedule and class populated, sorted by start time.
 */
export const getByUserForDate = query({
  args: {
    startOfDay: v.number(),
    endOfDay: v.number(),
  },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const nonCancelled = reservations.filter(
      (r) => r.status !== "cancelled" && r.organizationId === organizationId,
    );

    const enriched = await Promise.all(
      nonCancelled.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId);
        const classTemplate = await ctx.db.get(reservation.classId);
        return {
          ...reservation,
          schedule,
          class: classTemplate,
        };
      }),
    );

    return enriched
      .filter(
        (r) =>
          r.schedule &&
          r.schedule.startTime >= args.startOfDay &&
          r.schedule.startTime <= args.endOfDay,
      )
      .sort(
        (a, b) => (a.schedule?.startTime ?? 0) - (b.schedule?.startTime ?? 0),
      );
  },
});

/**
 * Get user's reservations in a date range (by start/end timestamps).
 * Returns non-cancelled reservations with schedule populated; used to know which days have a class.
 */
export const getByUserForDateRange = query({
  args: {
    startOfRange: v.number(),
    endOfRange: v.number(),
  },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { identity, organizationId } = orgCtx;

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const nonCancelled = reservations.filter(
      (r) => r.status !== "cancelled" && r.organizationId === organizationId,
    );

    const withSchedule = await Promise.all(
      nonCancelled.map(async (reservation) => {
        const schedule = await ctx.db.get(reservation.scheduleId);
        return { ...reservation, schedule };
      }),
    );

    return withSchedule.filter(
      (r) =>
        r.schedule &&
        r.schedule.startTime >= args.startOfRange &&
        r.schedule.startTime <= args.endOfRange,
    );
  },
});

/**
 * Internal: mark overdue confirmed reservations as no-show.
 * A reservation is overdue when now > schedule.endTime + 6h.
 */
export const autoMarkNoShows = internalMutation({
  args: {
    scheduleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now - 6 * 60 * 60 * 1000;
    const scheduleLimit = args.scheduleLimit ?? 100;

    const candidateSchedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_start_time", (q) => q.lte("startTime", cutoff))
      .collect();

    const expiredSchedules = candidateSchedules
      .filter((schedule) => schedule.endTime <= cutoff)
      .slice(0, scheduleLimit);

    let updatedReservations = 0;

    for (const schedule of expiredSchedules) {
      const confirmedReservations = await ctx.db
        .query("classReservations")
        .withIndex("by_schedule_status", (q) =>
          q.eq("scheduleId", schedule._id).eq("status", "confirmed"),
        )
        .collect();

      for (const reservation of confirmedReservations) {
        await ctx.db.patch(reservation._id, {
          status: "no_show",
          updatedAt: now,
        });
        updatedReservations += 1;
      }
    }

    return {
      processedSchedules: expiredSchedules.length,
      updatedReservations,
      cutoff,
    };
  },
});

/**
 * Count non-cancelled reservations for a user during the Mon–Sun week
 * that contains `referenceTimestamp`, using the org's IANA timezone.
 */
export async function countWeeklyReservations(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
  referenceTimestamp: number,
): Promise<number> {
  const organization = await ctx.db.get(organizationId);
  const timezone =
    organization?.timezone && organization.timezone.trim() !== ""
      ? organization.timezone
      : "UTC";

  // Determine the Monday 00:00 and Sunday 23:59:59.999 of the week in org timezone
  const { weekStartMs, weekEndMs } = getWeekBoundsInTimezone(
    referenceTimestamp,
    timezone,
  );

  // Get schedules in that time range for the org
  const schedules = await ctx.db
    .query("classSchedules")
    .withIndex("by_organization_time", (q) =>
      q
        .eq("organizationId", organizationId)
        .gte("startTime", weekStartMs)
        .lte("startTime", weekEndMs),
    )
    .collect();

  let count = 0;
  for (const schedule of schedules) {
    const reservation = await ctx.db
      .query("classReservations")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();

    if (reservation) count++;
  }

  return count;
}

/**
 * Get the current user's weekly class usage and plan limit.
 * Returns null if the user has no active subscription.
 */
export const getMyWeeklyClassCount = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return null;

    const plan = await ctx.db.get(subscription.planId);
    if (!plan) return null;

    const now = Date.now();
    const used = await countWeeklyReservations(
      ctx,
      membership.organizationId,
      identity.subject,
      now,
    );

    return {
      used,
      limit: plan.weeklyClassLimit,
      subscriptionStatus: subscription.status,
    };
  },
});

/**
 * Compute the Monday 00:00:00 and Sunday 23:59:59.999 timestamps
 * for the week containing `timestamp` in the given IANA timezone.
 */
function getWeekBoundsInTimezone(
  timestamp: number,
  timezone: string,
): { weekStartMs: number; weekEndMs: number } {
  const d = new Date(timestamp);

  // Get the local date parts in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const WEEKDAY_OFFSET: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  const dayOffset = WEEKDAY_OFFSET[partMap.weekday!] ?? 0;
  const hour = parseInt(partMap.hour!, 10);
  const minute = parseInt(partMap.minute!, 10);
  const second = parseInt(partMap.second!, 10);

  // Go back to Monday 00:00:00 in local time
  const msToSubtract =
    dayOffset * 86400000 + hour * 3600000 + minute * 60000 + second * 1000;
  const weekStartMs = timestamp - msToSubtract;

  // Sunday 23:59:59.999 = Monday 00:00 + 7 days - 1ms
  const weekEndMs = weekStartMs + 7 * 86400000 - 1;

  return { weekStartMs, weekEndMs };
}
