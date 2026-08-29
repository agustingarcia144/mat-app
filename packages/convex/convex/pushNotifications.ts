import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAuth } from "./permissions";
import { computeBonificationAmount } from "./planBonifications";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAYMENT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Local hour of the day (org timezone) at which plan expiration reminders go out. */
const PLAN_DUE_REMINDER_LOCAL_HOUR = 10;

/** How many days before the due date the early reminder is sent. */
const PLAN_DUE_SOON_DAYS = 3;

function buildPreClassReminderCopy(className: string) {
  return {
    title: "Recordatorio de clase",
    body: `Tu clase ${className} comienza en 1 hora.`,
  };
}

function buildAttendanceReminderCopy(className: string) {
  return {
    title: "Marcar asistencia",
    body: `Ya paso 1 hora desde ${className}. Marca tu asistencia para mantener tu historial al dia.`,
  };
}

function buildWorkoutCompletionReminderCopy() {
  return {
    title: "Termina tu entrenamiento",
    body: "Pasaron 2 horas desde que empezaste. Completalo para guardar tu progreso.",
  };
}

function buildPlanDueSoonCopy(planName: string, dueLabel: string) {
  return {
    title: "Tu abono vence pronto",
    body: `Tu plan ${planName} vence el ${dueLabel}. Registrá tu pago para no perder el acceso.`,
  };
}

function buildPlanDueTodayCopy(planName: string) {
  return {
    title: "Tu abono vence hoy",
    body: `Hoy vence el pago de tu plan ${planName}. Subí tu comprobante para mantener tu acceso activo.`,
  };
}

function getPaymentTimezone(timezone?: string) {
  return timezone && timezone.trim() !== ""
    ? timezone.trim()
    : DEFAULT_PAYMENT_TIMEZONE;
}

function getZonedDateParts(timestamp: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const partMap = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((p) => [p.type, p.value]),
  );

  return {
    year: parseInt(partMap.year!, 10),
    month: parseInt(partMap.month!, 10),
    day: parseInt(partMap.day!, 10),
    // Intl renders midnight as "24" in the h23-adjacent "hour12: false" mode.
    hour: parseInt(partMap.hour!, 10) % 24,
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, monthsToAdd: number) {
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/**
 * First date a `join_date` subscription actually owes money: one month after
 * activation. Mirrors the grace rule in `memberPlanSubscriptions.autoSuspendUnpaid`
 * so we never warn a member about the cycle they just paid on sign-up.
 */
function getFirstJoinDateBillingDueAt(activatedAt: number, timezone: string) {
  const activated = getZonedDateParts(activatedAt, timezone);
  const firstDueMonth = addMonths(activated.year, activated.month, 1);
  const firstDueDay = Math.min(
    activated.day,
    daysInMonth(firstDueMonth.year, firstDueMonth.month),
  );
  return Date.UTC(firstDueMonth.year, firstDueMonth.month - 1, firstDueDay);
}

/**
 * Next due date at or after `today`, plus the billing period it belongs to.
 *
 * Due dates come from the same rules the billing cycle uses in `planPayments`:
 * `calendar` plans are due on `paymentWindowEndDay` of each month, `join_date`
 * plans on the member's activation-day anniversary. Dates are UTC-midnight
 * date-only values so day arithmetic never drifts across timezones.
 */
function getUpcomingDueDate(
  plan: {
    billingMode?: "calendar" | "join_date";
    paymentWindowEndDay?: number;
  },
  activatedAt: number,
  today: { year: number; month: number; day: number },
  timezone: string,
) {
  const mode = plan.billingMode ?? "calendar";
  const anchorDay =
    mode === "join_date"
      ? getZonedDateParts(activatedAt, timezone).day
      : (plan.paymentWindowEndDay ?? 28);

  const thisMonthDueDay = Math.min(
    anchorDay,
    daysInMonth(today.year, today.month),
  );
  const dueMonth =
    today.day <= thisMonthDueDay
      ? { year: today.year, month: today.month }
      : addMonths(today.year, today.month, 1);
  const dueDay = Math.min(
    anchorDay,
    daysInMonth(dueMonth.year, dueMonth.month),
  );

  return {
    dueAt: Date.UTC(dueMonth.year, dueMonth.month - 1, dueDay),
    billingPeriod: `${dueMonth.year}-${String(dueMonth.month).padStart(2, "0")}`,
    dueLabel: `${String(dueDay).padStart(2, "0")}/${String(dueMonth.month).padStart(2, "0")}`,
  };
}

async function getClassNameCached(
  ctx: MutationCtx,
  classId: Id<"classes">,
  classNameById: Map<string, string>,
) {
  const key = classId as string;
  const cached = classNameById.get(key);
  if (cached) {
    return cached;
  }

  const classTemplate = await ctx.db.get(classId);
  if (!classTemplate) {
    return null;
  }

  classNameById.set(key, classTemplate.name);
  return classTemplate.name;
}

export const registerDeviceToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: identity.subject,
        platform: args.platform,
        deviceId: args.deviceId,
        active: true,
        lastSeenAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushTokens", {
      userId: identity.subject,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
      active: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const unregisterDeviceToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!existing || existing.userId !== identity.subject) {
      return { success: false };
    }

    await ctx.db.patch(existing._id, {
      active: false,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const listActiveTokensByUser = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("active", true),
      )
      .collect();
  },
});

