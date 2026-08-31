import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import {
  assignFixedSlotsToSchedule,
  getDayAndMinutesInZone,
} from "./fixedClassSlots";
import {
  createBatchWithSchedules,
  type ClassScheduleInsert,
} from "./scheduleBatchUtils";

async function getReservationsForSchedule(
  ctx: MutationCtx,
  scheduleId: Id<"classSchedules">,
) {
  return await ctx.db
    .query("classReservations")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
    .collect();
}

function canEditOrDeleteSchedule(
  schedule: {
    status: "scheduled" | "cancelled" | "completed";
  },
  reservations: Array<{
    status: "confirmed" | "cancelled" | "attended" | "no_show";
  }>,
  force = false,
) {
  if (force) {
    return true;
  }

  if (reservations.length === 0) {
    return true;
  }

  const hasAttendanceHistory = reservations.some(
    (reservation) =>
      reservation.status === "attended" || reservation.status === "no_show",
  );
  if (hasAttendanceHistory) {
    return false;
  }

  const hasNonCancelledReservations = reservations.some(
    (reservation) => reservation.status !== "cancelled",
  );
  if (hasNonCancelledReservations) {
    return false;
  }

  return schedule.status === "cancelled";
}

/**
 * Create a single class schedule
 */
export const create = mutation({
  args: {
    classId: v.id("classes"),
    startTime: v.number(),
    endTime: v.number(),
    capacity: v.optional(v.number()), // Override class capacity
    // Staff member in charge of this occurrence; defaults from the class trainer.
    inChargeUserId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const classTemplate = await ctx.db.get(args.classId);
    if (!classTemplate) {
      throw new Error("Class not found");
    }

    // Validate startTime < endTime
    if (args.startTime >= args.endTime) {
      throw new Error("startTime must be before endTime");
    }

    await requireAdminOrTrainer(ctx, classTemplate.organizationId);

    const now = Date.now();

    const scheduleId = await ctx.db.insert("classSchedules", {
      classId: args.classId,
      organizationId: classTemplate.organizationId,
      startTime: args.startTime,
      endTime: args.endTime,
      capacity: args.capacity ?? classTemplate.capacity,
      currentReservations: 0,
      status: "scheduled",
      inChargeUserId: args.inChargeUserId ?? classTemplate.trainerId,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    await assignFixedSlotsToSchedule(ctx, scheduleId);
    return scheduleId;
  },
});

/**
 * Update a class schedule
 */
export const update = mutation({
  args: {
    id: v.id("classSchedules"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    capacity: v.optional(v.number()),
    // Pass a string to set the in-charge staff, or null to clear it.
    inChargeUserId: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId);

    // Changing the time or capacity of a turno with active reservations /
    // attendance is disallowed. Metadata-only edits (in-charge staff, notes)
    // are always allowed, even when the turno has reservations.
    const changesTimeOrCapacity =
      args.startTime !== undefined ||
      args.endTime !== undefined ||
      args.capacity !== undefined;

    if (changesTimeOrCapacity) {
      const reservations = await getReservationsForSchedule(ctx, args.id);
      if (!canEditOrDeleteSchedule(schedule, reservations)) {
        throw new Error(
          "No se puede editar un turno con reservas activas o asistencias.",
        );
      }
    }

    const nextStartTime = args.startTime ?? schedule.startTime;
    const nextEndTime = args.endTime ?? schedule.endTime;
    if (nextStartTime >= nextEndTime) {
      throw new Error("startTime must be before endTime");
    }

    // If reducing capacity, check that we don't have more reservations
    if (
      args.capacity !== undefined &&
      args.capacity < schedule.currentReservations
    ) {
      throw new Error(
        `Cannot reduce capacity below current reservations (${schedule.currentReservations})`,
      );
    }

    const { id, inChargeUserId, ...updates } = args;

    const patch: Record<string, unknown> = {
      ...updates,
      updatedAt: Date.now(),
    };
    if (inChargeUserId !== undefined) {
      patch.inChargeUserId = inChargeUserId ?? undefined;
    }

    await ctx.db.patch(id, patch);
  },
});

/**
 * Cancel a specific class occurrence (and all its reservations).
 * Use when the turno has reservations — keeps history with status 'cancelled'.
 */
export const cancel = mutation({
  args: {
    id: v.id("classSchedules"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId);

    // Cancel all reservations for this schedule
    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_schedule_status", (q) =>
        q.eq("scheduleId", args.id).eq("status", "confirmed"),
      )
      .collect();

    const now = Date.now();
    const classTemplate = await ctx.db.get(schedule.classId);
    const className = classTemplate?.name ?? "tu clase";
    const affectedUserIds = reservations.map(
      (reservation) => reservation.userId,
    );

    for (const reservation of reservations) {
      await ctx.db.patch(reservation._id, {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: now,
    });

    if (affectedUserIds.length > 0) {
      await ctx.runMutation(
        internal.pushNotifications.sendClassCancelledReminder,
        {
          scheduleId: args.id,
          userIds: affectedUserIds,
          className,
        },
      );
    }

    // Notify alert subscribers who didn't have a reservation
    await ctx.runMutation(
      internal.pushNotifications.sendCancelledToAlertSubscribers,
      {
        scheduleId: args.id,
        className,
        excludeUserIds: affectedUserIds,
      },
    );
  },
});

/**
 * Remove (delete) a schedule.
 * By default only allowed when it has no active reservations / attendance.
 * Pass `force: true` to remove even when reservations or attendance exist
 * (confirmed reservations are cancelled and members are notified first).
 */
export const remove = mutation({
  args: {
    id: v.id("classSchedules"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await requireAdminOrTrainer(ctx, schedule.organizationId);

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.id))
      .collect();

    const force = args.force ?? false;

    if (!canEditOrDeleteSchedule(schedule, reservations, force)) {
      throw new Error(
        "No se puede eliminar un turno con reservas activas o asistencias.",
      );
    }

    // When force-removing a schedule with active reservations, cancel them and notify
    if (force) {
      const confirmedReservations = reservations.filter(
        (r) => r.status === "confirmed",
      );
      const now = Date.now();

      if (confirmedReservations.length > 0) {
        const classTemplate = await ctx.db.get(schedule.classId);
        const className = classTemplate?.name ?? "tu clase";
        const affectedUserIds = confirmedReservations.map((r) => r.userId);

        for (const reservation of confirmedReservations) {
          await ctx.db.patch(reservation._id, {
            status: "cancelled",
            cancelledAt: now,
            updatedAt: now,
          });
        }

        await ctx.runMutation(
          internal.pushNotifications.sendClassCancelledReminder,
          {
            scheduleId: args.id,
            userIds: affectedUserIds,
            className,
          },
        );
      }
    }

    for (const reservation of reservations) {
      await ctx.db.delete(reservation._id);
    }

    await ctx.db.delete(args.id);

    if (schedule.batchId) {
      const remainingSchedules = await ctx.db
        .query("classSchedules")
        .withIndex("by_batch", (q) => q.eq("batchId", schedule.batchId))
        .collect();

      if (remainingSchedules.length === 0) {
        await ctx.db.delete(schedule.batchId);
      }
    }
  },
});

/**
 * Get schedule by ID
 */
export const getById = query({
  args: {
    id: v.id("classSchedules"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      return null;
    }

    await requireOrganizationMembership(ctx, schedule.organizationId);

    return schedule;
  },
});

/**
 * Get all schedules for a specific class
 */
export const getByClass = query({
  args: {
    classId: v.id("classes"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Get the class to check organization
    const classTemplate = await ctx.db.get(args.classId);
    if (!classTemplate) {
      throw new Error("Class not found");
    }

    await requireOrganizationMembership(ctx, classTemplate.organizationId);

    return await ctx.db
      .query("classSchedules")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .collect();
  },
});

type ScheduleWithBreakdown = Doc<"classSchedules"> & {
  reservationBreakdown?: { fixedSlot: number; regular: number };
};

/**
 * Get schedules in a date range for an organization.
 *
 * Database I/O notes (this is one of the hottest queries in the app):
 * - The date range is fully expressed on the index (`gte` + `lte`). Using
 *   `.filter()` for the upper bound would read every schedule from `startDate`
 *   to the end of the table — the whole generation horizon — on every call.
 * - `classId` narrows the scan through `by_class_time` instead of collecting
 *   the whole org and filtering in JS.
 * - `includeReservationBreakdown` is opt-in: only the admin calendars need the
 *   fixed-vs-regular split, so member clients never pay for reservation reads.
 * - The org's fixed slots are read once per query (not once per schedule), and
 *   reservations are only read for schedules that actually have a fixed slot;
 *   otherwise the denormalized `currentReservations` counter is enough.
 */
export const getByOrganizationAndDateRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    classId: v.optional(v.id("classes")), // Filter by specific class
    includeReservationBreakdown: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ScheduleWithBreakdown[]> => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;

    let schedules;
    if (args.classId) {
      // by_class_time is not scoped by organization, so verify ownership first.
      const classTemplate = await ctx.db.get(args.classId);
      if (!classTemplate || classTemplate.organizationId !== organizationId) {
        return [];
      }
      const classId = args.classId;
      schedules = await ctx.db
        .query("classSchedules")
        .withIndex("by_class_time", (q) =>
          q
            .eq("classId", classId)
            .gte("startTime", args.startDate)
            .lte("startTime", args.endDate),
        )
        .collect();
    } else {
      schedules = await ctx.db
        .query("classSchedules")
        .withIndex("by_organization_time", (q) =>
          q
            .eq("organizationId", organizationId)
            .gte("startTime", args.startDate)
            .lte("startTime", args.endDate),
        )
        .collect();
    }

    if (!args.includeReservationBreakdown) {
      return schedules;
    }

    const organization = await ctx.db.get(organizationId);
    const timezone =
      organization?.timezone && organization.timezone.trim() !== ""
        ? organization.timezone
        : "UTC";

    // One read of the org's fixed slots, indexed by class + weekly slot.
    const fixedSlots = await ctx.db
      .query("fixedClassSlots")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const fixedSlotUsersByKey = new Map<string, Set<string>>();
    for (const slot of fixedSlots) {
      const key = `${slot.classId}|${slot.dayOfWeek}|${slot.startTimeMinutes}`;
      const users = fixedSlotUsersByKey.get(key);
      if (users) {
        users.add(slot.userId);
      } else {
        fixedSlotUsersByKey.set(key, new Set([slot.userId]));
      }
    }

    return await Promise.all(
      schedules.map(async (schedule) => {
        const { dayOfWeek, startTimeMinutes } = getDayAndMinutesInZone(
          schedule.startTime,
          timezone,
        );
        const fixedSlotUserIds = fixedSlotUsersByKey.get(
          `${schedule.classId}|${dayOfWeek}|${startTimeMinutes}`,
        );

        // No member holds this weekly slot, so the split is trivial and there
        // is nothing to learn from reading the reservations.
        if (!fixedSlotUserIds || fixedSlotUserIds.size === 0) {
          return {
            ...schedule,
            reservationBreakdown: {
              fixedSlot: 0,
              regular: Math.max(0, schedule.currentReservations),
            },
          };
        }

        const reservations = await ctx.db
          .query("classReservations")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .collect();

        const activeReservations = reservations.filter(
          (reservation) => reservation.status !== "cancelled",
        );
        const fixedSlot = activeReservations.filter((reservation) =>
          fixedSlotUserIds.has(reservation.userId),
        ).length;

        return {
          ...schedule,
          reservationBreakdown: {
            fixedSlot,
            regular: Math.max(0, activeReservations.length - fixedSlot),
          },
        };
      }),
    );
  },
});
/**
 * Get upcoming schedules (next N occurrences)
 */
