import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  buildSettlementReference,
  previousBillingPeriod,
} from "./platformCommissions";
import { DAY_MS, computeCommissionArs } from "./billingDomain";
import { FakeMercadoPago } from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  paymentResponse,
  preferenceResponse,
  SELLER_A,
} from "./mercadoPago.fixtures";
import {
  ADMIN,
  MEMBER,
  PREAPPROVAL_ID,
  ROUTING_KEY,
  postSignedWebhook,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const SUPER_ADMIN = "user_super_admin";
const PRICE = 30_000;
const TZ = "America/Argentina/Buenos_Aires";

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Gym = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  planId: Id<"membershipPlans">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
  externalReference: string;
};

async function seedGym(
  t: TestConvex,
  options: {
    platformFeeBps?: number;
    feeCollectionMode?: "none" | "marketplace_split" | "monthly_gym_invoice";
  } = {},
): Promise<Gym> {
  const credentials = await testCredentials();

  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "Gym A",
      slug: `gym-${now}-${Math.random()}`,
      timezone: TZ,
      createdAt: now,
      updatedAt: now,
    });

    for (const [userId, role] of [
      [ADMIN, "admin"],
      [MEMBER, "member"],
    ] as const) {
      await ctx.db.insert("users", {
        externalId: userId,
        activeOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
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
          platformFeeBps: options.platformFeeBps ?? 250,
          feeCollectionMode: options.feeCollectionMode ?? "monthly_gym_invoice",
        },
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationBillingSubscriptions", {
      organizationId,
      billingPlanId,
      externalReference: "org_billing",
      status: "authorized",
      entitlementStatus: "active",
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationSettings", {
      organizationId,
      planificationsEnabled: true,
      classesEnabled: true,
      financeEnabled: true,
      memberAutoApproval: false,
      memberPayments: {
        bankTransferEnabled: true,
        mercadoPagoRecurringEnabled: true,
        mercadoPagoOneTimeEnabled: true,
        gracePeriodDays: 5,
        initialPaymentRequiresApproval: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    const connectionId = await ctx.db.insert(
      "organizationPaymentProviderConnections",
      {
        organizationId,
        provider: "mercadopago",
        status: "active",
        providerAccountId: String(SELLER_A.userId),
        webhookRoutingKey: ROUTING_KEY,
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
      advancePaymentDiscounts: [{ months: 3, discountPercentage: 10 }],
      isActive: true,
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });

    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: MEMBER,
      planId,
      status: "active",
      activatedAt: now - 40 * DAY_MS,
      billingAnchorAt: now - 40 * DAY_MS,
      paymentMode: "mercadopago_recurring",
      createdAt: now,
      updatedAt: now,
    });

    const externalReference = `mat_sub_${organizationId}_${subscriptionId}_abcdef01`;
    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId,
      connectionId,
      subscriptionId,
      payerUserId: MEMBER,
      providerPreapprovalId: PREAPPROVAL_ID,
      externalReference,
      status: "active",
      amountArs: PRICE,
      currency: "ARS",
      familyMemberCount: 1,
      billingAnchorAt: now - 40 * DAY_MS,
      currentPeriodEnd: now + 20 * DAY_MS,
      createdAt: now,
      updatedAt: now,
    });

    return {
      organizationId,
      connectionId,
      planId,
      subscriptionId,
      agreementId,
      externalReference,
    };
  });
}

async function chargeApproved(t: TestConvex, gym: Gym, id = 5000000001) {
  const fake = new FakeMercadoPago();
  fake.onJson(
    "GET /authorized_payments/*",
    authorizedPaymentResponse({
      id,
      preapproval_id: PREAPPROVAL_ID,
      external_reference: gym.externalReference,
      transaction_amount: PRICE,
      payment_status: "approved",
      payment_id: id + 2_000_000_000,
    }),
  );
  __setMercadoPagoTransportForTests(fake.transport);
  await postSignedWebhook(t, {
    topic: "subscription_authorized_payment",
    resourceId: String(id),
  });
}

const readLedger = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("platformCommissionLedger").collect());

