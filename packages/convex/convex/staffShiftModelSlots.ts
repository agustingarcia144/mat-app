import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdmin,
  requireAdminOrTrainer,
  requireAuth,
  requireCurrentOrganizationMembership,
} from "./permissions";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const listByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    return await ctx.db
      .query("staffShiftModelSlots")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    userId: v.string(),
    dayOfWeek: v.number(),
    startTimeMinutes: v.number(),
    endTimeMinutes: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    if (args.endTimeMinutes <= args.startTimeMinutes) {
      throw new Error("El horario de fin debe ser posterior al de inicio.");
    }

    const now = Date.now();
    return await ctx.db.insert("staffShiftModelSlots", {
      organizationId: membership.organizationId,
      userId: args.userId,
      dayOfWeek: args.dayOfWeek,
      startTimeMinutes: args.startTimeMinutes,
      endTimeMinutes: args.endTimeMinutes,
      notes: args.notes,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("staffShiftModelSlots"),
    userId: v.optional(v.string()),
    dayOfWeek: v.optional(v.number()),
    startTimeMinutes: v.optional(v.number()),
    endTimeMinutes: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const slot = await ctx.db.get(args.id);
    if (!slot || slot.organizationId !== membership.organizationId) {
      throw new Error("Slot not found");
    }

    const { id, ...fields } = args;
    const start = fields.startTimeMinutes ?? slot.startTimeMinutes;
    const end = fields.endTimeMinutes ?? slot.endTimeMinutes;
    if (end <= start) {
      throw new Error("El horario de fin debe ser posterior al de inicio.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.userId !== undefined) patch.userId = fields.userId;
    if (fields.dayOfWeek !== undefined) patch.dayOfWeek = fields.dayOfWeek;
    if (fields.startTimeMinutes !== undefined)
      patch.startTimeMinutes = fields.startTimeMinutes;
    if (fields.endTimeMinutes !== undefined)
      patch.endTimeMinutes = fields.endTimeMinutes;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("staffShiftModelSlots") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const slot = await ctx.db.get(args.id);
    if (!slot || slot.organizationId !== membership.organizationId) {
      throw new Error("Slot not found");
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Generate dated staffShifts from the model week template into one or more
 * target weeks. Each targetWeekStart must be the timestamp of the Monday of
 * that week (local midnight). Any previously generated shifts (those carrying a
 * sourceModelSlotId) inside a target week are cleared first so re-applying is
 * idempotent; manually created shifts (no sourceModelSlotId) are preserved.
 */
export const applyToDateRange = mutation({
  args: {
    targetWeekStarts: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    if (args.targetWeekStarts.length === 0) {
      throw new Error("Seleccioná al menos una semana de destino.");
    }

    const modelSlots = await ctx.db
      .query("staffShiftModelSlots")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();

    if (modelSlots.length === 0) {
      throw new Error("No hay turnos en la semana modelo.");
    }

    const now = Date.now();
    let createdCount = 0;

    for (const targetWeekStart of args.targetWeekStarts) {
      const weekEnd = targetWeekStart + WEEK_MS;

      // Clear previously generated shifts in this week.
      const existing = await ctx.db
        .query("staffShifts")
        .withIndex("by_organization_time", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .gte("startTime", targetWeekStart)
            .lt("startTime", weekEnd),
        )
        .collect();

      for (const shift of existing) {
        if (shift.sourceModelSlotId) {
          await ctx.db.delete(shift._id);
        }
      }

      for (const slot of modelSlots) {
        // Convert dayOfWeek (0=Sun…6=Sat) to Mon-first offset (0=Mon…6=Sun)
        const dayOffset = (slot.dayOfWeek + 6) % 7;
        const dayStart = targetWeekStart + dayOffset * 24 * 60 * 60 * 1000;
        const startTime = dayStart + slot.startTimeMinutes * 60 * 1000;
        const endTime = dayStart + slot.endTimeMinutes * 60 * 1000;

        await ctx.db.insert("staffShifts", {
          organizationId: membership.organizationId,
          userId: slot.userId,
          startTime,
          endTime,
          status: "scheduled",
          sourceModelSlotId: slot._id,
          notes: slot.notes,
          createdBy: identity.subject,
          createdAt: now,
          updatedAt: now,
        });
        createdCount += 1;
      }
    }

    return {
      createdShifts: createdCount,
      weeksApplied: args.targetWeekStarts.length,
    };
  },
});
