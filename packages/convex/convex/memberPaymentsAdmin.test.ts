import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DAY_MS } from "./billingDomain";
import { SELLER_A } from "./mercadoPago.fixtures";
import {
  ADMIN,
  MEMBER,
  PREAPPROVAL_ID,
  ROUTING_KEY,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const TRAINER = "user_trainer";
const EMPLOYEE = "user_employee";
const SUPER_ADMIN = "user_super_admin";
const PRICE = 30_000;

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Gym = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
};

async function seedGym(
  t: TestConvex,
  options: { slug?: string; adminId?: string; withStaff?: boolean } = {},
): Promise<Gym> {
  const credentials = await testCredentials();
  const adminId = options.adminId ?? ADMIN;

  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: options.slug ?? "Gym A",
      slug: `${options.slug ?? "gym"}-${now}-${Math.random()}`,
      timezone: "America/Argentina/Buenos_Aires",
      createdAt: now,
      updatedAt: now,
    });

    const roster: Array<[string, "admin" | "trainer" | "employee" | "member"]> = [
      [adminId, "admin"],
      [MEMBER, "member"],
    ];
    if (options.withStaff !== false) {
      roster.push([TRAINER, "trainer"], [EMPLOYEE, "employee"]);
    }

    for (const [userId, role] of roster) {
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("externalId"), userId))
        .first();
      if (!existing) {
        await ctx.db.insert("users", {
          externalId: userId,
          activeOrganizationId: organizationId,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role,
        status: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const connectionId = await ctx.db.insert(
      "organizationPaymentProviderConnections",
      {
        organizationId,
        provider: "mercadopago",
        status: "active",
        providerAccountId: String(SELLER_A.userId),
        providerNickname: SELLER_A.nickname,
        webhookRoutingKey: `${ROUTING_KEY}-${Math.random()}`,
        lastRefreshedAt: now,
        createdAt: now,
        updatedAt: now,
        ...credentials,
      },
    );

    const planId = await ctx.db.insert("membershipPlans", {
      organizationId,
      name: "Mensual",
      priceArs: PRICE,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      billingMode: "join_date",
      isActive: true,
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: MEMBER,
      planId,
      status: "active",
      activatedAt: now - 40 * DAY_MS,
      paymentMode: "mercadopago_recurring",
      createdAt: now,
      updatedAt: now,
    });

    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId,
      connectionId,
      subscriptionId,
      payerUserId: MEMBER,
      providerPreapprovalId: PREAPPROVAL_ID,
      externalReference: `mat_sub_${organizationId}_${subscriptionId}_abcdef01`,
      status: "active",
      amountArs: PRICE,
      currency: "ARS",
      familyMemberCount: 1,
      billingAnchorAt: now - 40 * DAY_MS,
      currentPeriodEnd: now + 20 * DAY_MS,
      nextChargeAt: now + 20 * DAY_MS,
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId, connectionId, subscriptionId, agreementId };
  });
}

describe("who can see the member-payment configuration", () => {
  it("gives an admin the connection, settings and policy", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const overview = await t
      .withIdentity({ subject: ADMIN })
      .query(api.memberPaymentsAdmin.getOverview, {});

    expect(overview!.connection!.providerNickname).toBe(SELLER_A.nickname);
    expect(overview!.settings.bankTransferEnabled).toBe(true);
    expect(overview!.counts.activeAgreements).toBe(1);
    expect(overview!.runtimeEnabled).toBe(true);
  });

  it("never exposes a credential through the overview", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const overview = await t
      .withIdentity({ subject: ADMIN })
      .query(api.memberPaymentsAdmin.getOverview, {});

    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain("Ciphertext");
    expect(serialized).not.toContain("webhookRoutingKey");
  });

  it("refuses trainers, employees and members", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    for (const identity of [TRAINER, EMPLOYEE, MEMBER]) {
      await expect(
        t
          .withIdentity({ subject: identity })
          .query(api.memberPaymentsAdmin.getOverview, {}),
      ).rejects.toThrow(/Admin role/i);
    }
  });

  it("lets staff read agreements but keeps operations admin-only", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const asTrainer = await t
      .withIdentity({ subject: TRAINER })
      .query(api.memberPaymentsAdmin.listAgreements, {});
    expect(asTrainer).toHaveLength(1);
    expect(asTrainer[0]!.amountArs).toBe(PRICE);

    await expect(
      t
        .withIdentity({ subject: TRAINER })
        .query(api.memberPaymentsAdmin.listProviderOperations, {}),
    ).rejects.toThrow(/Admin role/i);
  });

  it("refuses a member reading other members' agreements", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .query(api.memberPaymentsAdmin.listAgreements, {}),
    ).rejects.toThrow(/staff role/i);
  });
});

