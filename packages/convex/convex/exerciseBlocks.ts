import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAuth,
  requireAdminOrTrainer,
  requireOrganizationMembership,
} from "./permissions";
import { resolveRevisionIdForPlanification } from "./planificationRevisionHelpers";

/**
 * Create a new exercise block
 */
export const create = mutation({
  args: {
    workoutDayId: v.id("workoutDays"),
    name: v.string(),
    order: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const now = Date.now();
    const workoutDay = await ctx.db.get(args.workoutDayId);
    if (!workoutDay) {
      throw new Error("Workout day not found");
    }
    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) {
      throw new Error("Planification not found");
    }
    await requireAdminOrTrainer(ctx, planification.organizationId);

    return await ctx.db.insert("exerciseBlocks", {
      workoutDayId: args.workoutDayId,
      revisionId: workoutDay.revisionId,
      name: args.name,
      order: args.order,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an exercise block
 */
export const update = mutation({
  args: {
    id: v.id("exerciseBlocks"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const block = await ctx.db.get(args.id);
    if (!block) {
      throw new Error("Exercise block not found");
    }
    const workoutDay = await ctx.db.get(block.workoutDayId);
    if (!workoutDay) {
      throw new Error("Workout day not found");
    }
    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) {
      throw new Error("Planification not found");
    }
    await requireAdminOrTrainer(ctx, planification.organizationId);

    const { id, ...updates } = args;

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reorder exercise blocks within a workout day
 */
export const reorder = mutation({
  args: {
    workoutDayId: v.id("workoutDays"),
    blockIds: v.array(v.id("exerciseBlocks")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const workoutDay = await ctx.db.get(args.workoutDayId);
    if (!workoutDay) {
      throw new Error("Workout day not found");
    }
    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) {
      throw new Error("Planification not found");
    }
    await requireAdminOrTrainer(ctx, planification.organizationId);

    // Verify all blocks belong to the workout day
    for (const blockId of args.blockIds) {
      const block = await ctx.db.get(blockId);
      if (!block || block.workoutDayId !== args.workoutDayId) {
        throw new Error(
          "Invalid block ID or block does not belong to workout day",
        );
      }
    }

    // Update order for each block
    for (let i = 0; i < args.blockIds.length; i++) {
      await ctx.db.patch(args.blockIds[i], {
        order: i,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Delete an exercise block
 * Note: This will fail if the block has exercises. Exercises must be moved or deleted first.
 */
export const remove = mutation({
  args: {
    id: v.id("exerciseBlocks"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const block = await ctx.db.get(args.id);
    if (!block) {
      throw new Error("Exercise block not found");
    }
    const workoutDay = await ctx.db.get(block.workoutDayId);
    if (!workoutDay) {
      throw new Error("Workout day not found");
    }
    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) {
      throw new Error("Planification not found");
    }
    await requireAdminOrTrainer(ctx, planification.organizationId);

    // Check if block has any exercises
    const exercises = await ctx.db
      .query("dayExercises")
      .withIndex("by_block", (q) => q.eq("blockId", args.id))
      .first();

    if (exercises) {
      throw new Error(
        "Cannot delete block that contains exercises. Move or delete exercises first.",
      );
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Get exercise blocks for a workout day
 */
export const getByWorkoutDay = query({
  args: {
    workoutDayId: v.id("workoutDays"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const workoutDay = await ctx.db.get(args.workoutDayId);
    if (!workoutDay) return [];
    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) return [];
    await requireOrganizationMembership(ctx, planification.organizationId);

    return await ctx.db
      .query("exerciseBlocks")
      .withIndex("by_workout_day", (q) =>
        q.eq("workoutDayId", args.workoutDayId),
      )
      .order("asc")
      .collect();
  },
});

/**
 * Get all exercise blocks for all workout days of a planification
 */
export const getByPlanification = query({
  args: {
    planificationId: v.id("planifications"),
    revisionId: v.optional(v.id("planificationRevisions")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const planification = await ctx.db.get(args.planificationId);
    if (!planification) return [];
    await requireOrganizationMembership(ctx, planification.organizationId);

    const revisionId = await resolveRevisionIdForPlanification(
      ctx,
      args.planificationId,
      args.revisionId,
    );
    let workoutDays = revisionId
      ? await ctx.db
          .query("workoutDays")
          .withIndex("by_planification_revision", (q) =>
            q
              .eq("planificationId", args.planificationId)
              .eq("revisionId", revisionId),
          )
          .collect()
      : await ctx.db
          .query("workoutDays")
          .withIndex("by_planification", (q) =>
            q.eq("planificationId", args.planificationId),
          )
          .collect();
    if (revisionId && workoutDays.length === 0) {
      workoutDays = await ctx.db
        .query("workoutDays")
        .withIndex("by_planification", (q) =>
          q.eq("planificationId", args.planificationId),
        )
        .collect();
    }

    const blocks: Doc<"exerciseBlocks">[] = [];
    for (const day of workoutDays) {
      const dayBlocks = await ctx.db
        .query("exerciseBlocks")
        .withIndex("by_workout_day_order", (q) => q.eq("workoutDayId", day._id))
        .order("asc")
        .collect();
      blocks.push(...dayBlocks);
    }
    return blocks;
  },
});

/**
 * Get exercise block by ID
 */
export const getById = query({
  args: {
    id: v.id("exerciseBlocks"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const block = await ctx.db.get(args.id);
    if (!block) return null;

    const workoutDay = await ctx.db.get(block.workoutDayId);
    if (!workoutDay) return null;

    const planification = await ctx.db.get(workoutDay.planificationId);
    if (!planification) return null;

    await requireOrganizationMembership(ctx, planification.organizationId);
    return block;
  },
});