export const createNotificationEventIfMissing = internalMutation({
  args: {
    eventKey: v.string(),
    type: v.union(
      v.literal("class_cancelled"),
      v.literal("class_start_reminder"),
      v.literal("attendance_reminder"),
      v.literal("class_spot_available"),
      v.literal("workout_completion_reminder"),
      v.literal("payment_review_approved"),
      v.literal("payment_review_declined"),
      v.literal("plan_due_soon"),
      v.literal("plan_due_today"),
      v.literal("member_payment_approved"),
      v.literal("member_payment_failed"),
      v.literal("member_payment_grace_ending"),
      v.literal("member_payment_suspended"),
      v.literal("member_payment_recovered"),
      v.literal("member_payment_amount_changed"),
      v.literal("member_payment_cancellation_scheduled"),
      v.literal("member_checkout_incomplete"),
      v.literal("member_payment_admin_alert"),
    ),
    userId: v.string(),
    scheduleId: v.optional(v.id("classSchedules")),
    workoutSessionId: v.optional(v.id("workoutDaySessions")),
    paymentId: v.optional(v.id("planPayments")),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();

    if (existing) {
      return {
        created: false,
        eventId: existing._id,
      };
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("notificationEvents", {
      eventKey: args.eventKey,
      type: args.type,
      userId: args.userId,
      scheduleId: args.scheduleId,
      workoutSessionId: args.workoutSessionId,
      paymentId: args.paymentId,
      subscriptionId: args.subscriptionId,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      created: true,
      eventId,
    };
  },
});

export const markNotificationEventSent = internalMutation({
  args: {
    eventId: v.id("notificationEvents"),
    tokenCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.eventId, {
      status: "sent",
      attempts: 1,
      tokenCount: args.tokenCount,
      lastAttemptAt: now,
      sentAt: now,
      updatedAt: now,
      error: undefined,
    });
  },
});

export const markNotificationEventSkipped = internalMutation({
  args: {
    eventId: v.id("notificationEvents"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.eventId, {
      status: "skipped",
      attempts: 1,
      lastAttemptAt: now,
      updatedAt: now,
      error: args.reason,
    });
  },
});

export const markNotificationEventFailed = internalMutation({
  args: {
    eventId: v.id("notificationEvents"),
    reason: v.string(),
    tokenCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.eventId, {
      status: "failed",
      attempts: 1,
      tokenCount: args.tokenCount,
      lastAttemptAt: now,
      updatedAt: now,
      error: args.reason,
    });
  },
});

export const deactivateAllTokensForUser = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("active", true),
      )
      .collect();

    const now = Date.now();
    let deactivated = 0;

    for (const token of tokens) {
      await ctx.db.patch(token._id, {
        active: false,
        updatedAt: now,
      });
      deactivated += 1;
    }

    return { deactivated };
  },
});

export const deactivateTokensInternal = internalMutation({
  args: {
    tokens: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let deactivated = 0;

    for (const token of args.tokens) {
      const existing = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();

      if (!existing || !existing.active) {
        continue;
      }

      await ctx.db.patch(existing._id, {
        active: false,
        updatedAt: now,
      });
      deactivated += 1;
    }

    return { deactivated };
  },
});

