import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  isStaffRole,
  requireAuth,
  requireAdmin,
  requireCurrentOrganizationMembership,
  requireActiveOrgContext,
} from "./permissions";

/**
 * List plans for the organization.
 * Members see only active plans; admins/trainers see all.
 */
export const getByOrganization = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireActiveOrgContext(ctx);

    const plans = await ctx.db
      .query("membershipPlans")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();

    const isAdmin = isStaffRole(membership.role);

    const visiblePlans = plans.filter((p) => p.deletedAt === undefined);

    // Members can only see active plans that are not hidden from
    // self-assignment. Hidden plans stay assignable by admins/trainers.
    if (!isAdmin) {
      return visiblePlans.filter(
        (p) => p.isActive && !p.hiddenFromSelfAssignment,
      );
    }

    if (args.activeOnly) {
      return visiblePlans.filter((p) => p.isActive);
    }

    return visiblePlans;
  },
});

/**
 * Get a single plan by ID.
 */
export const getById = query({
  args: {
    planId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined
    ) {
      return null;
    }

    return plan;
  },
});

/**
 * Create a new membership plan (admin only).
 */
const interestTierV = v.object({
  daysAfterWindowEnd: v.number(),
  type: v.union(v.literal("percentage"), v.literal("fixed")),
  value: v.number(),
});

const advancePaymentDiscountV = v.object({
  months: v.number(),
  discountPercentage: v.number(),
});

const billingModeV = v.union(v.literal("calendar"), v.literal("join_date"));

/**
 * Validate that every selected class belongs to the organization and drop
 * duplicates. An empty selection means "all classes", stored as undefined.
 */
