import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const CLERK_API_BASE = "https://api.clerk.com/v1";

/**
 * Removes all Convex data tied to a Clerk user id (idempotent).
 * Used by user.deleted webhooks, migrations, and in-app account deletion.
 */
export const purgeUserDataForClerkId = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = args;
    const now = Date.now();

    const sessions = await ctx.db
      .query("workoutDaySessions")
      .withIndex("by_user_performedOn", (q) => q.eq("userId", clerkUserId))
      .collect();

    for (const session of sessions) {
      const logs = await ctx.db
        .query("sessionExerciseLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
      await ctx.db.delete(session._id);
    }

    const assignments = await ctx.db
      .query("planificationAssignments")
      .withIndex("by_user", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of assignments) {
      await ctx.db.delete(row._id);
    }

    const reservations = await ctx.db
      .query("classReservations")
      .withIndex("by_user", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of reservations) {
      await ctx.db.delete(row._id);
    }

    const slots = await ctx.db
      .query("fixedClassSlots")
      .withIndex("by_user", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of slots) {
      await ctx.db.delete(row._id);
    }

    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of tokens) {
      await ctx.db.delete(row._id);
    }

    const notifications = await ctx.db
      .query("notificationEvents")
      .withIndex("by_user_created_at", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of notifications) {
      await ctx.db.delete(row._id);
    }

    const joinRequests = await ctx.db
      .query("organizationJoinRequests")
      .filter((q) => q.eq(q.field("userId"), clerkUserId))
      .collect();
    for (const row of joinRequests) {
      await ctx.db.delete(row._id);
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const row of memberships) {
      await ctx.db.delete(row._id);
    }

    const trainedClasses = await ctx.db
      .query("classes")
      .withIndex("by_trainer", (q) => q.eq("trainerId", clerkUserId))
      .collect();
    for (const cls of trainedClasses) {
      await ctx.db.patch(cls._id, {
        trainerId: undefined,
        updatedAt: now,
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", clerkUserId))
      .first();
    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

/**
 * Purges Convex data for the signed-in user, then deletes the Clerk user.
 */
export const deleteMyAccount = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkUserId = identity.subject;

    await ctx.runMutation(internal.userDeletion.purgeUserDataForClerkId, {
      clerkUserId,
    });

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new Error("Missing CLERK_SECRET_KEY");
    }

    const res = await fetch(`${CLERK_API_BASE}/users/${clerkUserId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Clerk user deletion failed: ${res.status} ${text}`);
    }

    return { ok: true };
  },
});
