import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./permissions";

/**
 * Member-payment policy for a MAT billing plan.
 *
 * Plans without the object behave as MercadoPago disabled with zero
 * commission, so member payment code resolves a policy instead of branching on
 * plan names.
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
const LITE_MEMBER_PAYMENTS: MemberPaymentPolicy =
  MEMBER_PAYMENT_POLICY_DISABLED;

/**
 * PRO gyms can charge through MercadoPago, and MAT takes 0.5% of what their
 * members pay. `marketplace_split` has MercadoPago deduct the fee at the source
 * so the gym is paid net; recurring preapproval charges have no split-fee API,
 * so `resolveCollectionMode` accrues those for the monthly invoice instead.
 *
 * Dropping this to zero is what an ULTRA gym is paying for.
 */
const PRO_MEMBER_PAYMENTS: MemberPaymentPolicy = {
  mercadoPagoEnabled: true,
  platformFeeBps: 50, // 0.5%
  feeCollectionMode: "marketplace_split",
};

/**
 * ULTRA gyms keep every peso their members pay: MAT charges no transaction
 * commission. The zero here is the plan's headline promise rather than a
 * placeholder, so unlike PRO it is not expected to be raised later.
 */
const ULTRA_MEMBER_PAYMENTS: MemberPaymentPolicy = {
  mercadoPagoEnabled: true,
  platformFeeBps: 0,
  feeCollectionMode: "none",
};

export const MAX_PLATFORM_FEE_BPS = 3_000; // 30%

export function resolveMemberPaymentPolicy(
  entitlements: Doc<"appBillingPlans">["entitlements"] | undefined,
): MemberPaymentPolicy {
  return {
    ...MEMBER_PAYMENT_POLICY_DISABLED,
    ...(entitlements?.memberPayments ?? {}),
  };
}

/**
 * Mati AI allowance for a MAT billing plan.
 *
 * Stored on the plan doc rather than hard-coded per plan key so a super admin
 * can retune an allowance without a deploy, the same way `memberPayments`
 * works. Plans without the object grant no AI access.
 */
export type AiAllowance = {
  /** Assistant turns allowed per subscription cycle. */
  monthlyTurnLimit: number;
};

export const AI_ALLOWANCE_NONE: AiAllowance = { monthlyTurnLimit: 0 };

const LITE_AI: AiAllowance = AI_ALLOWANCE_NONE;
const PRO_AI: AiAllowance = { monthlyTurnLimit: 15 };
const ULTRA_AI: AiAllowance = { monthlyTurnLimit: 100 };

export function resolveAiAllowance(
  entitlements: Doc<"appBillingPlans">["entitlements"] | undefined,
): AiAllowance {
  return { ...AI_ALLOWANCE_NONE, ...(entitlements?.ai ?? {}) };
}

/**
 * The member-payment policy in force for an organization.
 *
 * Charging members through MercadoPago is still being piloted, so the plan's
 * policy only applies to a gym that has the "member_payments" module. Without
 * it the policy is disabled no matter what the plan says -- the check lives
 * here rather than in the UI because a gym admin can flip
 * `organizationSettings.memberPayments` on by themselves, and hiding the
 * screen would not stop that.
 */
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

  const entitled = await organizationHasModule(
    ctx,
    organizationId,
    MEMBER_PAYMENTS_MODULE,
  );
  if (!entitled) {
    return {
      policy: MEMBER_PAYMENT_POLICY_DISABLED,
      billingPlanId: subscription.billingPlanId,
    };
  }

  const plan = await ctx.db.get(subscription.billingPlanId);
  return {
    policy: resolveMemberPaymentPolicy(plan?.entitlements),
    billingPlanId: subscription.billingPlanId,
  };
}

