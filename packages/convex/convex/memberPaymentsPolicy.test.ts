import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MEMBER_PAYMENT_POLICY_DISABLED,
  PILOT_ONLY_MODULES,
  getOrganizationMemberPaymentPolicy,
  resolveAiAllowance,
  resolveMemberPaymentPolicy,
  upsertProPlan,
  upsertUltraPlan,
} from "./appBillingPlans";
import { computeCommissionArs } from "./billingDomain";
import { REWARDS_MODULE } from "./rewardsDomain";
import {
  MAX_GRACE_PERIOD_DAYS,
  MEMBER_PAYMENT_DEFAULTS,
  getMemberPaymentSettings,
  resolveMemberPaymentSettings,
} from "./organizationSettings";

const modules = import.meta.glob("./**/*.*s");

async function seedOrganization(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      name: "Gimnasio Legacy",
      slug: `gimnasio-${now}`,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("organization member-payment settings", () => {
  it("defaults an organization with no settings row to transfer only", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    const settings = await t.run((ctx) =>
      getMemberPaymentSettings(ctx, organizationId),
    );

    expect(settings.bankTransferEnabled).toBe(true);
    expect(settings.mercadoPagoRecurringEnabled).toBe(false);
    expect(settings.mercadoPagoOneTimeEnabled).toBe(false);
  });

  it("defaults an existing settings row without memberPayments the same way", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationSettings", {
        organizationId,
        planificationsEnabled: true,
        classesEnabled: true,
        financeEnabled: true,
        memberAutoApproval: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    const settings = await t.run((ctx) =>
      getMemberPaymentSettings(ctx, organizationId),
    );
    expect(settings).toEqual({ ...MEMBER_PAYMENT_DEFAULTS });
  });

  it("returns a gym's stored configuration once it opts in", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationSettings", {
        organizationId,
        planificationsEnabled: true,
        classesEnabled: true,
        financeEnabled: true,
        memberAutoApproval: false,
        memberPayments: {
          bankTransferEnabled: false,
          mercadoPagoRecurringEnabled: true,
          mercadoPagoOneTimeEnabled: true,
          gracePeriodDays: 10,
          initialPaymentRequiresApproval: true,
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    const settings = await t.run((ctx) =>
      getMemberPaymentSettings(ctx, organizationId),
    );
    expect(settings.bankTransferEnabled).toBe(false);
    expect(settings.mercadoPagoRecurringEnabled).toBe(true);
    expect(settings.gracePeriodDays).toBe(10);
  });

  it("keeps defaults for fields a partial stored object omits", () => {
    const resolved = resolveMemberPaymentSettings({
      bankTransferEnabled: true,
      mercadoPagoRecurringEnabled: true,
      mercadoPagoOneTimeEnabled: false,
      gracePeriodDays: 3,
      initialPaymentRequiresApproval: true,
    });
    expect(resolved.gracePeriodDays).toBe(3);
    expect(resolved.initialPaymentRequiresApproval).toBe(true);
  });

  it("bounds the grace period to a safe range", () => {
    expect(MEMBER_PAYMENT_DEFAULTS.gracePeriodDays).toBeGreaterThanOrEqual(0);
    expect(MEMBER_PAYMENT_DEFAULTS.gracePeriodDays).toBeLessThanOrEqual(
      MAX_GRACE_PERIOD_DAYS,
    );
  });
});

