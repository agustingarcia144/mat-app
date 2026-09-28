import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  upsertProPlan,
  upsertUltraPlan,
  ALL_KNOWN_MODULES,
  PRO_MODULES,
} from "./appBillingPlans";
import { CHECK_IN_MODULE, REWARDS_MODULE } from "./rewardsDomain";

const modules = import.meta.glob("./**/*.*s");
type TestConvex = ReturnType<typeof convexTest>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An organization whose entitlements come from a real seeded plan doc, so the
 * assertions below track what `upsert*Plan` actually grants rather than a list
 * copied into the test.
 */
async function seedOrganization(
  t: TestConvex,
  options: {
    planKey?: "lite" | "pro" | "ultra";
    entitlementStatus?: "active" | "inactive" | "grace_period" | "trial";
    isSuperAdmin?: boolean;
    withSubscription?: boolean;
    moduleOverrides?: Array<{ module: string; enabled: boolean }>;
  } = {},
) {
  const planKey = options.planKey ?? "pro";
  const entitlementStatus = options.entitlementStatus ?? "active";
  const withSubscription = options.withSubscription ?? true;
  const userId = `billing_${planKey}_${Math.random()}`;

  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "Gym Billing",
      slug: `gym-billing-${Math.random()}`,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("users", {
      externalId: userId,
      fullName: "Usuario Billing",
      activeOrganizationId: organizationId,
      isSuperAdmin: options.isSuperAdmin,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "admin",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (withSubscription) {
      const billingPlanId =
        planKey === "ultra"
          ? await upsertUltraPlan(ctx, 30_000)
          : planKey === "pro"
            ? await upsertProPlan(ctx, 20_000)
            : await ctx.db.insert("appBillingPlans", {
                key: "lite",
                name: "LITE",
                referencePriceUsd: 10,
                priceCurrency: "ARS" as const,
                priceArs: 10_000,
                frequency: 1,
                frequencyType: "months" as const,
                entitlements: { modules: ["members"], dashboardCards: [] },
                isActive: true,
                createdAt: now,
                updatedAt: now,
              });

      await ctx.db.insert("organizationBillingSubscriptions", {
        organizationId,
        billingPlanId,
        source: entitlementStatus === "trial" ? "trial" : "manual",
        externalReference: `billing-${Math.random()}`,
        // "pending" is its own billing status, so an inactive fixture has to
        // be a subscription that ended rather than one never authorized.
        status: entitlementStatus === "inactive" ? "cancelled" : "authorized",
        entitlementStatus,
        trialEndsAt:
          entitlementStatus === "trial" ? now + 7 * DAY_MS : undefined,
        graceUntil:
          entitlementStatus === "grace_period" ? now + DAY_MS : undefined,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const override of options.moduleOverrides ?? []) {
      await ctx.db.insert("organizationModuleOverrides", {
        organizationId,
        module: override.module,
        enabled: override.enabled,
        grantedBy: "super_admin_test",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { organizationId, userId };
  });
}

function entitlementFor(t: TestConvex, userId: string) {
  return t
    .withIdentity({ subject: userId })
    .query(api.organizationBilling.getCurrentEntitlement, {});
}

describe("organization entitlement resolution", () => {
  // Rewards is piloted per gym, so no plan grants it -- not even the top one.
  it("withholds the rewards module from every plan", async () => {
    const t = convexTest(schema, modules);
    const ultra = await seedOrganization(t, { planKey: "ultra" });
    const pro = await seedOrganization(t, { planKey: "pro" });

    const ultraEntitlement = await entitlementFor(t, ultra.userId);
    expect(ultraEntitlement.planKey).toBe("ultra");
    expect(ultraEntitlement.modules).not.toContain(REWARDS_MODULE);

    const proEntitlement = await entitlementFor(t, pro.userId);
    expect(proEntitlement.planKey).toBe("pro");
    expect(proEntitlement.modules).not.toContain(REWARDS_MODULE);
    // PRO still unlocks everything it always did.
    expect(proEntitlement.modules).toEqual(PRO_MODULES);
  });

  it("grants a piloted module to the one organization it is enabled for", async () => {
    const t = convexTest(schema, modules);
    const piloted = await seedOrganization(t, {
      planKey: "pro",
      moduleOverrides: [{ module: CHECK_IN_MODULE, enabled: true }],
    });
    const other = await seedOrganization(t, { planKey: "pro" });

    const pilotedEntitlement = await entitlementFor(t, piloted.userId);
    expect(pilotedEntitlement.modules).toContain(CHECK_IN_MODULE);
    // The pilot adds the module without disturbing what the plan grants.
    expect(pilotedEntitlement.modules).toEqual(
      expect.arrayContaining(PRO_MODULES),
    );
    // ...and grants only the module asked for.
    expect(pilotedEntitlement.modules).not.toContain(REWARDS_MODULE);

    const otherEntitlement = await entitlementFor(t, other.userId);
    expect(otherEntitlement.modules).not.toContain(CHECK_IN_MODULE);
  });

  it("withholds a plan module from an organization overridden off", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOrganization(t, {
      planKey: "pro",
      moduleOverrides: [{ module: "classes", enabled: false }],
    });

    const entitlement = await entitlementFor(t, userId);
    expect(entitlement.modules).not.toContain("classes");
    expect(entitlement.modules).toContain("payments");
  });

  // The signup trial runs on PRO. Granting ULTRA modules here would hand every
  // new gym rewards for a week and take them away on day 8.
  it("grants the trial the PRO set and never the rewards module", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOrganization(t, {
      planKey: "pro",
      entitlementStatus: "trial",
    });

    const entitlement = await entitlementFor(t, userId);
    expect(entitlement.billingStatus).toBe("trial");
    expect(entitlement.modules).toEqual(PRO_MODULES);
    expect(entitlement.modules).not.toContain(REWARDS_MODULE);
  });

  it("gives a super admin every module the product has", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOrganization(t, {
      planKey: "pro",
      isSuperAdmin: true,
    });

    const entitlement = await entitlementFor(t, userId);
    // Including the modules still being piloted, which no plan grants.
    expect(entitlement.modules).toEqual(ALL_KNOWN_MODULES);
    expect(entitlement.modules).toContain(REWARDS_MODULE);
    expect(entitlement.modules).toContain(CHECK_IN_MODULE);
  });

  it("keeps plan modules through a grace period and drops them when inactive", async () => {
    const t = convexTest(schema, modules);
    const grace = await seedOrganization(t, {
      planKey: "pro",
      entitlementStatus: "grace_period",
    });
    const inactive = await seedOrganization(t, {
      planKey: "pro",
      entitlementStatus: "inactive",
    });

    const graceEntitlement = await entitlementFor(t, grace.userId);
    expect(graceEntitlement.billingStatus).toBe("grace_period");
    expect(graceEntitlement.modules).toEqual(PRO_MODULES);

    const inactiveEntitlement = await entitlementFor(t, inactive.userId);
    expect(inactiveEntitlement.billingStatus).toBe("inactive");
    expect(inactiveEntitlement.modules).toEqual([]);
  });

  it("reports an organization with no subscription as inactive with no modules", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOrganization(t, { withSubscription: false });

    const entitlement = await entitlementFor(t, userId);
    expect(entitlement.billingStatus).toBe("inactive");
    expect(entitlement.modules).toEqual([]);
  });
});
