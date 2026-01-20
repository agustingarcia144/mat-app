import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert an organization membership from Clerk webhook data
 */
export const upsertFromClerk = internalMutation({
  args: {
    data: v.any(), // Clerk organizationMembership data from webhook
  },
  handler: async (ctx, args) => {
    const clerkMembership = args.data;
    const clerkOrgId = clerkMembership.organization_id;
    const clerkUserId = clerkMembership.public_user_data?.user_id || clerkMembership.user_id;

    if (!clerkOrgId || !clerkUserId) {
      throw new Error(
        "Missing organization ID or user ID in Clerk webhook data"
      );
    }

    // Find the organization by Clerk ID
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_externalId", (q) => q.eq("externalId", clerkOrgId))
      .first();

    if (!organization) {
      // Organization might not be synced yet - log and skip
      console.warn(
        `Organization ${clerkOrgId} not found when syncing membership`
      );
      return;
    }

    // Map Clerk role to our role system
    // Clerk roles: "org:admin", "org:member", or custom roles
    // We map: "org:admin" -> "owner", custom roles -> check, default -> "member"
    let role: "owner" | "trainer" | "member" = "member";
    const clerkRole = clerkMembership.role || "";
    
    if (clerkRole === "org:admin" || clerkRole.toLowerCase().includes("admin")) {
      role = "owner";
    } else if (
      clerkRole.toLowerCase().includes("trainer") ||
      clerkRole.toLowerCase().includes("instructor") ||
      clerkRole.toLowerCase().includes("teacher")
    ) {
      role = "trainer";
    } else {
      role = "member";
    }

    // Check if membership already exists with this specific role
    // Note: A user can have multiple memberships in the same org with different roles
    const existing = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", clerkUserId)
      )
      .filter((q) => q.eq(q.field("role"), role))
      .first();

    const now = Date.now();
    const createdAt = clerkMembership.created_at
      ? new Date(clerkMembership.created_at).getTime()
      : now;
    const updatedAt = clerkMembership.updated_at
      ? new Date(clerkMembership.updated_at).getTime()
      : now;

    // Determine status - Clerk doesn't have explicit status, so we'll use active by default
    // You can customize this based on your needs
    const status: "active" | "inactive" | "suspended" = "active";

    const membershipData = {
      organizationId: organization._id,
      userId: clerkUserId,
      role,
      status,
      joinedAt: existing?.joinedAt || createdAt,
      lastActiveAt: updatedAt,
      createdAt: existing?.createdAt || createdAt,
      updatedAt,
    };

    if (existing) {
      // Update existing membership
      await ctx.db.patch(existing._id, membershipData);
      return existing._id;
    } else {
      // Create new membership
      return await ctx.db.insert("organizationMemberships", membershipData);
    }
  },
});

/**
 * Delete an organization membership from Clerk webhook data
 */
export const deleteFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the organization
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.clerkOrgId))
      .first();

    if (!organization) {
      return; // Organization doesn't exist, nothing to delete
    }

    // Find all memberships for this user in this org
    // (user might have multiple roles)
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", args.clerkUserId)
      )
      .collect();

    // Delete all memberships
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }
  },
});
