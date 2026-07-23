import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUserRecord,
  isStaffRole,
  requireAdmin,
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

async function cancelMemberPlanSubscriptions(
  ctx: any,
  organizationId: any,
  userId: string,
  now: number,
  revokedBy: string,
) {
  const subscriptions = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization_user", (q: any) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .collect();

  const cancellableSubscriptions = subscriptions.filter(
    (subscription: any) =>
      subscription.status === "active" || subscription.status === "suspended",
  );

  for (const subscription of cancellableSubscriptions) {
    await ctx.db.patch(subscription._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q: any) =>
        q.eq("subscriptionId", subscription._id).eq("status", "active"),
      )
      .first();

    if (activeBonification) {
      await ctx.db.patch(activeBonification._id, {
        status: "revoked",
        revokedAt: now,
        revokedBy,
        revokeReason: "Miembro inactivado",
        updatedAt: now,
      });
    }
  }

  return cancellableSubscriptions.length;
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
    const currentOrganizationId = currentMembership.organizationId;
    const isPrivilegedRole = isStaffRole(currentMembership.role);
    if (!isPrivilegedRole) {
      // Members should not be able to list all organization users.
      return [];
    }
    const { user } = await getCurrentUserRecord(ctx);
    const requestedOrganizationId =
      args.organizationId ?? currentOrganizationId;

    if (
      user?.isSuperAdmin !== true &&
      args.organizationId &&
      args.organizationId !== currentOrganizationId
    ) {
      // Stale client org context (e.g. fast org switch); avoid cross-org flashes.
      return [];
    }

    // Get all memberships for this organization
    const membershipsQuery = ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", requestedOrganizationId),
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
          usesPlanification: membership.usesPlanification,
          responsibleUserId: membership.responsibleUserId,
          payrollType: membership.payrollType,
          pricePerHour: membership.pricePerHour,
          pricePerClass: membership.pricePerClass,
          pricePerMonth: membership.pricePerMonth,
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
          birthday: user?.birthday,
          phone: user?.phone,
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (user?.isSuperAdmin === true) {
      const organizations = await ctx.db.query("organizations").collect();
      const orgs = await Promise.all(
        organizations.map(async (organization) => {
          const resolvedLogoUrl = await resolveLogoUrl(
            ctx,
            organization.logoStorageId,
            organization.logoUrl,
          );
          return {
            organizationId: organization._id,
            organizationName: organization.name,
            organizationSlug: organization.slug,
            organizationLogoUrl: resolvedLogoUrl,
            role: "admin" as const,
            status: "active" as const,
          };
        }),
      );

      return orgs.sort((a, b) =>
        (a.organizationName ?? "").localeCompare(b.organizationName ?? ""),
      );
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const staffMemberships = memberships.filter((membership) =>
      isStaffRole(membership.role),
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

    const now = Date.now();
    const cancelledSubscriptions = await cancelMemberPlanSubscriptions(
      ctx,
      organizationId,
      args.userId,
      now,
      identity.subject,
    );

    await ctx.db.patch(targetMembership._id, {
      status: "inactive",
      inactivatedAt: now,
      updatedAt: now,
    });

    return { updated: true, cancelledSubscriptions };
  },
});

export const removeMemberFromOrganizationInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.userId))
      .first();

    if (user?.activeOrganizationId === args.organizationId) {
      const fallbackMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      await ctx.db.patch(user._id, {
        activeOrganizationId: fallbackMembership?.organizationId,
        updatedAt: Date.now(),
      });
    }

    return { removed: memberships.length };
  },
});