export const sendPreClassReminders = internalMutation({
  args: {
    lookAheadMinutes: v.optional(v.number()),
    windowMinutes: v.optional(v.number()),
    scheduleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const lookAheadMinutes = args.lookAheadMinutes ?? 60;
    const windowMinutes = args.windowMinutes ?? 10;
    const scheduleLimit = args.scheduleLimit ?? 150;

    const target = now + lookAheadMinutes * 60 * 1000;
    const halfWindowMs = (windowMinutes * 60 * 1000) / 2;
    const windowStart = target - halfWindowMs;
    const windowEnd = target + halfWindowMs;

    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_start_time", (q) => q.gte("startTime", windowStart))
      .filter((q) =>
        q.and(
          q.lte(q.field("startTime"), windowEnd),
          q.eq(q.field("status"), "scheduled"),
          q.gt(q.field("currentReservations"), 0),
        ),
      )
      .take(scheduleLimit);

    let enqueued = 0;
    const classNameById = new Map<string, string>();

    for (const schedule of schedules) {
      const className = await getClassNameCached(
        ctx,
        schedule.classId,
        classNameById,
      );
      if (!className) {
        continue;
      }

      const copy = buildPreClassReminderCopy(className);

      const reservations = await ctx.db
        .query("classReservations")
        .withIndex("by_schedule_status", (q) =>
          q.eq("scheduleId", schedule._id).eq("status", "confirmed"),
        )
        .collect();

      for (const reservation of reservations) {
        const eventKey = `class_start_reminder:${schedule._id}:${reservation.userId}`;

        await ctx.scheduler.runAfter(
          0,
          internal.pushNotificationsNode.sendExpoPushForEvent,
          {
            eventKey,
            type: "class_start_reminder",
            userId: reservation.userId,
            scheduleId: schedule._id,
            title: copy.title,
            body: copy.body,
            data: {
              scheduleId: schedule._id,
              classId: schedule.classId,
              type: "class_start_reminder",
            },
          },
        );
        enqueued += 1;
      }
    }

    return {
      processedSchedules: schedules.length,
      enqueued,
      windowStart,
      windowEnd,
    };
  },
});

export const sendWorkoutCompletionReminder = internalMutation({
  args: {
    sessionId: v.id("workoutDaySessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "started") {
      return { enqueued: false, reason: "Session is no longer started" };
    }

    const copy = buildWorkoutCompletionReminderCopy();
    const eventKey = `workout_completion_reminder:${args.sessionId}`;

    await ctx.scheduler.runAfter(
      0,
      internal.pushNotificationsNode.sendExpoPushForEvent,
      {
        eventKey,
        type: "workout_completion_reminder",
        userId: session.userId,
        workoutSessionId: args.sessionId,
        title: copy.title,
        body: copy.body,
        data: {
          type: "workout_completion_reminder",
          sessionId: args.sessionId,
          href: `/home/workout/${args.sessionId}`,
        },
      },
    );

    return { enqueued: true };
  },
});

export const sendPaymentReviewNotification = internalMutation({
  args: {
    paymentId: v.id("planPayments"),
    status: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== args.status) {
      return { enqueued: false, reason: "Payment status changed" };
    }

    const isApproved = args.status === "approved";
    const eventKey = `payment_review_${args.status}:${args.paymentId}`;

    await ctx.scheduler.runAfter(
      0,
      internal.pushNotificationsNode.sendExpoPushForEvent,
      {
        eventKey,
        type: isApproved
          ? "payment_review_approved"
          : "payment_review_declined",
        userId: payment.userId,
        paymentId: args.paymentId,
        title: isApproved ? "Pago aprobado" : "Pago rechazado",
        body: isApproved
          ? "Tu gimnasio aprobo el comprobante."
          : "Tu gimnasio rechazo el comprobante. Revisa el motivo y volve a subirlo.",
        data: {
          type: isApproved
            ? "payment_review_approved"
            : "payment_review_declined",
          paymentId: args.paymentId,
          href: "/(tabs)/plan/payment-history",
        },
      },
    );

    return { enqueued: true };
  },
});

