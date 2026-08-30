import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./permissions";

/**
 * Member-payment policy for a MAT billing plan.
 *
 * Plans without the object behave as MercadoPago disabled with zero
 * commission, so member payment code resolves a policy instead of branching on
 * plan names. A future ULTRA plan is just `platformFeeBps: 0` with
 * `feeCollectionMode: "none"` — no code change required.
 */
export type MemberPaymentPolicy = {
  mercadoPagoEnabled: boolean;
  platformFeeBps: number;
  feeCollectionMode: "none" | "marketplace_split" | "monthly_gym_invoice";
};

export const MEMBER_PAYMENT_POLICY_DISABLED: MemberPaymentPolicy = {
  mercadoPagoEnabled: false,
  platformFeeBps: 0,
  feeCollectionMode: "none",
};

/** LITE gyms cannot charge their members through MercadoPago. */
const LITE_MEMBER_PAYMENTS: MemberPaymentPolicy = MEMBER_PAYMENT_POLICY_DISABLED;

/**
 * PRO gyms can charge through MercadoPago. The commission stays at zero until
 * MAT approves the commercial percentage and the tax treatment; a super admin
 * then raises it with `setMemberPaymentPolicy` without a deploy.
 */
const PRO_MEMBER_PAYMENTS: MemberPaymentPolicy = {
  mercadoPagoEnabled: true,
  platformFeeBps: 0,
  feeCollectionMode: "none",
};

export const MAX_PLATFORM_FEE_BPS = 3_000; // 30%

export function resolveMemberPaymentPolicy(
  entitlements: Doc<"appBillingPlans">["entitlements"] | undefined,
): MemberPaymentPolicy {
  return { ...MEMBER_PAYMENT_POLICY_DISABLED, ...(entitlements?.memberPayments ?? {}) };
}

/** The member-payment policy in force for an organization's current MAT plan. */
export async function getOrganizationMemberPaymentPolicy(
  ctx: { db: any },
  organizationId: Id<"organizations">,
): Promise<{
  policy: MemberPaymentPolicy;
  billingPlanId: Id<"appBillingPlans"> | undefined;
}> {
  const subscription = await ctx.db
    .query("organizationBillingSubscriptions")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .first();

  if (!subscription) {
    return { policy: MEMBER_PAYMENT_POLICY_DISABLED, billingPlanId: undefined };
  }

  const plan = await ctx.db.get(subscription.billingPlanId);
  return {
    policy: resolveMemberPaymentPolicy(plan?.entitlements),
    billingPlanId: subscription.billingPlanId,
  };
}

// "metrics_exercises" is the exercise-metrics screen only; the full "metrics"
// module (classes, attendance, churn, finance balance) stays PRO-only.
const LITE_MODULES = [
  "dashboard",
  "members",
  "exercises",
  "planifications",
  "metrics_exercises",
];
const LITE_DASHBOARD_CARDS = ["members", "planifications"];
const PRO_MODULES = [
  "dashboard",
  "members",
  "exercises",
  "planifications",
  "classes",
  "payments",
  "finance",
  "metrics",
  "metrics_exercises",
  "users",
  "settings",
];
const PRO_DASHBOARD_CARDS = [
  "members",
  "planifications",
  "payments",
  "classes",
];

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appBillingPlans")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const getLite = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", "lite"))
      .first();
  },
});

export const getPro = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", "pro"))
      .first();
  },
});

export const setLitePriceArs = mutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await upsertLitePlan(ctx, args.priceArs);
  },
});

export const setProPriceArs = mutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await upsertProPlan(ctx, args.priceArs);
  },
});

export const ensureLitePlanInternal = internalMutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    return await upsertLitePlan(ctx, args.priceArs);
  },
});

export const ensureProPlanInternal = internalMutation({
  args: {
    priceArs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await upsertProPlan(ctx, args.priceArs ?? 1);
  },
});