export const getUpcoming = query({
  args: {
    limit: v.optional(v.number()),
    classId: v.optional(v.id("classes")),
  },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return [];
    }
    const { membership } = orgCtx;

    const now = Date.now();
    const limit = args.limit ?? 10;

    let query = ctx.db
      .query("classSchedules")
      .withIndex("by_organization_time", (q) =>
        q.eq("organizationId", membership.organizationId).gte("startTime", now),
      )
      .filter((q) => q.eq(q.field("status"), "scheduled"));

    if (args.classId) {
      query = query.filter((q) => q.eq(q.field("classId"), args.classId));
    }

    return await query.take(limit);
  },
});

/**
 * Get schedule with enriched data (class info, reservation count)
 */
export const getScheduleWithDetails = query({
  args: {
    id: v.id("classSchedules"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;

    await requireOrganizationMembership(ctx, schedule.organizationId);

    const classTemplate = await ctx.db.get(schedule.classId);

    return {
      ...schedule,
      class: classTemplate,
    };
  },
});

/**
 * Debug: Get all schedules for organization
 */
export const getAllByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);

    return await ctx.db
      .query("classSchedules")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();
  },
});

/**
 * Copy the "model week" pattern (derived from schedules in the selected week + fixed slots)
 * into one or more target weeks, preserving start/end times for each block.
 *
 * Fixed-slot-only blocks will be generated using the duration computed client-side
 * (fallback is the UI default).
 */
