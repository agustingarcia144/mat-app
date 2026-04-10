import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdminOrTrainer,
  requireAuth,
  requireCurrentOrganizationMembership,
} from "./permissions";

async function resolveLogoUrl(
  ctx: any,
  logoStorageId: unknown,
  logoUrl: string | undefined,
) {
  if (logoStorageId) {
    try {
      const storageUrl = await ctx.storage.getUrl(logoStorageId);
      if (storageUrl) return storageUrl;
    } catch {
      // Fall through to legacy URL when storage reference is stale/invalid.
    }
  }
  return logoUrl ?? null;
}

/**
 * Get all memberships for the current user's organization
 * Returns all members of the organization the current user belongs to
 */
export const getOrganizationMemberships = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    const isPrivilegedRole =
      currentMembership.role === "admin" ||
      currentMembership.role === "trainer";
    if (!isPrivilegedRole) {
      // Members should not be able to list all organization users.
      return [];
    }
    if (args.organizationId && args.organizationId !== organizationId) {
      // Stale client org context (e.g. fast org switch); avoid cross-org flashes.
      return [];
    }

    // Get all memberships for this organization
    const membershipsQuery = ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      );

    const allMemberships = args.includeInactive
      ? await membershipsQuery.collect()
      : await membershipsQuery
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect();

    // Fetch user data for each membership
    const membershipsWithUsers = await Promise.all(
      allMemberships.map(async (membership) => {
        // Find the user by auth external id.
        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) =>
            q.eq("externalId", membership.userId),
          )
          .first();

        return {
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          joinedAt: membership.joinedAt,
          updatedAt: membership.updatedAt,
          lastActiveAt: membership.lastActiveAt,
          // Include user fields if user exists
          firstName: user?.firstName,
          lastName: user?.lastName,
          fullName: user?.fullName,
          email: user?.email,
          imageUrl: user?.imageUrl,
          username: user?.username,
        };
      }),
    );

    return membershipsWithUsers;
  },
});

export const getCurrentMembership = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireCurrentOrganizationMembership(ctx);
    } catch {
      return null;
    }
  },
});

export const getCurrentMembershipWithOrganization = query({
  args: {},
  handler: async (ctx) => {
    try {
      const membership = await requireCurrentOrganizationMembership(ctx);
      const organization = await ctx.db.get(membership.organizationId);
      if (!organization) {
        return null;
      }
      const resolvedLogoUrl = await resolveLogoUrl(
        ctx,
        organization.logoStorageId,
        organization.logoUrl,
      );
      return {
        ...membership,
        organization: {
          _id: organization._id,
          name: organization.name,
          slug: organization.slug,
          logoUrl: resolvedLogoUrl,
        },
      };
    } catch {
      return null;
    }
  },
});

export const getMyOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const orgs = await Promise.all(
      memberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId);
        const resolvedLogoUrl = organization
          ? await resolveLogoUrl(
              ctx,
              organization.logoStorageId,
              organization.logoUrl,
            )
          : null;
        return {
          organizationId: membership.organizationId,
          organizationName: organization?.name,
          organizationSlug: organization?.slug,
          organizationLogoUrl: resolvedLogoUrl,
          role: membership.role,
          status: membership.status,
        };
      }),
    );

    return orgs.sort((a, b) =>
      (a.organizationName ?? "").localeCompare(b.organizationName ?? ""),
    );
  },
});

export const getMyStaffOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const staffMemberships = memberships.filter(
      (membership) =>
        membership.role === "admin" || membership.role === "trainer",
    );

    const orgs = await Promise.all(
      staffMemberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId);
        const resolvedLogoUrl = organization
          ? await resolveLogoUrl(
              ctx,
              organization.logoStorageId,
              organization.logoUrl,
            )
          : null;
        return {
          organizationId: membership.organizationId,
          organizationName: organization?.name,
          organizationSlug: organization?.slug,
          organizationLogoUrl: resolvedLogoUrl,
          role: membership.role,
          status: membership.status,
        };
      }),
    );

    return orgs.sort((a, b) =>
      (a.organizationName ?? "").localeCompare(b.organizationName ?? ""),
    );
  },
});

export const removeMember = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    await requireAdminOrTrainer(ctx, organizationId);

    const identity = await requireAuth(ctx);
    if (args.userId === identity.subject) {
      throw new Error("You cannot remove yourself from the organization");
    }

    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!targetMembership) {
      throw new Error(
        "User is not an active member of the current organization",
      );
    }

    await ctx.db.patch(targetMembership._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return { updated: true };
  },
});

export const setActiveOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", identity.subject),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Access denied: not a member of this organization");
    }

    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        activeOrganizationId: args.organizationId,
        updatedAt: now,
      });
      return true;
    }

    await ctx.db.insert("users", {
      externalId: identity.subject,
      firstName: identity.givenName || undefined,
      lastName: identity.familyName || undefined,
      fullName: identity.name || undefined,
      email: identity.email || undefined,
      imageUrl: identity.pictureUrl || undefined,
      username: identity.nickname || undefined,
      onboardingCompleted: false,
      activeOrganizationId: args.organizationId,
      createdAt: now,
      updatedAt: now,
    });

    return true;
  },
});

/**
 * Set a member as inactive in the current organization.
 * Admin/trainer only.
 */
export const setMemberInactive = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    await requireAdminOrTrainer(ctx, organizationId);

    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", args.userId),
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of the current organization");
    }
    if (targetMembership.role !== "member") {
      throw new Error("Only members can be set as inactive");
    }
    if (targetMembership.status === "inactive") {
      return { updated: false };
    }

    await ctx.db.patch(targetMembership._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return { updated: true };
  },
});
