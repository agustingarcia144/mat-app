import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert a user from Clerk webhook data
 * This is an internal mutation (only callable from other Convex functions)
 */
export const upsertFromClerk = internalMutation({
  args: {
    data: v.any(), // Clerk user data from webhook
  },
  handler: async (ctx, args) => {
    const clerkUser = args.data;
    const clerkUserId = clerkUser.id;

    if (!clerkUserId) {
      throw new Error("Missing user ID in Clerk webhook data");
    }

    // Find existing user by Clerk ID
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", clerkUserId))
      .first();

    const now = Date.now();
    const createdAt = clerkUser.created_at
      ? new Date(clerkUser.created_at).getTime()
      : now;
    const updatedAt = clerkUser.updated_at
      ? new Date(clerkUser.updated_at).getTime()
      : now;

    const userData = {
      externalId: clerkUserId,
      birthday: clerkUser.public_metadata?.birthday || undefined,
      createdAt: existing?.createdAt || createdAt,
      updatedAt,
    };

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, userData);
      return existing._id;
    } else {
      // Create new user
      return await ctx.db.insert("users", userData);
    }
  },
});

/**
 * Delete a user from Clerk webhook data
 */
export const deleteFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.clerkUserId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
