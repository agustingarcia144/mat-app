import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";

/**
 * Compute the effective amount a member pays given a bonification discount.
 */
export function computeBonificationAmount(
  planPriceArs: number,
  discountType: "percentage" | "fixed" | "full",
  discountValue: number,
): number {
  if (discountType === "full") return 0;
  if (discountType === "percentage") {
    return Math.round(planPriceArs * (1 - discountValue / 100));
  }
  // fixed
  return Math.max(0, planPriceArs - discountValue);
}

/**
 * Get all bonifications for the organization (admin/trainer).
 */
export const getByOrganization = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const bonifications = args.status
      ? await ctx.db
          .query("planBonifications")
          .withIndex("by_organization_status", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("planBonifications")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .collect();

    // Enrich with user and plan details
    return await Promise.all(
      bonifications.map(async (bonification) => {
        const [plan, user] = await Promise.all([
          ctx.db.get(bonification.planId),
          ctx.db
            .query("users")
            .withIndex("by_externalId", (q: any) =>
              q.eq("externalId", bonification.userId),
            )
            .first(),
        ]);

        const planPrice = plan?.priceArs ?? 0;
        const effectiveAmountArs = computeBonificationAmount(
          planPrice,
          bonification.discountType,
          bonification.discountValue,
        );

        return {
          ...bonification,
          planName: plan?.name ?? "Plan eliminado",
          planPriceArs: planPrice,
          effectiveAmountArs,
          userFullName: user?.fullName ?? user?.email ?? bonification.userId,
        };
      }),
    );
  },
});

/**
 * Get active bonification for a subscription (admin/trainer).
 */
export const getBySubscription = query({
  args: { subscriptionId: v.id("memberPlanSubscriptions") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    return await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("status", "active"),
      )
      .first();
  },
});

/**
 * Get the current user's active bonification (for mobile display).
 */
export const getMyActiveBonification = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;

    // Find active/suspended subscription
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

    const bonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", subscription._id).eq("status", "active"),
      )
      .first();

    if (!bonification) return null;

    // Enrich with admin name
    const createdByUser = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q: any) =>
        q.eq("externalId", bonification.createdBy),
      )
      .first();

    return {
      ...bonification,
      createdByName:
        createdByUser?.fullName ??
        createdByUser?.email ??
        bonification.createdBy,
    };
  },
});

/**
 * Admin creates a bonification for a member's subscription.
 */
