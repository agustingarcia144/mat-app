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
    ),
    userId: v.string(),
    scheduleId: v.id("classSchedules"),
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