export const setActiveOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const { identity, user } = await getCurrentUserRecord(ctx);

    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership =
      user?.isSuperAdmin === true
        ? { allowed: true }
        : await ctx.db
            .query("organizationMemberships")
            .withIndex("by_organization_user", (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("userId", identity.subject),
            )
            .filter((q) => q.eq(q.field("status"), "active"))
            .first();

    if (!membership) {
      throw new Error("Access denied: not a member of this organization");
    }

    const now = Date.now();
    const existingUser = user;

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
      isSuperAdmin: false,
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
    const identity = await requireAuth(ctx);
    const now = Date.now();
    const cancelledSubscriptions = await cancelMemberPlanSubscriptions(
      ctx,
      organizationId,
      args.userId,
      now,
      identity.subject,
    );

    if (targetMembership.status === "active") {
      await ctx.db.patch(targetMembership._id, {
        status: "inactive",
        inactivatedAt: now,
        updatedAt: now,
      });
    }

    return {
      updated: targetMembership.status === "active",
      cancelledSubscriptions,
    };
  },
});

/**
 * Set a member as active in the current organization.
 * Admin/trainer only.
 */
export const setMemberActive = mutation({
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
      throw new Error("Only members can be set as active");
    }
    if (targetMembership.status === "active") {
      return { updated: false };
    }

    // Reactivating a previously-inactive member counts as a fresh "alta": we
    // record `reactivatedAt` while preserving the original `joinedAt`, and clear
    // `inactivatedAt` so the member reads as currently active.
    const now = Date.now();
    await ctx.db.patch(targetMembership._id, {
      status: "active",
      reactivatedAt: now,
      lastActiveAt: now,
      inactivatedAt: undefined,
      updatedAt: now,
    });

    return { updated: true };
  },
});

/**
 * Configure whether a member should be included in planification tracking.
 * Admin/trainer only. Missing values are treated as true by clients.
 */
export const setMemberUsesPlanification = mutation({
  args: {
    userId: v.string(),
    usesPlanification: v.boolean(),
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
      throw new Error("Only members can be configured for planification usage");
    }

    await ctx.db.patch(targetMembership._id, {
      usesPlanification: args.usesPlanification,
      updatedAt: Date.now(),
    });

    return { updated: true };
  },
});

/**
 * Assign (or clear) the staff member responsible for a member's planification.
 * Staff-level action. Pass responsibleUserId: null to clear.
 */
export const setMemberResponsible = mutation({
  args: {
    userId: v.string(),
    responsibleUserId: v.union(v.string(), v.null()),
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
      throw new Error("Only members can have a responsible staff member");
    }

    if (args.responsibleUserId) {
      const responsibleMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("userId", args.responsibleUserId!),
        )
        .first();

      if (
        !responsibleMembership ||
        !isStaffRole(responsibleMembership.role) ||
        responsibleMembership.status !== "active"
      ) {
        throw new Error("Responsible must be an active staff member");
      }
    }

    await ctx.db.patch(targetMembership._id, {
      responsibleUserId: args.responsibleUserId ?? undefined,
      updatedAt: Date.now(),
    });

    return { updated: true };
  },
});

/**
 * Update payroll rates for a staff member (admin only).
 * Pass a rate to set it, or null to clear it. Omit to leave unchanged.
 */
export const updateStaffCompensation = mutation({
  args: {
    userId: v.string(),
    payrollType: v.optional(
      v.union(v.literal("hourly"), v.literal("monthly")),
    ),
    pricePerHour: v.optional(v.union(v.number(), v.null())),
    pricePerClass: v.optional(v.union(v.number(), v.null())),
    pricePerMonth: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    await requireAdmin(ctx, organizationId);

    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", args.userId),
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of the current organization");
    }
    if (!isStaffRole(targetMembership.role)) {
      throw new Error("Only staff members have payroll rates");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.payrollType !== undefined) {
      patch.payrollType = args.payrollType;
    }
    if (args.pricePerHour !== undefined) {
      patch.pricePerHour = args.pricePerHour ?? undefined;
    }
    if (args.pricePerClass !== undefined) {
      patch.pricePerClass = args.pricePerClass ?? undefined;
    }
    if (args.pricePerMonth !== undefined) {
      patch.pricePerMonth = args.pricePerMonth ?? undefined;
    }

    await ctx.db.patch(targetMembership._id, patch);

    return { updated: true };
  },
});