export const create = mutation({
  args: {
    subscriptionId: v.id("memberPlanSubscriptions"),
    discountType: v.union(
      v.literal("percentage"),
      v.literal("fixed"),
      v.literal("full"),
    ),
    discountValue: v.number(),
    reason: v.union(
      v.literal("friend_and_family"),
      v.literal("trainer"),
      v.literal("employee"),
      v.literal("sponsor"),
      v.literal("other"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const subscription = await ctx.db.get(args.subscriptionId);
    if (
      !subscription ||
      subscription.organizationId !== membership.organizationId
    ) {
      throw new Error("Suscripción no encontrada");
    }
    if (subscription.status === "cancelled") {
      throw new Error("No se puede bonificar una suscripción cancelada");
    }

    const plan = await ctx.db.get(subscription.planId);
    if (!plan) throw new Error("Plan no encontrado");

    // Check no existing active bonification
    const existing = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("status", "active"),
      )
      .first();
    if (existing) {
      throw new Error("Esta suscripción ya tiene una bonificación activa");
    }

    // Validate discount value
    if (args.discountType === "percentage") {
      if (args.discountValue <= 0 || args.discountValue > 100) {
        throw new Error("El porcentaje debe estar entre 1 y 100");
      }
    } else if (args.discountType === "fixed") {
      if (args.discountValue <= 0) {
        throw new Error("El monto fijo debe ser mayor a 0");
      }
      if (args.discountValue > plan.priceArs) {
        throw new Error(
          "El monto fijo no puede superar el precio del plan ($" +
            plan.priceArs.toLocaleString("es-AR") +
            ")",
        );
      }
    }

    // Block if there are future pending advance payments
    const now = Date.now();
    const d = new Date(now);
    const currentBillingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const existingPayments = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.gt(q.field("billingPeriod"), currentBillingPeriod),
        ),
      )
      .first();

    if (existingPayments) {
      throw new Error(
        "No se puede bonificar una suscripción con pagos adelantados pendientes. Eliminá los pagos futuros primero.",
      );
    }

    // Create bonification
    const bonificationId = await ctx.db.insert("planBonifications", {
      organizationId: membership.organizationId,
      subscriptionId: args.subscriptionId,
      userId: subscription.userId,
      planId: subscription.planId,
      discountType: args.discountType,
      discountValue: args.discountValue,
      reason: args.reason,
      notes: args.notes?.trim() || undefined,
      status: "active",
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });

    // Compute effective amount
    const effectiveAmount = computeBonificationAmount(
      plan.priceArs,
      args.discountType,
      args.discountValue,
    );

    // Generate approved payment for current billing period
    const currentPayment = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", args.subscriptionId)
          .eq("billingPeriod", currentBillingPeriod),
      )
      .first();

    if (currentPayment) {
      // Patch existing pending/declined/in_review payment to approved bonification
      if (currentPayment.status !== "approved") {
        await ctx.db.patch(currentPayment._id, {
          status: "approved",
          amountArs: effectiveAmount,
          totalAmountArs: effectiveAmount,
          paymentMethod: "bonification",
          bonificationId,
          isBonification: true,
          recordedBy: identity.subject,
          reviewedBy: identity.subject,
          reviewedAt: now,
          reviewNotes: undefined,
          interestApplied: undefined,
          interestTotalArs: undefined,
          updatedAt: now,
        });
      }
    } else {
      // Create new approved bonification payment
      await ctx.db.insert("planPayments", {
        organizationId: membership.organizationId,
        userId: subscription.userId,
        subscriptionId: args.subscriptionId,
        planId: subscription.planId,
        billingPeriod: currentBillingPeriod,
        amountArs: effectiveAmount,
        totalAmountArs: effectiveAmount,
        paymentMethod: "bonification",
        bonificationId,
        isBonification: true,
        recordedBy: identity.subject,
        status: "approved",
        reviewedBy: identity.subject,
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Reactivate suspended subscription
    if (subscription.status === "suspended") {
      await ctx.db.patch(subscription._id, {
        status: "active",
        suspendedAt: undefined,
        updatedAt: now,
      });
    }

    return bonificationId;
  },
});

/**
 * Admin revokes a bonification. Member returns to normal payment flow next period.
 */
export const revoke = mutation({
  args: {
    bonificationId: v.id("planBonifications"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const bonification = await ctx.db.get(args.bonificationId);
    if (
      !bonification ||
      bonification.organizationId !== membership.organizationId
    ) {
      throw new Error("Bonificación no encontrada");
    }
    if (bonification.status === "revoked") {
      throw new Error("Esta bonificación ya fue revocada");
    }

    const now = Date.now();
    await ctx.db.patch(args.bonificationId, {
      status: "revoked",
      revokedAt: now,
      revokedBy: identity.subject,
      revokeReason: args.reason?.trim() || undefined,
      updatedAt: now,
    });
  },
});

/**
 * Admin updates an active bonification's terms (future periods only).
 */
export const update = mutation({
  args: {
    bonificationId: v.id("planBonifications"),
    discountType: v.optional(
      v.union(v.literal("percentage"), v.literal("fixed"), v.literal("full")),
    ),
    discountValue: v.optional(v.number()),
    reason: v.optional(
      v.union(
        v.literal("friend_and_family"),
        v.literal("trainer"),
        v.literal("employee"),
        v.literal("sponsor"),
        v.literal("other"),
      ),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const bonification = await ctx.db.get(args.bonificationId);
    if (
      !bonification ||
      bonification.organizationId !== membership.organizationId
    ) {
      throw new Error("Bonificación no encontrada");
    }
    if (bonification.status !== "active") {
      throw new Error("Solo se pueden modificar bonificaciones activas");
    }

    const plan = await ctx.db.get(bonification.planId);
    const planPrice = plan?.priceArs ?? 0;

    const newDiscountType = args.discountType ?? bonification.discountType;
    const newDiscountValue = args.discountValue ?? bonification.discountValue;

    // Validate
    if (newDiscountType === "percentage") {
      if (newDiscountValue <= 0 || newDiscountValue > 100) {
        throw new Error("El porcentaje debe estar entre 1 y 100");
      }
    } else if (newDiscountType === "fixed") {
      if (newDiscountValue <= 0) {
        throw new Error("El monto fijo debe ser mayor a 0");
      }
      if (newDiscountValue > planPrice) {
        throw new Error("El monto fijo no puede superar el precio del plan");
      }
    }

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.discountType !== undefined) patch.discountType = args.discountType;
    if (args.discountValue !== undefined)
      patch.discountValue = args.discountValue;
    if (args.reason !== undefined) patch.reason = args.reason;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    await ctx.db.patch(args.bonificationId, patch);
  },
});

/**
 * Internal mutation: auto-generate approved payments for active bonifications.
 * Called by daily cron. Idempotent — safe to run multiple times per period.
 */
export const generateBonificationPayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    let generatedCount = 0;

    for (const org of orgs) {
      const timezone =
        org.timezone && org.timezone.trim() !== "" ? org.timezone : "UTC";

      // Determine current billing period in org timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const billingPeriod = `${partMap.year}-${partMap.month}`;

      // Get all active bonifications for this org
      const activeBonifications = await ctx.db
        .query("planBonifications")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", org._id).eq("status", "active"),
        )
        .collect();

      for (const bonification of activeBonifications) {
        // Check if payment already exists for this period
        const existingPayment = await ctx.db
          .query("planPayments")
          .withIndex("by_subscription_period", (q) =>
            q
              .eq("subscriptionId", bonification.subscriptionId)
              .eq("billingPeriod", billingPeriod),
          )
          .filter((q) => q.eq(q.field("status"), "approved"))
          .first();

        if (existingPayment) continue;

        // Get plan for current price
        const plan = await ctx.db.get(bonification.planId);
        if (!plan) continue;

        const effectiveAmount = computeBonificationAmount(
          plan.priceArs,
          bonification.discountType,
          bonification.discountValue,
        );

        const nowMs = Date.now();

        // Check if there's a non-approved payment we should patch
        const pendingPayment = await ctx.db
          .query("planPayments")
          .withIndex("by_subscription_period", (q) =>
            q
              .eq("subscriptionId", bonification.subscriptionId)
              .eq("billingPeriod", billingPeriod),
          )
          .first();

        if (pendingPayment && pendingPayment.status !== "approved") {
          await ctx.db.patch(pendingPayment._id, {
            status: "approved",
            amountArs: effectiveAmount,
            totalAmountArs: effectiveAmount,
            paymentMethod: "bonification",
            bonificationId: bonification._id,
            isBonification: true,
            recordedBy: bonification.createdBy,
            reviewedBy: bonification.createdBy,
            reviewedAt: nowMs,
            interestApplied: undefined,
            interestTotalArs: undefined,
            updatedAt: nowMs,
          });
        } else if (!pendingPayment) {
          await ctx.db.insert("planPayments", {
            organizationId: org._id,
            userId: bonification.userId,
            subscriptionId: bonification.subscriptionId,
            planId: bonification.planId,
            billingPeriod,
            amountArs: effectiveAmount,
            totalAmountArs: effectiveAmount,
            paymentMethod: "bonification",
            bonificationId: bonification._id,
            isBonification: true,
            recordedBy: bonification.createdBy,
            status: "approved",
            reviewedBy: bonification.createdBy,
            reviewedAt: nowMs,
            createdAt: nowMs,
            updatedAt: nowMs,
          });
        }

        // Reactivate suspended subscription if needed
        const subscription = await ctx.db.get(bonification.subscriptionId);
        if (subscription && subscription.status === "suspended") {
          await ctx.db.patch(subscription._id, {
            status: "active",
            suspendedAt: undefined,
            updatedAt: nowMs,
          });
        }

        generatedCount++;
      }
    }

    return { generatedCount };
  },
});