export const sendAttendanceReminders = internalMutation({
  args: {
    delayMinutes: v.optional(v.number()),
    windowMinutes: v.optional(v.number()),
    scheduleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const delayMinutes = args.delayMinutes ?? 60;
    const windowMinutes = args.windowMinutes ?? 10;
    const scheduleLimit = args.scheduleLimit ?? 150;

    const target = now - delayMinutes * 60 * 1000;
    const halfWindowMs = (windowMinutes * 60 * 1000) / 2;
    const windowStart = target - halfWindowMs;
    const windowEnd = target + halfWindowMs;

    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_end_time", (q) => q.gte("endTime", windowStart))
      .filter((q) =>
        q.and(
          q.lte(q.field("endTime"), windowEnd),
          q.neq(q.field("status"), "cancelled"),
          q.gt(q.field("currentReservations"), 0),
        ),
      )
      .take(scheduleLimit);

    let enqueued = 0;
    const classNameById = new Map<string, string>();

    for (const schedule of schedules) {
      const className = await getClassNameCached(
        ctx,
        schedule.classId,
        classNameById,
      );
      if (!className) {
        continue;
      }

      const copy = buildAttendanceReminderCopy(className);

      const reservations = await ctx.db
        .query("classReservations")
        .withIndex("by_schedule_status", (q) =>
          q.eq("scheduleId", schedule._id).eq("status", "confirmed"),
        )
        .collect();

      for (const reservation of reservations) {
        const eventKey = `attendance_reminder:${schedule._id}:${reservation.userId}`;

        await ctx.scheduler.runAfter(
          0,
          internal.pushNotificationsNode.sendExpoPushForEvent,
          {
            eventKey,
            type: "attendance_reminder",
            userId: reservation.userId,
            scheduleId: schedule._id,
            title: copy.title,
            body: copy.body,
            data: {
              scheduleId: schedule._id,
              classId: schedule.classId,
              type: "attendance_reminder",
            },
          },
        );
        enqueued += 1;
      }
    }

    return {
      processedSchedules: schedules.length,
      enqueued,
      windowStart,
      windowEnd,
    };
  },
});

export const sendSpotAvailableAlerts = internalMutation({
  args: {
    scheduleId: v.id("classSchedules"),
    className: v.string(),
  },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("classAlerts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    let enqueued = 0;
    for (const alert of alerts) {
      const eventKey = `class_spot_available:${args.scheduleId}:${alert.userId}`;
      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode.sendExpoPushForEvent,
        {
          eventKey,
          type: "class_spot_available",
          userId: alert.userId,
          scheduleId: args.scheduleId,
          title: "¡Lugar disponible!",
          body: `Se liberó un lugar en ${args.className}. Reservá antes de que se llene.`,
          data: {
            scheduleId: args.scheduleId,
            type: "class_spot_available",
          },
        },
      );
      enqueued += 1;
    }

    return { enqueued };
  },
});

export const sendCancelledToAlertSubscribers = internalMutation({
  args: {
    scheduleId: v.id("classSchedules"),
    className: v.string(),
    excludeUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("classAlerts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    let enqueued = 0;
    for (const alert of alerts) {
      // Skip users already notified via reservation cancellation
      if (args.excludeUserIds.includes(alert.userId)) continue;

      const eventKey = `class_cancelled:${args.scheduleId}:${alert.userId}`;
      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode.sendExpoPushForEvent,
        {
          eventKey,
          type: "class_cancelled",
          userId: alert.userId,
          scheduleId: args.scheduleId,
          title: "Clase cancelada",
          body: `${args.className} fue cancelada.`,
          data: {
            scheduleId: args.scheduleId,
            type: "class_cancelled",
          },
        },
      );
      enqueued += 1;
    }

    return { enqueued };
  },
});

/**
 * Hourly fan-out for plan expiration reminders. Only organizations whose local
 * time just hit `PLAN_DUE_REMINDER_LOCAL_HOUR` get a worker enqueued, so each
 * gym is notified at 10:00 in its own timezone.
 */
export const sendPlanExpirationReminders = internalMutation({
  args: {
    subscriptionLimit: v.optional(v.number()),
    forceHour: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const orgs = await ctx.db.query("organizations").collect();

    let enqueuedOrganizations = 0;
    for (const org of orgs) {
      const timezone = getPaymentTimezone(org.timezone);
      const local = getZonedDateParts(now, timezone);
      if (!args.forceHour && local.hour !== PLAN_DUE_REMINDER_LOCAL_HOUR) {
        continue;
      }

      await ctx.scheduler.runAfter(
        0,
        internal.pushNotifications.sendPlanExpirationRemindersForOrg,
        {
          orgId: org._id,
          subscriptionLimit: args.subscriptionLimit,
        },
      );
      enqueuedOrganizations += 1;
    }

    return { processedOrganizations: orgs.length, enqueuedOrganizations };
  },
});

/**
 * Per-organization worker: walks active subscriptions in pages and enqueues a
 * push for every member whose plan is due in `PLAN_DUE_SOON_DAYS` days or today.
 *
 * Skipped: family associates (only the titular is billed), members without an
 * active membership, fully bonified subscriptions, and periods already paid.
 */
