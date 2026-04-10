import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireActiveOrgContext,
  tryActiveOrgContext,
} from "./permissions";

/**
 * Get the current user's active or suspended subscription (if any).
 * Returns the subscription enriched with plan details.
 */
export const getMySubscription = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return null;

    const plan = await ctx.db.get(subscription.planId);
    return { ...subscription, plan };
  },
});

/**
 * List all subscriptions in the org (admin/trainer only).
 * Enriched with user and plan details.
 */
export const getByOrganization = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    let subscriptions = args.status
      ? await ctx.db
          .query("memberPlanSubscriptions")
          .withIndex("by_organization_status", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("memberPlanSubscriptions")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .collect();

    return await Promise.all(
      subscriptions.map(async (sub) => {
        const [plan, user] = await Promise.all([
          ctx.db.get(sub.planId),
          ctx.db
            .query("users")
            .withIndex("by_externalId", (q) => q.eq("externalId", sub.userId))
            .first(),
        ]);
        return {
          ...sub,
          plan,
          userFullName: user?.fullName ?? user?.email ?? sub.userId,
        };
      }),
    );
  },
});

/**
 * Member activates a plan. Creates a subscription and a pending payment for the current period.
 */
export const activate = mutation({
  args: {
    planId: v.id("membershipPlans"),
    advanceMonths: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      throw new Error("Solo los miembros pueden activar un plan");
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!plan.isActive) {
      throw new Error("Este plan ya no está disponible");
    }

    // Validate advance months against configured discounts
    const advanceMonths = args.advanceMonths ?? 1;
    if (advanceMonths > 1) {
      const discountTier = plan.advancePaymentDiscounts?.find(
        (d) => d.months === advanceMonths,
      );
      if (!discountTier) {
        throw new Error(
          `No hay descuento configurado para ${advanceMonths} meses`,
        );
      }
    }

    // Check no existing active/suspended subscription
    const existing = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (existing) {
      throw new Error(
        "Ya tenés un plan activo. Cancelalo antes de activar otro.",
      );
    }

    const now = Date.now();
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: identity.subject,
      planId: args.planId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Create payment records
    if (advanceMonths > 1) {
      const discountTier = plan.advancePaymentDiscounts!.find(
        (d) => d.months === advanceMonths,
      )!;
      await createAdvancePayments(ctx, {
        organizationId: membership.organizationId,
        userId: identity.subject,
        subscriptionId,
        plan,
        months: advanceMonths,
        discountPercentage: discountTier.discountPercentage,
      });
    } else {
      // Single month — standard flow
      await createPaymentForCurrentPeriod(ctx, {
        organizationId: membership.organizationId,
        userId: identity.subject,
        subscriptionId,
        plan,
      });
    }

    return subscriptionId;
  },
});

/**
 * Admin/trainer assigns a plan to a member. Creates subscription + pending payment.
 */
export const assignToMember = mutation({
  args: {
    userId: v.string(),
    planId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    // Verify the target user is a member of this org
    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!targetMembership) {
      throw new Error("El usuario no es miembro activo de esta organización");
    }
    if (targetMembership.role !== "member") {
      throw new Error("Solo se puede asignar un plan a un miembro");
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!plan.isActive) {
      throw new Error("Este plan no está activo");
    }

    // Check no existing active/suspended subscription
    const existing = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (existing) {
      throw new Error(
        "El miembro ya tiene un plan activo. Cancelalo antes de asignar otro.",
      );
    }

    const now = Date.now();
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: args.userId,
      planId: args.planId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Create payment record for current billing period
    await createPaymentForCurrentPeriod(ctx, {
      organizationId: membership.organizationId,
      userId: args.userId,
      subscriptionId,
      plan,
    });

    return subscriptionId;
  },
});

/**
 * Cancel a subscription (member cancels own, or admin cancels for any member).
 */
export const cancel = mutation({
  args: {
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    let subscription;
    if (args.subscriptionId) {
      // Admin cancelling for a specific member
      await requireAdminOrTrainer(ctx, membership.organizationId);
      subscription = await ctx.db.get(args.subscriptionId);
    } else {
      // Member cancelling their own
      subscription = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", identity.subject),
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .first();
    }

    if (!subscription) {
      throw new Error("Suscripción no encontrada");
    }
    if (subscription.organizationId !== membership.organizationId) {
      throw new Error("Suscripción no encontrada");
    }
    if (subscription.status === "cancelled") {
      throw new Error("La suscripción ya está cancelada");
    }

    // If member is cancelling, verify it's their own
    if (!args.subscriptionId && subscription.userId !== identity.subject) {
      throw new Error("No podés cancelar la suscripción de otro miembro");
    }

    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    // Auto-revoke active bonification if subscription is cancelled
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
        revokeReason: "Suscripción cancelada",
        updatedAt: now,
      });
    }
  },
});

/**
 * Member changes plan: cancels current and activates new one.
 */
export const changePlan = mutation({
  args: {
    newPlanId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      throw new Error("Solo los miembros pueden cambiar de plan");
    }

    const newPlan = await ctx.db.get(args.newPlanId);
    if (!newPlan || newPlan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!newPlan.isActive) {
      throw new Error("Este plan ya no está disponible");
    }

    // Find and cancel current subscription
    const current = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    const now = Date.now();
    if (current) {
      if (current.planId === args.newPlanId) {
        throw new Error("Ya estás en este plan");
      }
      await ctx.db.patch(current._id, {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      });
    }

    // Create new subscription
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: identity.subject,
      planId: args.newPlanId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Create payment for current period
    await createPaymentForCurrentPeriod(ctx, {
      organizationId: membership.organizationId,
      userId: identity.subject,
      subscriptionId,
      plan: newPlan,
    });

    return subscriptionId;
  },
});