// These arrays are the single definition of what each plan unlocks.
// organizationBilling.ts imports them rather than keeping its own copy, so a
// module added here cannot be granted by one file and withheld by the other.
//
// "metrics_exercises" is the exercise-metrics screen only; the full "metrics"
// module (classes, attendance, churn, finance balance) stays PRO-only.
export const LITE_MODULES = [
  "dashboard",
  "members",
  "exercises",
  "planifications",
  "metrics_exercises",
];
export const LITE_DASHBOARD_CARDS = ["members", "planifications"];
export const PRO_MODULES = [
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
export const PRO_DASHBOARD_CARDS = [
  "members",
  "planifications",
  "payments",
  "classes",
];

export const ULTRA_MODULES = [...PRO_MODULES];
export const ULTRA_DASHBOARD_CARDS = PRO_DASHBOARD_CARDS;

// Modules no plan grants. They reach an organization only through a
// per-organization override, which is how a feature is piloted with a handful
// of gyms before it is priced into a plan:
//
//   "check_in"        QR check-in scanner + the wallet pass that carries the
//                     member's code. Shipped first; the two are one feature.
//   "rewards"         the points program that check-ins can feed.
//   "member_payments" charging members through MercadoPago.
//
// Once a feature is ready for everyone, add it to a plan array above and the
// overrides become redundant rather than load-bearing.
export const MEMBER_PAYMENTS_MODULE = "member_payments";
export const PILOT_ONLY_MODULES = [
  "check_in",
  "rewards",
  MEMBER_PAYMENTS_MODULE,
];

/** Every module the product knows about. Guards override writes against typos. */
export const ALL_KNOWN_MODULES = [...PRO_MODULES, ...PILOT_ONLY_MODULES];

/**
 * The modules an organization actually has: what its plan grants, plus or
 * minus the per-organization overrides a super admin has written.
 *
 * The single place `organizationModuleOverrides` is read. Both callers --
 * `organizationHasModule` for server-side gates and `getCurrentEntitlement`
 * for the web client -- go through here, so a gate and the sidebar can never
 * disagree about what a gym has.
 */
export async function resolveOrganizationModules(
  ctx: { db: any },
  organizationId: Id<"organizations">,
  planModules: string[],
): Promise<string[]> {
  const overrides = await ctx.db
    .query("organizationModuleOverrides")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  if (overrides.length === 0) return planModules;

  const resolved = new Set(planModules);
  for (const override of overrides) {
    if (override.enabled) resolved.add(override.module);
    else resolved.delete(override.module);
  }
  return [...resolved];
}

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

export const getUltra = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", "ultra"))
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

export const setUltraPriceArs = mutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await upsertUltraPlan(ctx, args.priceArs);
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

export const ensureUltraPlanInternal = internalMutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    return await upsertUltraPlan(ctx, args.priceArs);
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
      ai: existing?.entitlements?.ai ?? LITE_AI,
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
    description:
      "Clases, pagos, finanzas, métricas y usuarios para una organización.",
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
      ai: existing?.entitlements?.ai ?? PRO_AI,
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

/** Exported so test seeding can create ULTRA without duplicating its definition. */
export async function upsertUltraPlan(ctx: any, priceArs: number) {
  if (!Number.isFinite(priceArs) || priceArs < 0) {
    throw new Error("Ultra price must be a non-negative ARS amount");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("appBillingPlans")
    .withIndex("by_key", (q: any) => q.eq("key", "ultra"))
    .first();

  const doc = {
    key: "ultra",
    name: "ULTRA",
    description:
      "Todo lo de PRO, sin comisión en los cobros a miembros, con recompensas, ingreso QR y Mati AI ampliado.",
    referencePriceUsd: 0,
    priceCurrency: "ARS" as const,
    priceArs,
    frequency: 1,
    frequencyType: "months" as const,
    entitlements: {
      modules: ULTRA_MODULES,
      dashboardCards: ULTRA_DASHBOARD_CARDS,
      // Re-seeding must not silently revert a policy a super admin changed.
      memberPayments:
        existing?.entitlements?.memberPayments ?? ULTRA_MEMBER_PAYMENTS,
      ai: existing?.entitlements?.ai ?? ULTRA_AI,
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
 * Whether an organization has a module: its plan's grant, as amended by any
 * per-organization override.
 *
 * Mirrors `getOrganizationMemberPaymentPolicy`: server code that gates on an
 * entitlement asks this instead of reading a plan key, so adding a module to a
 * plan is a data change. An organization with no subscription still gets its
 * overrides, which is what lets a pilot gym use a feature while its billing is
 * being sorted out.
 */
export async function organizationHasModule(
  ctx: { db: any },
  organizationId: Id<"organizations">,
  module: string,
): Promise<boolean> {
  return (await getOrganizationModules(ctx, organizationId)).includes(module);
}

/**
 * Every module an organization has, resolved from its subscription's plan and
 * its overrides.
 *
 * Ask for the whole list when gating on more than one module: each call costs a
 * subscription lookup, a plan read and an overrides scan, so three
 * `organizationHasModule` calls do that work three times over.
 */
export async function getOrganizationModules(
  ctx: { db: any },
  organizationId: Id<"organizations">,
): Promise<string[]> {
  const subscription = await ctx.db
    .query("organizationBillingSubscriptions")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .first();

  const plan = subscription
    ? await ctx.db.get(subscription.billingPlanId)
    : null;
  return await resolveOrganizationModules(
    ctx,
    organizationId,
    plan?.entitlements?.modules ?? [],
  );
}

/**
 * Bring existing plan docs up to date with the entitlements this file defines,
 * without touching prices.
 *
 * `ensure*PlanInternal` rewrites the whole doc including `priceArs`, so it
 * cannot be used to repair a live deployment. This fills in entitlement fields
 * a plan predates -- notably `ai`, whose absence means "no AI access" and would
 * otherwise silently switch Mati off for every organization on an older doc.
 *
 * Deliberately conservative: it never writes a price, never downgrades a
 * plan's module list, and never overwrites `memberPayments`, which a super
 * admin may have tuned. Safe to run repeatedly.
 */
export const reconcilePlanEntitlementsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaults: Record<
      string,
      { modules: string[]; dashboardCards: string[]; ai: AiAllowance }
    > = {
      lite: {
        modules: LITE_MODULES,
        dashboardCards: LITE_DASHBOARD_CARDS,
        ai: LITE_AI,
      },
      pro: {
        modules: PRO_MODULES,
        dashboardCards: PRO_DASHBOARD_CARDS,
        ai: PRO_AI,
      },
      ultra: {
        modules: ULTRA_MODULES,
        dashboardCards: ULTRA_DASHBOARD_CARDS,
        ai: ULTRA_AI,
      },
    };

    const changes: Array<{
      key: string;
      addedModules: string[];
      addedDashboardCards: string[];
      aiTurnLimit: number | "unchanged";
    }> = [];

    for (const plan of await ctx.db.query("appBillingPlans").collect()) {
      const expected = defaults[plan.key];
      if (!expected) continue;

      // Union, not replace: a module granted by hand stays granted.
      const addedModules = expected.modules.filter(
        (module) => !plan.entitlements.modules.includes(module),
      );
      const addedDashboardCards = expected.dashboardCards.filter(
        (card) => !plan.entitlements.dashboardCards.includes(card),
      );
      const needsAi = plan.entitlements.ai === undefined;

      if (
        addedModules.length === 0 &&
        addedDashboardCards.length === 0 &&
        !needsAi
      ) {
        continue;
      }

      await ctx.db.patch(plan._id, {
        entitlements: {
          ...plan.entitlements,
          modules: [...plan.entitlements.modules, ...addedModules],
          dashboardCards: [
            ...plan.entitlements.dashboardCards,
            ...addedDashboardCards,
          ],
          ai: plan.entitlements.ai ?? expected.ai,
        },
        updatedAt: Date.now(),
      });

      changes.push({
        key: plan.key,
        addedModules,
        addedDashboardCards,
        aiTurnLimit: needsAi ? expected.ai.monthlyTurnLimit : "unchanged",
      });
    }

    return { changes, plansChanged: changes.length };
  },
});

/**
 * Strip modules from every plan doc that no longer belongs to a plan.
 *
 * `reconcilePlanEntitlementsInternal` unions and never removes, by design: a
 * module granted by hand stays granted. That means retiring a module in code
 * does not revoke it from plan docs already in the database -- an ULTRA doc
 * seeded before `PILOT_ONLY_MODULES` existed still carries "rewards".
 *
 * Run once after deploying such a change. Idempotent: a second run finds
 * nothing to do. Per-organization overrides are untouched, so a pilot gym
 * keeps the module it was granted.
 */
export const pruneRetiredModulesInternal = internalMutation({
  args: { modules: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const retired = new Set(args.modules ?? PILOT_ONLY_MODULES);
    const changes: Array<{ key: string; removedModules: string[] }> = [];

    for (const plan of await ctx.db.query("appBillingPlans").collect()) {
      const removedModules = plan.entitlements.modules.filter((module) =>
        retired.has(module),
      );
      if (removedModules.length === 0) continue;

      await ctx.db.patch(plan._id, {
        entitlements: {
          ...plan.entitlements,
          modules: plan.entitlements.modules.filter(
            (module) => !retired.has(module),
          ),
        },
        updatedAt: Date.now(),
      });
      changes.push({ key: plan.key, removedModules });
    }

    return { changes, plansChanged: changes.length };
  },
});

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

/**
 * Super-admin: grant or withhold a module for one organization, without a
 * deploy and without moving the gym to another plan.
 *
 * `enabled: null` deletes the row, returning the organization to whatever its
 * plan says. Writing `false` is not the same thing: it withholds a module the
 * plan does grant.
 */
export const setOrganizationModuleOverride = mutation({
  args: {
    organizationId: v.id("organizations"),
    module: v.string(),
    enabled: v.union(v.boolean(), v.null()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireSuperAdmin(ctx);

    // A typo here would silently grant nothing, so reject unknown modules
    // rather than storing a row that can never match a gate.
    if (!ALL_KNOWN_MODULES.includes(args.module)) {
      throw new Error(
        `UNKNOWN_MODULE: ${args.module}. Known modules: ${ALL_KNOWN_MODULES.join(", ")}`,
      );
    }

    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");

    const existing = await ctx.db
      .query("organizationModuleOverrides")
      .withIndex("by_organization_module", (q) =>
        q.eq("organizationId", args.organizationId).eq("module", args.module),
      )
      .first();

    if (args.enabled === null) {
      if (existing) await ctx.db.delete(existing._id);
      return { module: args.module, override: null };
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        note: args.note,
        grantedBy: identity.subject,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationModuleOverrides", {
        organizationId: args.organizationId,
        module: args.module,
        enabled: args.enabled,
        note: args.note,
        grantedBy: identity.subject,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { module: args.module, override: args.enabled };
  },
});

/**
 * Super-admin: what one organization's overrides are, and the module list they
 * resolve to. The UI shows both so it can distinguish "on because the plan
 * grants it" from "on because someone forced it on".
 */
export const listOrganizationModuleOverrides = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const subscription = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .first();
    const plan = subscription
      ? await ctx.db.get(subscription.billingPlanId)
      : null;
    const planModules = plan?.entitlements.modules ?? [];

    const overrides = await ctx.db
      .query("organizationModuleOverrides")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    return {
      planKey: plan?.key ?? null,
      knownModules: ALL_KNOWN_MODULES,
      planModules,
      overrides: overrides.map((override) => ({
        module: override.module,
        enabled: override.enabled,
        note: override.note,
        updatedAt: override.updatedAt,
      })),
      effectiveModules: await resolveOrganizationModules(
        ctx,
        args.organizationId,
        planModules,
      ),
    };
  },
});