async function normalizeAllowedClassIds(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  allowedClassIds: Id<"classes">[] | undefined,
): Promise<Id<"classes">[] | undefined> {
  if (!allowedClassIds || allowedClassIds.length === 0) return undefined;

  const unique = Array.from(new Set(allowedClassIds));
  for (const classId of unique) {
    const classTemplate = await ctx.db.get(classId);
    if (!classTemplate || classTemplate.organizationId !== organizationId) {
      throw new Error(
        "Una de las clases seleccionadas no pertenece a esta organización",
      );
    }
  }

  return unique;
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    isFamilyPlan: v.optional(v.boolean()),
    billingMode: v.optional(billingModeV),
    priceArs: v.number(),
    weeklyClassLimit: v.number(),
    paymentWindowStartDay: v.number(),
    paymentWindowEndDay: v.number(),
    interestTiers: v.optional(v.array(interestTierV)),
    advancePaymentDiscounts: v.optional(v.array(advancePaymentDiscountV)),
    classesEnabled: v.optional(v.boolean()),
    allowedClassIds: v.optional(v.array(v.id("classes"))),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    validatePlanFields(args);

    const classesEnabled = args.classesEnabled ?? true;
    const allowedClassIds = classesEnabled
      ? await normalizeAllowedClassIds(
          ctx,
          membership.organizationId,
          args.allowedClassIds,
        )
      : undefined;

    const now = Date.now();
    return await ctx.db.insert("membershipPlans", {
      organizationId: membership.organizationId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      isFamilyPlan: args.isFamilyPlan ?? false,
      billingMode: args.billingMode ?? "calendar",
      priceArs: args.priceArs,
      weeklyClassLimit: args.weeklyClassLimit,
      paymentWindowStartDay: args.paymentWindowStartDay,
      paymentWindowEndDay: args.paymentWindowEndDay,
      interestTiers: args.interestTiers?.length
        ? args.interestTiers
        : undefined,
      advancePaymentDiscounts: args.advancePaymentDiscounts?.length
        ? args.advancePaymentDiscounts
        : undefined,
      classesEnabled,
      allowedClassIds,
      isActive: true,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing membership plan (admin only).
 */
export const update = mutation({
  args: {
    planId: v.id("membershipPlans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isFamilyPlan: v.optional(v.boolean()),
    billingMode: v.optional(billingModeV),
    priceArs: v.optional(v.number()),
    weeklyClassLimit: v.optional(v.number()),
    paymentWindowStartDay: v.optional(v.number()),
    paymentWindowEndDay: v.optional(v.number()),
    interestTiers: v.optional(v.array(interestTierV)),
    advancePaymentDiscounts: v.optional(v.array(advancePaymentDiscountV)),
    classesEnabled: v.optional(v.boolean()),
    allowedClassIds: v.optional(v.array(v.id("classes"))),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined
    ) {
      throw new Error("Plan no encontrado");
    }

    const merged = {
      name: args.name ?? plan.name,
      description: args.description ?? plan.description,
      isFamilyPlan: args.isFamilyPlan ?? plan.isFamilyPlan ?? false,
      billingMode: args.billingMode ?? plan.billingMode ?? "calendar",
      priceArs: args.priceArs ?? plan.priceArs,
      weeklyClassLimit: args.weeklyClassLimit ?? plan.weeklyClassLimit,
      paymentWindowStartDay:
        args.paymentWindowStartDay ?? plan.paymentWindowStartDay,
      paymentWindowEndDay: args.paymentWindowEndDay ?? plan.paymentWindowEndDay,
    };

    validatePlanFields(merged);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined;
    if (args.isFamilyPlan !== undefined) patch.isFamilyPlan = args.isFamilyPlan;
    if (args.billingMode !== undefined) patch.billingMode = args.billingMode;
    if (args.priceArs !== undefined) patch.priceArs = args.priceArs;
    if (args.weeklyClassLimit !== undefined)
      patch.weeklyClassLimit = args.weeklyClassLimit;
    if (args.paymentWindowStartDay !== undefined)
      patch.paymentWindowStartDay = args.paymentWindowStartDay;
    if (args.paymentWindowEndDay !== undefined)
      patch.paymentWindowEndDay = args.paymentWindowEndDay;
    if (args.interestTiers !== undefined)
      patch.interestTiers = args.interestTiers.length
        ? args.interestTiers
        : undefined;
    if (args.advancePaymentDiscounts !== undefined)
      patch.advancePaymentDiscounts = args.advancePaymentDiscounts.length
        ? args.advancePaymentDiscounts
        : undefined;
    if (args.classesEnabled !== undefined)
      patch.classesEnabled = args.classesEnabled;

    // A plan without class access keeps no class selection
    const classesEnabled = args.classesEnabled ?? plan.classesEnabled ?? true;
    if (!classesEnabled) {
      patch.allowedClassIds = undefined;
    } else if (args.allowedClassIds !== undefined) {
      patch.allowedClassIds = await normalizeAllowedClassIds(
        ctx,
        membership.organizationId,
        args.allowedClassIds,
      );
    }

    await ctx.db.patch(args.planId, patch);
  },
});

/**
 * Toggle a plan's active status (admin only).
 */
export const toggleActive = mutation({
  args: {
    planId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined
    ) {
      throw new Error("Plan no encontrado");
    }

    await ctx.db.patch(args.planId, {
      isActive: !plan.isActive,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Toggle whether a plan is hidden from self-assignment in the mobile app.
 * The plan stays active; hiding only removes it from the member-facing
 * plan selector. Admins can still assign hidden plans manually.
 */
export const toggleVisibility = mutation({
  args: {
    planId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined
    ) {
      throw new Error("Plan no encontrado");
    }

    await ctx.db.patch(args.planId, {
      hiddenFromSelfAssignment: !plan.hiddenFromSelfAssignment,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Soft-delete a membership plan and unassign every member currently on it.
 */
export const softDelete = mutation({
  args: {
    planId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined
    ) {
      throw new Error("Plan no encontrado");
    }

    const now = Date.now();
    const subscriptions = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();

    const activeSubscriptions = subscriptions.filter(
      (subscription) =>
        subscription.planId === args.planId &&
        subscription.status !== "cancelled",
    );

    for (const subscription of activeSubscriptions) {
      await ctx.db.patch(subscription._id, {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      });

      const activeBonification = await ctx.db
        .query("planBonifications")
        .withIndex("by_subscription_status", (q) =>
          q.eq("subscriptionId", subscription._id).eq("status", "active"),
        )
        .first();

      if (activeBonification) {
        await ctx.db.patch(activeBonification._id, {
          status: "revoked",
          revokedAt: now,
          revokedBy: identity.subject,
          revokeReason: "Plan eliminado",
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.planId, {
      isActive: false,
      deletedAt: now,
      deletedBy: identity.subject,
      updatedAt: now,
    });

    return { unassignedCount: activeSubscriptions.length };
  },
});

function validatePlanFields(fields: {
  name?: string;
  priceArs?: number;
  weeklyClassLimit?: number;
  paymentWindowStartDay?: number;
  paymentWindowEndDay?: number;
}) {
  if (fields.name !== undefined && fields.name.trim().length === 0) {
    throw new Error("El nombre es requerido");
  }
  if (fields.priceArs !== undefined && fields.priceArs < 1) {
    throw new Error("El precio debe ser al menos $1");
  }
  if (fields.weeklyClassLimit !== undefined && fields.weeklyClassLimit < 1) {
    throw new Error("El límite semanal debe ser al menos 1");
  }
  if (fields.paymentWindowStartDay !== undefined) {
    if (fields.paymentWindowStartDay < 1 || fields.paymentWindowStartDay > 28) {
      throw new Error("El día de apertura debe ser entre 1 y 28");
    }
  }
  if (fields.paymentWindowEndDay !== undefined) {
    if (fields.paymentWindowEndDay < 1 || fields.paymentWindowEndDay > 28) {
      throw new Error("El día de cierre debe ser entre 1 y 28");
    }
  }
  if (
    fields.paymentWindowStartDay !== undefined &&
    fields.paymentWindowEndDay !== undefined &&
    fields.paymentWindowEndDay < fields.paymentWindowStartDay
  ) {
    throw new Error(
      "El día de cierre debe ser igual o posterior al día de apertura",
    );
  }
}