describe("MAT billing plan member-payment policy", () => {
  it("treats a plan with no policy as disabled with zero commission", () => {
    expect(
      resolveMemberPaymentPolicy({ modules: [], dashboardCards: [] }),
    ).toEqual(MEMBER_PAYMENT_POLICY_DISABLED);
    expect(resolveMemberPaymentPolicy(undefined)).toEqual(
      MEMBER_PAYMENT_POLICY_DISABLED,
    );
  });

  it("reads a configured policy without branching on the plan name", () => {
    expect(
      resolveMemberPaymentPolicy({
        modules: [],
        dashboardCards: [],
        memberPayments: {
          mercadoPagoEnabled: true,
          platformFeeBps: 250,
          feeCollectionMode: "monthly_gym_invoice",
        },
      }),
    ).toEqual({
      mercadoPagoEnabled: true,
      platformFeeBps: 250,
      feeCollectionMode: "monthly_gym_invoice",
    });
  });

  it("supports a zero-commission plan with no code change", () => {
    const policy = resolveMemberPaymentPolicy({
      modules: [],
      dashboardCards: [],
      memberPayments: {
        mercadoPagoEnabled: true,
        platformFeeBps: 0,
        feeCollectionMode: "none",
      },
    });
    expect(policy.mercadoPagoEnabled).toBe(true);
    expect(policy.platformFeeBps).toBe(0);
  });

  // ULTRA is sold on "MAT takes nothing from what your members pay". Seeding it
  // with any commission would break that promise silently, so assert the seed.
  it("seeds ULTRA with MercadoPago on and no commission", async () => {
    const t = convexTest(schema, modules);
    const plan = await t.run(async (ctx) => {
      const planId = (await upsertUltraPlan(
        ctx,
        30_000,
      )) as Id<"appBillingPlans">;
      return await ctx.db.get(planId);
    });

    expect(resolveMemberPaymentPolicy(plan!.entitlements)).toEqual({
      mercadoPagoEnabled: true,
      platformFeeBps: 0,
      feeCollectionMode: "none",
    });
    expect(computeCommissionArs(50_000, 0)).toBe(0);
  });

  // Rewards and QR check-in are piloted per organization rather than sold with
  // a tier, so seeding must not put them on any plan doc.
  it("seeds no piloted module onto a plan", async () => {
    const t = convexTest(schema, modules);
    const { ultra, pro } = await t.run(async (ctx) => ({
      ultra: await ctx.db.get(
        (await upsertUltraPlan(ctx, 30_000)) as Id<"appBillingPlans">,
      ),
      pro: await ctx.db.get(
        (await upsertProPlan(ctx, 20_000)) as Id<"appBillingPlans">,
      ),
    }));

    for (const plan of [ultra, pro]) {
      for (const module of PILOT_ONLY_MODULES) {
        expect(plan!.entitlements.modules).not.toContain(module);
      }
    }
    expect(ultra!.entitlements.modules).not.toContain(REWARDS_MODULE);
    // Everything PRO unlocks stays unlocked on ULTRA.
    for (const module of pro!.entitlements.modules) {
      expect(ultra!.entitlements.modules).toContain(module);
    }
  });

  it("seeds a larger AI allowance for ULTRA than for PRO", async () => {
    const t = convexTest(schema, modules);
    const { ultra, pro } = await t.run(async (ctx) => ({
      ultra: await ctx.db.get(
        (await upsertUltraPlan(ctx, 30_000)) as Id<"appBillingPlans">,
      ),
      pro: await ctx.db.get(
        (await upsertProPlan(ctx, 20_000)) as Id<"appBillingPlans">,
      ),
    }));

    expect(resolveAiAllowance(pro!.entitlements).monthlyTurnLimit).toBe(15);
    expect(resolveAiAllowance(ultra!.entitlements).monthlyTurnLimit).toBe(100);
  });

  // Regression guard: moving the AI allowance onto the plan doc gave older docs
  // an implicit limit of 0, which switches Mati off for every gym on them.
  it("backfills a missing AI allowance without touching the price", async () => {
    const t = convexTest(schema, modules);
    const before = await t.run(async (ctx) =>
      ctx.db.insert("appBillingPlans", {
        key: "pro",
        name: "PRO",
        referencePriceUsd: 60,
        priceCurrency: "ARS" as const,
        priceArs: 89_999,
        frequency: 1,
        frequencyType: "months" as const,
        // A doc created before either the "ai" field or metrics_exercises.
        entitlements: {
          modules: ["dashboard", "members"],
          dashboardCards: ["members"],
          memberPayments: {
            mercadoPagoEnabled: true,
            platformFeeBps: 175,
            feeCollectionMode: "monthly_gym_invoice" as const,
          },
        },
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await t.mutation(
      internal.appBillingPlans.reconcilePlanEntitlementsInternal,
      {},
    );
    expect(result.plansChanged).toBe(1);

    const plan = await t.run((ctx) => ctx.db.get(before));
    expect(plan!.priceArs).toBe(89_999);
    expect(resolveAiAllowance(plan!.entitlements).monthlyTurnLimit).toBe(15);
    // A hand-tuned commission is not reverted.
    expect(resolveMemberPaymentPolicy(plan!.entitlements).platformFeeBps).toBe(
      175,
    );
    // Missing modules are added; nothing is taken away.
    expect(plan!.entitlements.modules).toContain("metrics_exercises");
    expect(plan!.entitlements.modules).toContain("members");
    expect(plan!.entitlements.modules).not.toContain(REWARDS_MODULE);
  });

  it("is a no-op on a plan already up to date", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => upsertUltraPlan(ctx, 30_000));

    const result = await t.mutation(
      internal.appBillingPlans.reconcilePlanEntitlementsInternal,
      {},
    );
    expect(result.plansChanged).toBe(0);
  });

  it("keeps a super admin's policy change across a re-seed", async () => {
    const t = convexTest(schema, modules);
    const plan = await t.run(async (ctx) => {
      await upsertUltraPlan(ctx, 30_000);
      const seeded = await ctx.db
        .query("appBillingPlans")
        .withIndex("by_key", (q) => q.eq("key", "ultra"))
        .first();
      await ctx.db.patch(seeded!._id, {
        entitlements: {
          ...seeded!.entitlements,
          memberPayments: {
            mercadoPagoEnabled: true,
            platformFeeBps: 250,
            feeCollectionMode: "monthly_gym_invoice" as const,
          },
        },
      });
      // A price change re-seeds the doc; the policy must survive it.
      const planId = (await upsertUltraPlan(
        ctx,
        35_000,
      )) as Id<"appBillingPlans">;
      return await ctx.db.get(planId);
    });

    expect(plan!.priceArs).toBe(35_000);
    expect(resolveMemberPaymentPolicy(plan!.entitlements).platformFeeBps).toBe(
      250,
    );
  });

  it("resolves the policy of the organization's current MAT plan", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    const { billingPlanId } = await t.run(async (ctx) => {
      const now = Date.now();
      const billingPlanId = await ctx.db.insert("appBillingPlans", {
        key: "pro",
        name: "PRO",
        referencePriceUsd: 0,
        priceCurrency: "ARS",
        priceArs: 50_000,
        frequency: 1,
        frequencyType: "months",
        entitlements: {
          modules: ["payments", "member_payments"],
          dashboardCards: ["payments"],
          memberPayments: {
            mercadoPagoEnabled: true,
            platformFeeBps: 150,
            feeCollectionMode: "monthly_gym_invoice",
          },
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("organizationBillingSubscriptions", {
        organizationId,
        billingPlanId,
        externalReference: "org_billing_test",
        status: "authorized",
        entitlementStatus: "active",
        createdBy: "user_test",
        createdAt: now,
        updatedAt: now,
      });

      return { billingPlanId };
    });

    const resolved = await t.run((ctx) =>
      getOrganizationMemberPaymentPolicy(ctx, organizationId),
    );
    expect(resolved.billingPlanId).toBe(billingPlanId);
    expect(resolved.policy.platformFeeBps).toBe(150);
  });

  // Charging members is piloted per gym, so the plan's policy is inert until
  // the organization has the module. Checked here rather than in the UI: a gym
  // admin can flip their own organizationSettings, and hiding a screen would
  // not stop them.
  it("disables member payments for an organization without the module", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      const billingPlanId = await ctx.db.insert("appBillingPlans", {
        key: "pro",
        name: "PRO",
        referencePriceUsd: 0,
        priceCurrency: "ARS" as const,
        priceArs: 50_000,
        frequency: 1,
        frequencyType: "months" as const,
        entitlements: {
          // The plan grants "payments" but not "member_payments".
          modules: ["payments"],
          dashboardCards: ["payments"],
          memberPayments: {
            mercadoPagoEnabled: true,
            platformFeeBps: 150,
            feeCollectionMode: "monthly_gym_invoice" as const,
          },
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("organizationBillingSubscriptions", {
        organizationId,
        billingPlanId,
        externalReference: "org_billing_ungated",
        status: "authorized" as const,
        entitlementStatus: "active" as const,
        createdBy: "user_test",
        createdAt: now,
        updatedAt: now,
      });
    });

    const resolved = await t.run((ctx) =>
      getOrganizationMemberPaymentPolicy(ctx, organizationId),
    );
    expect(resolved.policy).toEqual(MEMBER_PAYMENT_POLICY_DISABLED);

    // Granting the module to this one gym turns the plan's policy on.
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationModuleOverrides", {
        organizationId,
        module: "member_payments",
        enabled: true,
        grantedBy: "super_admin_test",
        createdAt: now,
        updatedAt: now,
      });
    });

    const granted = await t.run((ctx) =>
      getOrganizationMemberPaymentPolicy(ctx, organizationId),
    );
    expect(granted.policy.platformFeeBps).toBe(150);
    expect(granted.policy.mercadoPagoEnabled).toBe(true);
  });

  it("disables member MercadoPago for an organization with no MAT subscription", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);

    const resolved = await t.run((ctx) =>
      getOrganizationMemberPaymentPolicy(ctx, organizationId),
    );
    expect(resolved.policy).toEqual(MEMBER_PAYMENT_POLICY_DISABLED);
    expect(resolved.billingPlanId).toBeUndefined();
  });
});