/**
 * Internal mutation: auto-suspend subscriptions with no approved payment
 * past the payment window.
 */
export const autoSuspendUnpaid = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all organizations
    const orgs = await ctx.db.query("organizations").collect();

    let suspendedCount = 0;

    for (const org of orgs) {
      const timezone =
        org.timezone && org.timezone.trim() !== "" ? org.timezone : "UTC";

      // Determine current date in org timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const currentDay = parseInt(partMap.day!, 10);
      const currentMonth = partMap.month!;
      const currentYear = partMap.year!;
      const billingPeriod = `${currentYear}-${currentMonth}`;

      // Get all active subscriptions for this org
      const activeSubscriptions = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", org._id).eq("status", "active"),
        )
        .collect();

      for (const sub of activeSubscriptions) {
        const plan = await ctx.db.get(sub.planId);
        if (!plan) continue;

        // Plans with interest tiers never auto-suspend — they charge more instead
        if (plan.interestTiers && plan.interestTiers.length > 0) continue;

        // Skip bonified subscriptions — they never auto-suspend
        const activeBonification = await ctx.db
          .query("planBonifications")
          .withIndex("by_subscription_status", (q) =>
            q.eq("subscriptionId", sub._id).eq("status", "active"),
          )
          .first();
        if (activeBonification) continue;

        // Skip if payment window hasn't closed yet
        if (currentDay <= plan.paymentWindowEndDay) continue;

        // Grace period: skip if activated after the payment window closed this month
        // (i.e., member joined mid-month past the window)
        const activatedDate = new Date(sub.activatedAt);
        const activatedFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
        });
        const activatedParts = activatedFormatter.formatToParts(activatedDate);
        const activatedPartMap = Object.fromEntries(
          activatedParts.map((p) => [p.type, p.value]),
        );
        const activatedPeriod = `${activatedPartMap.year}-${activatedPartMap.month}`;

        if (activatedPeriod === billingPeriod) {
          // Member activated this month — check if they activated after the window closed
          const activatedDayFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            day: "2-digit",
          });
          const activatedDayParts =
            activatedDayFormatter.formatToParts(activatedDate);
          const activatedDay = parseInt(
            activatedDayParts.find((p) => p.type === "day")?.value ?? "0",
            10,
          );
          if (activatedDay > plan.paymentWindowEndDay) {
            continue; // Grace period: skip this month
          }
        }

        // Check if there's an approved payment for this period
        const approvedPayment = await ctx.db
          .query("planPayments")
          .withIndex("by_subscription_period", (q) =>
            q.eq("subscriptionId", sub._id).eq("billingPeriod", billingPeriod),
          )
          .filter((q) => q.eq(q.field("status"), "approved"))
          .first();

        if (!approvedPayment) {
          await ctx.db.patch(sub._id, {
            status: "suspended",
            suspendedAt: Date.now(),
            updatedAt: Date.now(),
          });
          suspendedCount++;
        }
      }
    }

    return { suspendedCount };
  },
});

/**
 * Helper: create advance payment records for multiple months with a discount.
 * Each month gets its own payment record with the discounted per-month amount.
 */
async function createAdvancePayments(
  ctx: MutationCtx,
  params: {
    organizationId: Id<"organizations">;
    userId: string;
    subscriptionId: Id<"memberPlanSubscriptions">;
    plan: {
      _id: Id<"membershipPlans">;
      priceArs: number;
    };
    months: number;
    discountPercentage: number;
  },
) {
  const now = Date.now();
  const d = new Date(now);
  const discountedPrice = Math.round(
    params.plan.priceArs * (1 - params.discountPercentage / 100),
  );

  for (let i = 0; i < params.months; i++) {
    const monthDate = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const billingPeriod = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

    // Check if a payment already exists for this period
    const existing = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", params.subscriptionId)
          .eq("billingPeriod", billingPeriod),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("planPayments", {
        organizationId: params.organizationId,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        planId: params.plan._id,
        billingPeriod,
        amountArs: discountedPrice,
        totalAmountArs: discountedPrice,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Helper: create a payment record for the current billing period.
 */
async function createPaymentForCurrentPeriod(
  ctx: MutationCtx,
  params: {
    organizationId: Id<"organizations">;
    userId: string;
    subscriptionId: Id<"memberPlanSubscriptions">;
    plan: {
      _id: Id<"membershipPlans">;
      priceArs: number;
    };
  },
) {
  const now = Date.now();
  const d = new Date(now);
  const billingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  // Check if a payment already exists for this period and subscription
  const existing = await ctx.db
    .query("planPayments")
    .withIndex("by_subscription_period", (q) =>
      q
        .eq("subscriptionId", params.subscriptionId)
        .eq("billingPeriod", billingPeriod),
    )
    .first();

  if (existing) return existing._id;

  return await ctx.db.insert("planPayments", {
    organizationId: params.organizationId,
    userId: params.userId,
    subscriptionId: params.subscriptionId,
    planId: params.plan._id,
    billingPeriod,
    amountArs: params.plan.priceArs,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
}