export const sendPlanExpirationRemindersForOrg = internalMutation({
  args: {
    orgId: v.id("organizations"),
    cursor: v.optional(v.union(v.string(), v.null())),
    subscriptionLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) return { processedSubscriptions: 0, enqueued: 0, isDone: true };

    const timezone = getPaymentTimezone(org.timezone);
    const now = Date.now();
    const today = getZonedDateParts(now, timezone);
    const todayDateMs = Date.UTC(today.year, today.month - 1, today.day);
    const subscriptionLimit = args.subscriptionLimit ?? 50;

    const page = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", org._id).eq("status", "active"),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: subscriptionLimit,
      });

    let enqueued = 0;

    for (const sub of page.page) {
      // Family associates are covered by the titular's payment.
      if (sub.familyParentSubscriptionId) continue;

      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", sub.organizationId).eq("userId", sub.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("role"), "member"),
            q.eq(q.field("status"), "active"),
          ),
        )
        .first();
      if (!membership) continue;

      const plan = await ctx.db.get(sub.planId);
      if (!plan) continue;

      const { dueAt, billingPeriod, dueLabel } = getUpcomingDueDate(
        plan,
        sub.activatedAt,
        today,
        timezone,
      );

      const daysUntilDue = Math.round((dueAt - todayDateMs) / DAY_MS);
      const isDueSoon = daysUntilDue === PLAN_DUE_SOON_DAYS;
      const isDueToday = daysUntilDue === 0;
      if (!isDueSoon && !isDueToday) continue;

      // A join_date member pays on activation, so their first anniversary is the
      // first date they actually owe. Anything earlier is already covered.
      if (
        (plan.billingMode ?? "calendar") === "join_date" &&
        dueAt < getFirstJoinDateBillingDueAt(sub.activatedAt, timezone)
      ) {
        continue;
      }

      // Fully bonified subscriptions never owe anything.
      const activeBonification = await ctx.db
        .query("planBonifications")
        .withIndex("by_subscription_status", (q) =>
          q.eq("subscriptionId", sub._id).eq("status", "active"),
        )
        .first();
      if (
        activeBonification &&
        computeBonificationAmount(
          plan.priceArs,
          activeBonification.discountType,
          activeBonification.discountValue,
        ) === 0
      ) {
        continue;
      }

      // Already settled for this period (includes months paid in advance).
      const existingPayment = await ctx.db
        .query("planPayments")
        .withIndex("by_subscription_period", (q) =>
          q.eq("subscriptionId", sub._id).eq("billingPeriod", billingPeriod),
        )
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("status"), "in_review"),
          ),
        )
        .first();
      if (existingPayment) continue;

      const type = isDueToday ? "plan_due_today" : "plan_due_soon";
      const copy = isDueToday
        ? buildPlanDueTodayCopy(plan.name)
        : buildPlanDueSoonCopy(plan.name, dueLabel);

      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode.sendExpoPushForEvent,
        {
          eventKey: `${type}:${sub._id}:${billingPeriod}`,
          type,
          userId: sub.userId,
          subscriptionId: sub._id,
          title: copy.title,
          body: copy.body,
          data: {
            type,
            subscriptionId: sub._id,
            billingPeriod,
            href: "/(tabs)/plan",
          },
        },
      );
      enqueued += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.pushNotifications.sendPlanExpirationRemindersForOrg,
        {
          orgId: args.orgId,
          cursor: page.continueCursor,
          subscriptionLimit,
        },
      );
    }

    return {
      processedSubscriptions: page.page.length,
      enqueued,
      isDone: page.isDone,
    };
  },
});

export const sendClassCancelledReminder = internalMutation({
  args: {
    scheduleId: v.id("classSchedules"),
    userIds: v.array(v.string()),
    className: v.string(),
  },
  handler: async (ctx, args) => {
    let enqueued = 0;
    for (const userId of args.userIds) {
      const eventKey = `class_cancelled:${args.scheduleId}:${userId}`;

      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode.sendExpoPushForEvent,
        {
          eventKey,
          type: "class_cancelled",
          userId,
          scheduleId: args.scheduleId,
          title: "Clase cancelada",
          body: `Tu reserva para ${args.className} fue cancelada.`,
          data: {
            scheduleId: args.scheduleId,
            type: "class_cancelled",
          },
        },
      );
      enqueued += 1;
    }

    return { enqueued };
  },
});
