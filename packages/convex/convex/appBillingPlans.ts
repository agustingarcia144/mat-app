import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./permissions";

const LITE_MODULES = ["dashboard", "members", "exercises", "planifications"];
const LITE_DASHBOARD_CARDS = ["members", "planifications"];

async function requireSuperAdmin(ctx: any) {
  const identity = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q: any) => q.eq("externalId", identity.subject))
    .first();

  if (user?.isSuperAdmin !== true) {
    throw new Error("Unauthorized: Super admin role required");
  }

  return identity;
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

export const setLitePriceArs = mutation({
  args: {
    priceArs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await upsertLitePlan(ctx, args.priceArs);
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
      "Acceso a miembros, ejercicios y planificaciones para una organización.",
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