describe("changing payment configuration", () => {
  it("lets an admin change the methods and the grace period", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    await t.withIdentity({ subject: ADMIN }).mutation(
      api.organizationSettings.update,
      {
        memberPayments: {
          bankTransferEnabled: true,
          mercadoPagoRecurringEnabled: true,
          mercadoPagoOneTimeEnabled: false,
          gracePeriodDays: 7,
          initialPaymentRequiresApproval: true,
        },
      },
    );

    const settings = await t
      .withIdentity({ subject: ADMIN })
      .query(api.organizationSettings.get, {});
    expect(settings!.memberPayments.gracePeriodDays).toBe(7);
    expect(settings!.memberPayments.mercadoPagoOneTimeEnabled).toBe(false);
  });

  it("refuses to leave a gym with no payment method at all", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    await expect(
      t.withIdentity({ subject: ADMIN }).mutation(
        api.organizationSettings.update,
        {
          memberPayments: {
            bankTransferEnabled: false,
            mercadoPagoRecurringEnabled: false,
            mercadoPagoOneTimeEnabled: false,
            gracePeriodDays: 5,
            initialPaymentRequiresApproval: true,
          },
        },
      ),
    ).rejects.toThrow(/al menos un método de pago/);
  });

  it("bounds the grace period", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    for (const gracePeriodDays of [-1, 31, 2.5]) {
      await expect(
        t.withIdentity({ subject: ADMIN }).mutation(
          api.organizationSettings.update,
          {
            memberPayments: {
              bankTransferEnabled: true,
              mercadoPagoRecurringEnabled: true,
              mercadoPagoOneTimeEnabled: true,
              gracePeriodDays,
              initialPaymentRequiresApproval: true,
            },
          },
        ),
      ).rejects.toThrow(/período de gracia/i);
    }
  });

  it("refuses a trainer changing payment configuration", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    await expect(
      t.withIdentity({ subject: TRAINER }).mutation(
        api.organizationSettings.update,
        {
          memberPayments: {
            bankTransferEnabled: true,
            mercadoPagoRecurringEnabled: true,
            mercadoPagoOneTimeEnabled: true,
            gracePeriodDays: 5,
            initialPaymentRequiresApproval: true,
          },
        },
      ),
    ).rejects.toThrow(/Admin role/i);
  });

  it("keeps the MAT commission policy to super admins", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("appBillingPlans", {
        key: "pro",
        name: "PRO",
        referencePriceUsd: 0,
        priceCurrency: "ARS",
        priceArs: 50_000,
        frequency: 1,
        frequencyType: "months",
        entitlements: { modules: [], dashboardCards: [] },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        externalId: SUPER_ADMIN,
        isSuperAdmin: true,
        activeOrganizationId: gym.organizationId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: ADMIN })
        .mutation(api.appBillingPlans.setMemberPaymentPolicy, {
          planKey: "pro",
          mercadoPagoEnabled: true,
          platformFeeBps: 500,
          feeCollectionMode: "monthly_gym_invoice",
        }),
    ).rejects.toThrow(/Super admin/i);

    await t
      .withIdentity({ subject: SUPER_ADMIN })
      .mutation(api.appBillingPlans.setMemberPaymentPolicy, {
        planKey: "pro",
        mercadoPagoEnabled: true,
        platformFeeBps: 500,
        feeCollectionMode: "monthly_gym_invoice",
      });

    const policies = await t
      .withIdentity({ subject: SUPER_ADMIN })
      .query(api.appBillingPlans.listMemberPaymentPolicies, {});
    expect(policies[0]!.memberPayments.platformFeeBps).toBe(500);
  });

  it("refuses a commission mode that would collect nothing", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("appBillingPlans", {
        key: "pro",
        name: "PRO",
        referencePriceUsd: 0,
        priceCurrency: "ARS",
        priceArs: 50_000,
        frequency: 1,
        frequencyType: "months",
        entitlements: { modules: [], dashboardCards: [] },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        externalId: SUPER_ADMIN,
        isSuperAdmin: true,
        activeOrganizationId: gym.organizationId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: SUPER_ADMIN })
        .mutation(api.appBillingPlans.setMemberPaymentPolicy, {
          planKey: "pro",
          mercadoPagoEnabled: true,
          platformFeeBps: 0,
          feeCollectionMode: "marketplace_split",
        }),
    ).rejects.toThrow(/zero commission/i);
  });
});

describe("operational actions", () => {
  it("lets an admin queue a resync", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPaymentsAdmin.resyncAgreement, {
        agreementId: gym.agreementId,
      });

    const [operation] = await t.run((ctx) =>
      ctx.db.query("memberPaymentProviderOperations").collect(),
    );
    expect(operation!.operation).toBe("resync");
  });

  it("lets an admin stop a debit without ending the plan", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPaymentsAdmin.cancelAgreement, {
        agreementId: gym.agreementId,
      });

    const agreement = await t.run((ctx) => ctx.db.get(gym.agreementId));
    expect(agreement!.status).toBe("cancellation_scheduled");

    const subscription = await t.run((ctx) => ctx.db.get(gym.subscriptionId));
    expect(subscription!.status).toBe("active");
    expect(subscription!.paymentMode).toBe("manual");
    // No access end: stopping the debit is not the same as cancelling the plan.
    expect(subscription!.accessEndsAt).toBeUndefined();
  });

  it("refuses a trainer running operational actions", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    await expect(
      t
        .withIdentity({ subject: TRAINER })
        .mutation(api.memberPaymentsAdmin.resyncAgreement, {
          agreementId: gym.agreementId,
        }),
    ).rejects.toThrow(/Admin role/i);
  });

  it("refuses an admin acting on another gym's agreement", async () => {
    const t = convexTest(schema, modules);
    const gymA = await seedGym(t, { slug: "gym-a", adminId: "admin_a" });
    await seedGym(t, { slug: "gym-b", adminId: "admin_b", withStaff: false });

    await expect(
      t
        .withIdentity({ subject: "admin_b" })
        .mutation(api.memberPaymentsAdmin.resyncAgreement, {
          agreementId: gymA.agreementId,
        }),
    ).rejects.toThrow(/no encontrado/i);
  });

  it("refuses to cancel a debit that is already finished", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await t.run((ctx) => ctx.db.patch(gym.agreementId, { status: "cancelled" }));

    await expect(
      t
        .withIdentity({ subject: ADMIN })
        .mutation(api.memberPaymentsAdmin.cancelAgreement, {
          agreementId: gym.agreementId,
        }),
    ).rejects.toThrow(/ya no está activo/);
  });
});