/** Move every ledger entry into a closed month so settlement will pick it up. */
async function backdateLedger(t: TestConvex) {
  const lastMonth = Date.now() - 35 * DAY_MS;
  await t.run(async (ctx) => {
    const entries = await ctx.db.query("platformCommissionLedger").collect();
    for (const entry of entries) {
      await ctx.db.patch(entry._id, { createdAt: lastMonth });
    }
  });
  return previousBillingPeriod(Date.now(), TZ);
}

describe("settlement period helpers", () => {
  it("settles the month before the current one", () => {
    const march = Date.UTC(2026, 2, 15, 15, 0, 0);
    expect(previousBillingPeriod(march, TZ)).toBe("2026-02");
    const january = Date.UTC(2026, 0, 5, 15, 0, 0);
    expect(previousBillingPeriod(january, TZ)).toBe("2025-12");
  });

  it("builds a reference that is stable across runs", () => {
    expect(buildSettlementReference("org1", "2026-02")).toBe(
      "mat_fee_org1_2026-02",
    );
    expect(buildSettlementReference("org1", "2026-02")).toBe(
      buildSettlementReference("org1", "2026-02"),
    );
  });
});

describe("accrual", () => {
  it("snapshots the fee at the rate in force", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);

    const [entry] = await readLedger(t);
    expect(entry!.platformFeeBps).toBe(250);
    expect(entry!.feeAmountArs).toBe(computeCommissionArs(PRICE, 250));
    expect(entry!.status).toBe("accrued");
    expect(entry!.collectionMode).toBe("monthly_gym_invoice");
  });

  it("records a zero-fee plan as not applicable but still auditable", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      platformFeeBps: 0,
      feeCollectionMode: "none",
    });
    await chargeApproved(t, gym);

    const [entry] = await readLedger(t);
    expect(entry!.status).toBe("not_applicable");
    expect(entry!.feeAmountArs).toBe(0);
    // The gross is still recorded, so volume reporting stays complete.
    expect(entry!.grossAmountArs).toBe(PRICE);
  });

  it("never claims a recurring charge was split at the source", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      platformFeeBps: 250,
      feeCollectionMode: "marketplace_split",
    });
    await chargeApproved(t, gym);

    const [entry] = await readLedger(t);
    // Mercado Pago has no documented split on subscription charges, so this
    // falls back to invoicing rather than pretending money was taken.
    expect(entry!.collectionMode).toBe("monthly_gym_invoice");
    expect(entry!.status).toBe("accrued");
  });

  it("marks a split one-time fee as already collected", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      platformFeeBps: 250,
      feeCollectionMode: "marketplace_split",
    });

    const fake = new FakeMercadoPago();
    fake.onJson("POST /checkout/preferences", preferenceResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    const advance = await t
      .withIdentity({ subject: MEMBER })
      .action(api.memberPaymentsActions.startAdvanceCheckout, {
        planId: gym.planId,
        months: 3,
      });

    const [session] = await t.run((ctx) =>
      ctx.db.query("memberPaymentCheckoutSessions").collect(),
    );
    fake.onJson(
      "GET /v1/payments/*",
      paymentResponse({
        external_reference: session!.externalReference,
        transaction_amount: advance.amountArs,
        collector_id: SELLER_A.userId,
      }),
    );
    await postSignedWebhook(t, { topic: "payment", resourceId: "7000000001" });

    const [entry] = await readLedger(t);
    expect(entry!.collectionMode).toBe("marketplace_split");
    // Mercado Pago already took it; it must not appear on an invoice too.
    expect(entry!.status).toBe("collected");
    expect(entry!.collectedAt).toBeGreaterThan(0);
  });

  it("reconciles gross, provider fee, MAT fee and gym net", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);

    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    const providerFeeArs = transaction!.providerFeeArs ?? 0;
    const platformFeeArs = transaction!.platformFeeArs ?? 0;

    expect(transaction!.gymNetAmountArs).toBe(
      transaction!.grossAmountArs - providerFeeArs - platformFeeArs,
    );
    expect(platformFeeArs).toBe(computeCommissionArs(PRICE, 250));
  });
});