async function upsertLitePlan(ctx: any, priceArs: number) {
  if (!Number.isFinite(priceArs) || priceArs < 1) {
    throw new Error("Lite price must be a positive ARS amount");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("appBillingPlans")
    .withIndex("by_key", (q: any) => q.eq("key", "lite"))
    .first();

  const doc = {
    key: "lite",
    name: "LITE",
    description:
      "Acceso a miembros, ejercicios, planificaciones y métricas de ejercicios para una organización.",
    referencePriceUsd: 10,
    priceCurrency: "ARS" as const,
    priceArs,
    frequency: 1,
    frequencyType: "months" as const,
    entitlements: {
      modules: LITE_MODULES,
      dashboardCards: LITE_DASHBOARD_CARDS,
      // Re-seeding must not silently revert a policy a super admin changed.
      memberPayments:
        existing?.entitlements?.memberPayments ?? LITE_MEMBER_PAYMENTS,
    },
    isActive: true,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("appBillingPlans", {
    ...doc,
    createdAt: now,
  });
}

/** Exported so test seeding can create PRO without duplicating its definition. */
export async function upsertProPlan(ctx: any, priceArs: number) {
  if (!Number.isFinite(priceArs) || priceArs < 0) {
    throw new Error("Pro price must be a non-negative ARS amount");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("appBillingPlans")
    .withIndex("by_key", (q: any) => q.eq("key", "pro"))
    .first();

  const doc = {
    key: "pro",
    name: "PRO",
    description: "Acceso completo a todos los módulos de MAT.",
    referencePriceUsd: 0,
    priceCurrency: "ARS" as const,
    priceArs,
    frequency: 1,
    frequencyType: "months" as const,
    entitlements: {
      modules: PRO_MODULES,
      dashboardCards: PRO_DASHBOARD_CARDS,
      // Re-seeding must not silently revert a policy a super admin changed.
      memberPayments:
        existing?.entitlements?.memberPayments ?? PRO_MEMBER_PAYMENTS,
    },
    isActive: true,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("appBillingPlans", {
    ...doc,
    createdAt: now,
  });
}

/**
 * Super-admin: change a MAT plan's member-payment policy without a deploy.
 * Existing commission ledger rows are snapshots and are never rewritten by
 * this, so a policy change only affects transactions approved afterwards.
 */
export const setMemberPaymentPolicy = mutation({
  args: {
    planKey: v.string(),
    mercadoPagoEnabled: v.boolean(),
    platformFeeBps: v.number(),
    feeCollectionMode: v.union(
      v.literal("none"),
      v.literal("marketplace_split"),
      v.literal("monthly_gym_invoice"),
    ),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    if (
      !Number.isInteger(args.platformFeeBps) ||
      args.platformFeeBps < 0 ||
      args.platformFeeBps > MAX_PLATFORM_FEE_BPS
    ) {
      throw new Error(
        `platformFeeBps must be an integer between 0 and ${MAX_PLATFORM_FEE_BPS}`,
      );
    }

    if (args.feeCollectionMode !== "none" && args.platformFeeBps === 0) {
      throw new Error(
        'A zero commission must use feeCollectionMode "none" so ledger rows are recorded as not applicable.',
      );
    }

    const plan = await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", args.planKey))
      .first();

    if (!plan) {
      throw new Error(`Unknown billing plan "${args.planKey}"`);
    }

    await ctx.db.patch(plan._id, {
      entitlements: {
        ...plan.entitlements,
        memberPayments: {
          mercadoPagoEnabled: args.mercadoPagoEnabled,
          platformFeeBps: args.platformFeeBps,
          feeCollectionMode: args.feeCollectionMode,
        },
      },
      updatedAt: Date.now(),
    });

    return plan._id;
  },
});

/**
 * Set a plan's member-payment policy without touching its price.
 *
 * An internal mutation so it can be run from the Convex dashboard during
 * setup, where there is no signed-in super admin to authorize the public
 * mutation. Deliberately narrow: it cannot change a price, and it refuses the
 * same nonsensical combinations `setMemberPaymentPolicy` does.
 */
export const ensureMemberPaymentPolicyInternal = internalMutation({
  args: {
    planKey: v.string(),
    mercadoPagoEnabled: v.boolean(),
    platformFeeBps: v.optional(v.number()),
    feeCollectionMode: v.optional(
      v.union(
        v.literal("none"),
        v.literal("marketplace_split"),
        v.literal("monthly_gym_invoice"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const platformFeeBps = args.platformFeeBps ?? 0;
    const feeCollectionMode = args.feeCollectionMode ?? "none";

    if (
      !Number.isInteger(platformFeeBps) ||
      platformFeeBps < 0 ||
      platformFeeBps > MAX_PLATFORM_FEE_BPS
    ) {
      throw new Error(
        `platformFeeBps must be an integer between 0 and ${MAX_PLATFORM_FEE_BPS}`,
      );
    }
    if (feeCollectionMode !== "none" && platformFeeBps === 0) {
      throw new Error(
        'A zero commission must use feeCollectionMode "none" so ledger rows are recorded as not applicable.',
      );
    }

    const plan = await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", args.planKey))
      .first();
    if (!plan) throw new Error(`Unknown billing plan "${args.planKey}"`);

    await ctx.db.patch(plan._id, {
      entitlements: {
        ...plan.entitlements,
        memberPayments: {
          mercadoPagoEnabled: args.mercadoPagoEnabled,
          platformFeeBps,
          feeCollectionMode,
        },
      },
      updatedAt: Date.now(),
    });

    return {
      planKey: plan.key,
      priceArsUnchanged: plan.priceArs,
      memberPayments: {
        mercadoPagoEnabled: args.mercadoPagoEnabled,
        platformFeeBps,
        feeCollectionMode,
      },
    };
  },
});

/** Super-admin: read the member-payment policy of every plan. */
export const listMemberPaymentPolicies = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const plans = await ctx.db.query("appBillingPlans").collect();
    return plans.map((plan) => ({
      _id: plan._id,
      key: plan.key,
      name: plan.name,
      memberPayments: resolveMemberPaymentPolicy(plan.entitlements),
    }));
  },
});