export const copyModelWeekToDateRange = mutation({
  args: {
    sourceWeekStartDate: v.number(), // ms at the start of the source week (client computed)
    templates: v.array(
      v.object({
        classId: v.id("classes"),
        startTime: v.number(),
        endTime: v.number(),
        capacity: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
    targetWeekStarts: v.array(v.number()), // ms at the start of each target week
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    if (args.templates.length === 0) {
      throw new Error("No hay turnos para duplicar.");
    }
    if (args.targetWeekStarts.length === 0) {
      throw new Error("Seleccioná al menos una semana de destino.");
    }

    const now = Date.now();

    // Group templates by classId (scheduleBatches are per-class).
    type CopyModelTemplate = (typeof args.templates)[number];
    const templatesByClass = new Map<Id<"classes">, CopyModelTemplate[]>();
    for (const t of args.templates) {
      const list = templatesByClass.get(t.classId) ?? [];
      list.push(t as CopyModelTemplate);
      templatesByClass.set(t.classId, list);
    }

    const batchResults: Array<{
      batchId: Id<"scheduleBatches">;
      count: number;
    }> = [];
    const classIds: Id<"classes">[] = [];
    templatesByClass.forEach((_, classId) => {
      classIds.push(classId);
    });

    for (const classId of classIds) {
      const classTemplates = templatesByClass.get(classId) ?? [];
      const schedules: ClassScheduleInsert[] = [];

      const durationMinutes = Math.max(
        1,
        Math.round(
          (classTemplates[0]!.endTime - classTemplates[0]!.startTime) / 60000,
        ),
      );

      for (const targetWeekStart of args.targetWeekStarts) {
        const delta = targetWeekStart - args.sourceWeekStartDate;
        for (const tpl of classTemplates) {
          const newStart = tpl.startTime + delta;
          const newEnd = tpl.endTime + delta;
          if (newEnd <= newStart) continue;

          schedules.push({
            classId,
            organizationId: membership.organizationId,
            startTime: newStart,
            endTime: newEnd,
            capacity: tpl.capacity,
            currentReservations: 0,
            status: "scheduled",
            notes: tpl.notes,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (schedules.length === 0) continue;

      const first = [...schedules].sort(
        (a, b) => a.startTime - b.startTime,
      )[0]!;

      const result = await createBatchWithSchedules(ctx, {
        organizationId: membership.organizationId,
        classId,
        sourceType: "single",
        sourceConfig: {
          mode: "single",
          startTime: first.startTime,
          endTime: first.endTime,
          durationMinutes,
        },
        createdBy: identity.subject,
        schedules,
      });

      batchResults.push({ batchId: result.batchId, count: result.count });
    }

    const createdCount = batchResults.reduce((acc, r) => acc + r.count, 0);
    return {
      createdSchedules: createdCount,
      batchesCreated: batchResults.length,
    };
  },
});

/**
 * Bulk cancel multiple schedules. Already-cancelled schedules are skipped.
 * Confirmed reservations are cancelled and members are notified.
 * Capped at 50 schedules per call to stay within mutation time limits.
 */
export const bulkCancel = mutation({
  args: {
    scheduleIds: v.array(v.id("classSchedules")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.scheduleIds.length > 50) {
      throw new Error("Se pueden cancelar hasta 50 turnos a la vez.");
    }

    let cancelledCount = 0;
    let skippedCount = 0;

    for (const scheduleId of args.scheduleIds) {
      const schedule = await ctx.db.get(scheduleId);
      if (!schedule) {
        skippedCount++;
        continue;
      }
      if (schedule.status === "cancelled") {
        skippedCount++;
        continue;
      }

      await requireAdminOrTrainer(ctx, schedule.organizationId);

      // Cancel all confirmed reservations
      const confirmedReservations = await ctx.db
        .query("classReservations")
        .withIndex("by_schedule_status", (q) =>
          q.eq("scheduleId", scheduleId).eq("status", "confirmed"),
        )
        .collect();

      const now = Date.now();
      const classTemplate = await ctx.db.get(schedule.classId);
      const className = classTemplate?.name ?? "tu clase";
      const affectedUserIds = confirmedReservations.map((r) => r.userId);

      for (const reservation of confirmedReservations) {
        await ctx.db.patch(reservation._id, {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.patch(scheduleId, {
        status: "cancelled",
        updatedAt: now,
      });

      if (affectedUserIds.length > 0) {
        await ctx.runMutation(
          internal.pushNotifications.sendClassCancelledReminder,
          {
            scheduleId,
            userIds: affectedUserIds,
            className,
          },
        );
      }

      cancelledCount++;
    }

    return { cancelledCount, skippedCount };
  },
});

/**
 * Bulk remove (delete) multiple schedules.
 * When `force` is true, cancels reservations and notifies members before deleting.
 * When `force` is false, skips schedules that have active reservations / attendance.
 * Capped at 50 schedules per call.
 */
export const bulkRemove = mutation({
  args: {
    scheduleIds: v.array(v.id("classSchedules")),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.scheduleIds.length > 50) {
      throw new Error("Se pueden eliminar hasta 50 turnos a la vez.");
    }

    const force = args.force ?? false;
    let removedCount = 0;
    let skippedCount = 0;

    for (const scheduleId of args.scheduleIds) {
      const schedule = await ctx.db.get(scheduleId);
      if (!schedule) {
        skippedCount++;
        continue;
      }

      await requireAdminOrTrainer(ctx, schedule.organizationId);

      const reservations = await ctx.db
        .query("classReservations")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
        .collect();

      if (!canEditOrDeleteSchedule(schedule, reservations, force)) {
        skippedCount++;
        continue;
      }

      // When force-removing, cancel confirmed reservations and notify
      if (force) {
        const confirmedReservations = reservations.filter(
          (r) => r.status === "confirmed",
        );
        const now = Date.now();

        if (confirmedReservations.length > 0) {
          const classTemplate = await ctx.db.get(schedule.classId);
          const className = classTemplate?.name ?? "tu clase";
          const affectedUserIds = confirmedReservations.map((r) => r.userId);

          for (const reservation of confirmedReservations) {
            await ctx.db.patch(reservation._id, {
              status: "cancelled",
              cancelledAt: now,
              updatedAt: now,
            });
          }

          await ctx.runMutation(
            internal.pushNotifications.sendClassCancelledReminder,
            {
              scheduleId,
              userIds: affectedUserIds,
              className,
            },
          );
        }
      }

      // Delete all reservations
      for (const reservation of reservations) {
        await ctx.db.delete(reservation._id);
      }

      await ctx.db.delete(scheduleId);

      // Clean up empty batch
      if (schedule.batchId) {
        const remainingSchedules = await ctx.db
          .query("classSchedules")
          .withIndex("by_batch", (q) => q.eq("batchId", schedule.batchId))
          .collect();

        if (remainingSchedules.length === 0) {
          await ctx.db.delete(schedule.batchId);
        }
      }

      removedCount++;
    }

    return { removedCount, skippedCount };
  },
});

/**
 * Get schedule summary for a specific day (used by bulk-cancel-day dialog).
 * Returns schedules with reservation count breakdowns.
 */
export const getScheduleSummaryForDay = query({
  args: {
    dayStartTime: v.number(),
    dayEndTime: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);

    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .gte("startTime", args.dayStartTime)
          .lte("startTime", args.dayEndTime),
      )
      .collect();

    const results = await Promise.all(
      schedules.map(async (schedule) => {
        const reservations = await ctx.db
          .query("classReservations")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .collect();

        const classTemplate = await ctx.db.get(schedule.classId);

        return {
          ...schedule,
          className: classTemplate?.name ?? "Clase",
          reservationCounts: {
            confirmed: reservations.filter((r) => r.status === "confirmed")
              .length,
            cancelled: reservations.filter((r) => r.status === "cancelled")
              .length,
            attended: reservations.filter((r) => r.status === "attended")
              .length,
            noShow: reservations.filter((r) => r.status === "no_show").length,
          },
        };
      }),
    );

    return results.sort((a, b) => a.startTime - b.startTime);
  },
});
