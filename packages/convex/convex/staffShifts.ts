import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdmin,
  requireAdminOrTrainer,
  requireAuth,
  requireCurrentOrganizationMembership,
} from "./permissions";

export const getByOrganizationAndDateRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    return await ctx.db
      .query("staffShifts")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate),
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    userId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    if (args.endTime <= args.startTime) {
      throw new Error("El horario de fin debe ser posterior al de inicio.");
    }

    const now = Date.now();
    return await ctx.db.insert("staffShifts", {
      organizationId: membership.organizationId,
      userId: args.userId,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled",
      notes: args.notes,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("staffShifts"),
    userId: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("scheduled"), v.literal("cancelled")),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const shift = await ctx.db.get(args.id);
    if (!shift || shift.organizationId !== membership.organizationId) {
      throw new Error("Shift not found");
    }

    const { id, ...fields } = args;
    const start = fields.startTime ?? shift.startTime;
    const end = fields.endTime ?? shift.endTime;
    if (end <= start) {
      throw new Error("El horario de fin debe ser posterior al de inicio.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.userId !== undefined) patch.userId = fields.userId;
    if (fields.startTime !== undefined) patch.startTime = fields.startTime;
    if (fields.endTime !== undefined) patch.endTime = fields.endTime;
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("staffShifts") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const shift = await ctx.db.get(args.id);
    if (!shift || shift.organizationId !== membership.organizationId) {
      throw new Error("Shift not found");
    }

    await ctx.db.delete(args.id);
  },
});