describe("per-organization module overrides", () => {
  async function seedSuperAdmin(
    t: ReturnType<typeof convexTest>,
    organizationId: Id<"organizations">,
  ) {
    const userId = `super_${Math.random()}`;
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        externalId: userId,
        fullName: "Super Admin",
        activeOrganizationId: organizationId,
        isSuperAdmin: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    return userId;
  }

  // A misspelled module would store a row that no gate can ever match, so the
  // write is rejected rather than silently granting nothing.
  it("rejects an unknown module", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);
    const userId = await seedSuperAdmin(t, organizationId);

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(api.appBillingPlans.setOrganizationModuleOverride, {
          organizationId,
          module: "check-in",
          enabled: true,
        }),
    ).rejects.toThrow("UNKNOWN_MODULE");
  });

  it("refuses a caller who is not a super admin", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);
    const userId = `plain_${Math.random()}`;
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        externalId: userId,
        fullName: "Admin del gym",
        activeOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(api.appBillingPlans.setOrganizationModuleOverride, {
          organizationId,
          module: "check_in",
          enabled: true,
        }),
    ).rejects.toThrow();
  });

  it("grants, revokes and clears back to the plan default", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t);
    const userId = await seedSuperAdmin(t, organizationId);
    const asSuperAdmin = t.withIdentity({ subject: userId });

    await asSuperAdmin.mutation(
      api.appBillingPlans.setOrganizationModuleOverride,
      { organizationId, module: "check_in", enabled: true },
    );
    let state = await asSuperAdmin.query(
      api.appBillingPlans.listOrganizationModuleOverrides,
      { organizationId },
    );
    expect(state.effectiveModules).toContain("check_in");

    // Writing the same module again updates the row rather than adding one.
    await asSuperAdmin.mutation(
      api.appBillingPlans.setOrganizationModuleOverride,
      { organizationId, module: "check_in", enabled: false },
    );
    state = await asSuperAdmin.query(
      api.appBillingPlans.listOrganizationModuleOverrides,
      { organizationId },
    );
    expect(state.overrides).toHaveLength(1);
    expect(state.effectiveModules).not.toContain("check_in");

    // null clears the exception entirely.
    await asSuperAdmin.mutation(
      api.appBillingPlans.setOrganizationModuleOverride,
      { organizationId, module: "check_in", enabled: null },
    );
    state = await asSuperAdmin.query(
      api.appBillingPlans.listOrganizationModuleOverrides,
      { organizationId },
    );
    expect(state.overrides).toHaveLength(0);
  });
});
