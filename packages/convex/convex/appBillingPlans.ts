import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "./permissions";

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

async function upsertProPlan(ctx: any, priceArs: number) {
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
