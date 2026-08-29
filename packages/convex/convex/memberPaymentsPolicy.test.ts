import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import {
  MEMBER_PAYMENT_POLICY_DISABLED,
  getOrganizationMemberPaymentPolicy,
  resolveMemberPaymentPolicy,
} from "./appBillingPlans";
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

  it("supports a zero-commission plan (future ULTRA) with no code change", () => {
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
          modules: ["payments"],
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