describe("monthly settlement", () => {
  it("aggregates a closed month and marks the entries collected", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym, 5000000001);
    const period = await backdateLedger(t);

    const result = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    expect(result.settledOrganizations).toBe(1);
    expect(result.totalFeeArs).toBe(computeCommissionArs(PRICE, 250));

    const [entry] = await readLedger(t);
    expect(entry!.status).toBe("collected");
    expect(entry!.settlementPeriod).toBe(period);
    expect(entry!.settlementReference).toBe(
      buildSettlementReference(String(gym.organizationId), period),
    );
  });

  it("cannot invoice the same month twice", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);
    await backdateLedger(t);

    const first = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );
    const second = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    expect(first.settledOrganizations).toBe(1);
    expect(second.settledOrganizations).toBe(0);
    expect(second.totalFeeArs).toBe(0);
  });

  it("leaves the month in progress alone", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);

    // Not backdated: the charge belongs to the month still accumulating.
    const result = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    expect(result.settledOrganizations).toBe(0);
    expect((await readLedger(t))[0]!.status).toBe("accrued");
  });

  it("nets a refund against the month it was raised in", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);

    // The same charge is reversed.
    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        id: 5000000001,
        preapproval_id: PREAPPROVAL_ID,
        external_reference: gym.externalReference,
        transaction_amount: PRICE,
        payment_status: "refunded",
        payment_id: 7000000001,
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId: "req-refund",
    });

    await backdateLedger(t);
    const result = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    // Accrual and its reversal cancel out: nothing is owed for the month.
    expect(result.totalFeeArs).toBe(0);
    const entries = await readLedger(t);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.status).toBe("collected");
    }
  });

  it("skips a gym whose plan charges no commission", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      platformFeeBps: 0,
      feeCollectionMode: "none",
    });
    await chargeApproved(t, gym);
    await backdateLedger(t);

    const result = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    expect(result.settledOrganizations).toBe(0);
    // The entry is still there for auditing, just not billable.
    expect((await readLedger(t))[0]!.status).toBe("not_applicable");
  });

  it("does not resettle a month when the rate changes afterwards", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await chargeApproved(t, gym);
    await backdateLedger(t);
    await t.mutation(internal.platformCommissions.settleMonthlyCommissions, {});

    // MAT raises the rate afterwards. Settled history must not move.
    await t.run(async (ctx) => {
      const [plan] = await ctx.db.query("appBillingPlans").collect();
      await ctx.db.patch(plan!._id, {
        entitlements: {
          ...plan!.entitlements,
          memberPayments: {
            mercadoPagoEnabled: true,
            platformFeeBps: 1_000,
            feeCollectionMode: "monthly_gym_invoice",
          },
        },
      });
    });

    const rerun = await t.mutation(
      internal.platformCommissions.settleMonthlyCommissions,
      {},
    );

    expect(rerun.settledOrganizations).toBe(0);
    expect((await readLedger(t))[0]!.platformFeeBps).toBe(250);
    expect((await readLedger(t))[0]!.feeAmountArs).toBe(
      computeCommissionArs(PRICE, 250),
    );
  });
});

describe("settlement reporting", () => {
  it("is visible only to super admins", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    await expect(
      t
        .withIdentity({ subject: ADMIN })
        .query(api.platformCommissions.listSettlements, {}),
    ).rejects.toThrow(/Super admin/i);
  });

  it("reports accrued and collected totals per gym", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { platformFeeBps: 250 });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        externalId: SUPER_ADMIN,
        isSuperAdmin: true,
        activeOrganizationId: gym.organizationId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await chargeApproved(t, gym);
    await backdateLedger(t);
    await t.mutation(internal.platformCommissions.settleMonthlyCommissions, {});

    const settlements = await t
      .withIdentity({ subject: SUPER_ADMIN })
      .query(api.platformCommissions.listSettlements, {});

    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.status).toBe("collected");
    expect(settlements[0]!.feeAmountArs).toBe(computeCommissionArs(PRICE, 250));
    expect(settlements[0]!.grossAmountArs).toBe(PRICE);
    expect(settlements[0]!.entryCount).toBe(1);
  });
});
