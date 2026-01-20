import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert an organization (gym) from Clerk webhook data
 */
export const upsertFromClerk = internalMutation({
  args: {
    data: v.any(), // Clerk organization data from webhook
  },
  handler: async (ctx, args) => {
    const clerkOrg = args.data;
    const clerkOrgId = clerkOrg.id;

    if (!clerkOrgId) {
      throw new Error("Missing organization ID in Clerk webhook data");
    }

    // Find existing organization by Clerk ID
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_externalId", (q) => q.eq("externalId", clerkOrgId))
      .first();

    const now = Date.now();
    const createdAt = clerkOrg.created_at
      ? new Date(clerkOrg.created_at).getTime()
      : now;
    const updatedAt = clerkOrg.updated_at
      ? new Date(clerkOrg.updated_at).getTime()
      : now;

    // Generate slug from name if not provided
    const slug =
      clerkOrg.slug ||
      clerkOrg.name
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") ||
      `org-${clerkOrgId}`;

    const orgData = {
      externalId: clerkOrgId,
      name: clerkOrg.name || "Unnamed Organization",
      slug,
      address: clerkOrg.public_metadata?.address || undefined,
      phone: clerkOrg.public_metadata?.phone || undefined,
      email: clerkOrg.public_metadata?.email || undefined,
      logoUrl: clerkOrg.image_url || clerkOrg.logo_url || undefined,
      createdAt: existing?.createdAt || createdAt,
      updatedAt,
    };

    if (existing) {
      // Update existing organization
      await ctx.db.patch(existing._id, orgData);
      return existing._id;
    } else {
      // Create new organization
      return await ctx.db.insert("organizations", orgData);
    }
  },
});

/**
 * Delete an organization from Clerk webhook data
 */
export const deleteFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.clerkOrgId))
      .first();

    if (existing) {
      // Delete the organization
      // Note: You may want to also delete or update related memberships
      // For now, we'll just delete the org - you can add cascade logic if needed
      await ctx.db.delete(existing._id);
    }
  },
});
