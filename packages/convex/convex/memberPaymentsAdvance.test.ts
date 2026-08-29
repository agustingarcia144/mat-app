import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import { DAY_MS } from "./billingDomain";
import { FakeMercadoPago, errorResponse } from "./mercadoPago.fake";
import { paymentResponse, preferenceResponse, SELLER_A } from "./mercadoPago.fixtures";
import {
  ADMIN,
  FAMILY_CHILD,
  MEMBER,
  ROUTING_KEY,
  postSignedWebhook,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const PRICE = 30_000;
const PAYMENT_ID = "7000000001";

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Gym = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  planId: Id<"membershipPlans">;
};

type SeedOptions = {
  billingMode?: "calendar" | "join_date";
  feeCollectionMode?: "none" | "marketplace_split" | "monthly_gym_invoice";
  platformFeeBps?: number;
  advanceDiscounts?: Array<{ months: number; discountPercentage: number }>;
};

async function seedGym(t: TestConvex, options: SeedOptions = {}): Promise<Gym> {
  const credentials = await testCredentials();

  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "Gym A",
      slug: `gym-${now}-${Math.random()}`,
      timezone: "America/Argentina/Buenos_Aires",
      createdAt: now,
      updatedAt: now,
    });

    for (const [userId, role] of [
      [ADMIN, "admin"],
      [MEMBER, "member"],
      [FAMILY_CHILD, "member"],
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
      billingMode: options.billingMode ?? "join_date",
      advancePaymentDiscounts: options.advanceDiscounts ?? [
        { months: 3, discountPercentage: 10 },
        { months: 6, discountPercentage: 15 },
        { months: 12, discountPercentage: 20 },
      ],
      isActive: true,
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId, connectionId, planId };
  });
}

function fakeCheckout(options: { amountArs?: number } = {}) {
  const fake = new FakeMercadoPago();
  fake.onJson("POST /checkout/preferences", preferenceResponse());
  __setMercadoPagoTransportForTests(fake.transport);
  return fake;
}

async function startAdvance(t: TestConvex, gym: Gym, months: number) {
  return await t
    .withIdentity({ subject: MEMBER })
    .action(api.memberPaymentsActions.startAdvanceCheckout, {
      planId: gym.planId,
      months,
    });
}

async function approvePayment(
  t: TestConvex,
  externalReference: string,
  fake: FakeMercadoPago,
  options: { amountArs: number; status?: "approved" | "rejected" },
) {
  fake.onJson(
    "GET /v1/payments/*",
    paymentResponse({
      id: Number(PAYMENT_ID),
      external_reference: externalReference,
      transaction_amount: options.amountArs,
      status: options.status ?? "approved",
      collector_id: SELLER_A.userId,
    }),
  );

  return await postSignedWebhook(t, { topic: "payment", resourceId: PAYMENT_ID });
}

const readSessions = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("memberPaymentCheckoutSessions").collect());
const readAgreements = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("memberRecurringAgreements").collect());
const readPayments = (t: TestConvex) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("planPayments").collect();
    return rows.sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod));
  });
const readSubscriptions = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("memberPlanSubscriptions").collect());
const readLedger = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("platformCommissionLedger").collect());

describe("starting an advance checkout", () => {
  it("prices 3, 6 and 12 months from the plan's own discount tiers", async () => {
    for (const [months, discount] of [
      [3, 10],
      [6, 15],
      [12, 20],
    ] as const) {
      const t = convexTest(schema, modules);
      const gym = await seedGym(t);
      const fake = fakeCheckout();

      const result = await startAdvance(t, gym, months);

      const expected = Math.round(PRICE * (1 - discount / 100)) * months;
      expect(result.amountArs).toBe(expected);
      expect((fake.requests[0]!.body as any).items[0].unit_price).toBe(expected);
    }
  });

  it("refuses a term the plan does not offer", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      advanceDiscounts: [{ months: 3, discountPercentage: 10 }],
    });
    fakeCheckout();

    await expect(startAdvance(t, gym, 6)).rejects.toThrow(/6 meses/);
    expect(await readSessions(t)).toHaveLength(0);
  });

  it("never creates a recurring agreement", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeCheckout();

    await startAdvance(t, gym, 6);

    expect(await readAgreements(t)).toHaveLength(0);
    const [session] = await readSessions(t);
    expect(session!.kind).toBe("advance_purchase");
    expect(session!.months).toBe(6);
  });

  it("sends the split fee only when the policy is a marketplace split", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, {
      feeCollectionMode: "marketplace_split",
      platformFeeBps: 250,
    });
    const fake = fakeCheckout();

    const result = await startAdvance(t, gym, 3);

    // 2.5% of the discounted total.
    expect((fake.requests[0]!.body as any).marketplace_fee).toBe(
      Math.round(result.amountArs * 0.025),
    );
  });

  it("accrues the fee instead of splitting it under monthly invoicing", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { feeCollectionMode: "monthly_gym_invoice" });
    const fake = fakeCheckout();

    await startAdvance(t, gym, 3);

    expect((fake.requests[0]!.body as any).marketplace_fee).toBeUndefined();
  });

  it("quotes the same total the checkout charges", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeCheckout();

    const quote = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getAvailablePaymentMethods, {
        planId: gym.planId,
      });
    const charged = await startAdvance(t, gym, 6);

    const quoted = quote!.advanceOptions.find((option) => option.months === 6)!;
    expect(quoted.totalArs).toBe(charged.amountArs);
  });

  it("fails the session cleanly when the provider rejects the request", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = new FakeMercadoPago();
    fake.on("POST /checkout/preferences", errorResponse(400, { message: "bad" }));
    __setMercadoPagoTransportForTests(fake.transport);

    await expect(startAdvance(t, gym, 3)).rejects.toThrow(/No pudimos iniciar/);

    expect((await readSessions(t))[0]!.status).toBe("failed");
    expect(await readPayments(t)).toHaveLength(0);
  });
});

describe("advance coverage from an approved payment", () => {
  for (const months of [3, 6, 12]) {
    for (const billingMode of ["join_date", "calendar"] as const) {
      it(`covers ${months} contiguous ${billingMode} cycles`, async () => {
        const t = convexTest(schema, modules);
        const gym = await seedGym(t, { billingMode });
        const fake = fakeCheckout();
        const { amountArs } = await startAdvance(t, gym, months);
        const [session] = await readSessions(t);

        await approvePayment(t, session!.externalReference, fake, { amountArs });

        const payments = await readPayments(t);
        expect(payments).toHaveLength(months);

        // Every month approved, one group, one provider transaction.
        const groupIds = new Set(
          payments.map((payment) => payment.advancePaymentGroupId),
        );
        expect(groupIds.size).toBe(1);
        expect([...groupIds][0]).toBeTruthy();
        for (const payment of payments) {
          expect(payment.status).toBe("approved");
          expect(payment.paymentMethod).toBe("mercadopago_checkout");
          expect(payment.providerTransactionId).toBeTruthy();
        }

        // No duplicate periods, and coverage is contiguous.
        expect(
          new Set(payments.map((payment) => payment.billingPeriod)).size,
        ).toBe(months);
        for (let index = 1; index < payments.length; index += 1) {
          expect(payments[index]!.billingCycleStartAt).toBe(
            payments[index - 1]!.billingCycleEndAt,
          );
        }

        // The months add up to exactly what the member paid.
        expect(
          payments.reduce((sum, payment) => sum + payment.amountArs, 0),
        ).toBe(amountArs);
      });
    }
  }

  it("activates the member and records one commission entry", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeCheckout();
    const { amountArs } = await startAdvance(t, gym, 3);
    const [session] = await readSessions(t);

    await approvePayment(t, session!.externalReference, fake, { amountArs });

    const [subscription] = await readSubscriptions(t);
    expect(subscription!.status).toBe("active");
    expect(subscription!.paymentMode).toBe("mercadopago_one_time");

    const ledger = await readLedger(t);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.feeAmountArs).toBe(Math.round(amountArs * 0.025));

    // Fees are snapshotted on the transaction, which all rows point at.
    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transaction!.kind).toBe("advance");
    expect(transaction!.providerFeeArs).toBeGreaterThan(0);
    expect(transaction!.gymNetAmountArs).toBeLessThan(amountArs);
  });

  it("produces no duplicate periods when the notification is redelivered", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeCheckout();
    const { amountArs } = await startAdvance(t, gym, 6);
    const [session] = await readSessions(t);

    await approvePayment(t, session!.externalReference, fake, { amountArs });
    await approvePayment(t, session!.externalReference, fake, { amountArs });

    expect(await readPayments(t)).toHaveLength(6);
    expect(await readLedger(t)).toHaveLength(1);
  });

  it("starts at the first month the member has not already paid", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeCheckout();
    const { amountArs } = await startAdvance(t, gym, 3);
    const [session] = await readSessions(t);

    // The current month was already settled by transfer.
    const alreadyPaidPeriod = await t.run(async (ctx) => {
      const now = new Date();
      const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      await ctx.db.insert("planPayments", {
        organizationId: gym.organizationId,
        userId: MEMBER,
        subscriptionId: session!.subscriptionId!,
        planId: gym.planId,
        billingPeriod,
        amountArs: PRICE,
        paymentMethod: "bank_transfer",
        status: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return billingPeriod;
    });

    await approvePayment(t, session!.externalReference, fake, { amountArs });

    const advanceRows = (await readPayments(t)).filter(
      (payment) => payment.advancePaymentGroupId !== undefined,
    );
    expect(advanceRows).toHaveLength(3);
    // The month already paid is not overwritten or double-charged.
    expect(
      advanceRows.some((row) => row.billingPeriod === alreadyPaidPeriod),
    ).toBe(false);
  });

  it("grants no coverage for a rejected payment", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeCheckout();
    const { amountArs } = await startAdvance(t, gym, 3);
    const [session] = await readSessions(t);

    await approvePayment(t, session!.externalReference, fake, {
      amountArs,
      status: "rejected",
    });

    expect(await readPayments(t)).toHaveLength(0);
    expect((await readSubscriptions(t))[0]!.status).toBe("pending_payment");
    expect((await readSessions(t))[0]!.status).toBe("failed");
  });

  it("grants no coverage when the charged amount was not the quoted one", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeCheckout();
    await startAdvance(t, gym, 3);
    const [session] = await readSessions(t);

    await approvePayment(t, session!.externalReference, fake, {
      amountArs: 1_000,
    });

    expect(await readPayments(t)).toHaveLength(0);
    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transaction!.requiresAttention).toBe(true);
  });

  it("grants no coverage for an abandoned checkout", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeCheckout();
    const { sessionId } = await startAdvance(t, gym, 3);

    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.cancelMyCheckoutSession, {
        sessionId,
      });

    expect(await readPayments(t)).toHaveLength(0);
    expect((await readSessions(t))[0]!.status).toBe("cancelled");
  });
});

describe("advance bank transfer grouping", () => {
  async function activateWithAdvance(t: TestConvex, gym: Gym, months: number) {
    return await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPlanSubscriptions.activate, {
        planId: gym.planId,
        advanceMonths: months,
      });
  }

  it("creates one reviewable group instead of independent months", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    await activateWithAdvance(t, gym, 6);

    const payments = await readPayments(t);
    expect(payments).toHaveLength(6);
    const groupIds = new Set(
      payments.map((payment) => payment.advancePaymentGroupId),
    );
    expect(groupIds.size).toBe(1);
    for (const payment of payments) {
      expect(payment.status).toBe("pending");
      // 10% off for three months, 15% for six.
      expect(payment.amountArs).toBe(Math.round(PRICE * 0.85));
    }
  });

  it("puts every month of the group into review from one receipt", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await activateWithAdvance(t, gym, 3);

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["receipt"])),
    );
    const [first] = await readPayments(t);
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.planPayments.uploadProof, {
        paymentId: first!._id,
        storageId,
        fileName: "comprobante.png",
        contentType: "image/png",
      });

    const payments = await readPayments(t);
    for (const payment of payments) {
      expect(payment.status).toBe("in_review");
      expect(payment.proofStorageId).toBe(storageId);
      expect(payment.proofFileName).toBe("comprobante.png");
    }
  });

  it("approves the whole purchase from one review", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await activateWithAdvance(t, gym, 3);

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["receipt"])),
    );
    const [first] = await readPayments(t);
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.planPayments.uploadProof, {
        paymentId: first!._id,
        storageId,
        fileName: "comprobante.png",
        contentType: "image/png",
      });

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.planPayments.approve, { paymentId: first!._id });

    const payments = await readPayments(t);
    expect(payments).toHaveLength(3);
    for (const payment of payments) {
      expect(payment.status).toBe("approved");
    }
    expect((await readSubscriptions(t))[0]!.status).toBe("active");
  });

  it("declines the whole purchase from one review", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await activateWithAdvance(t, gym, 3);

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["receipt"])),
    );
    const [first] = await readPayments(t);
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.planPayments.uploadProof, {
        paymentId: first!._id,
        storageId,
        fileName: "comprobante.png",
        contentType: "image/png",
      });

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.planPayments.decline, {
        paymentId: first!._id,
        notes: "Comprobante ilegible",
      });

    const payments = await readPayments(t);
    for (const payment of payments) {
      expect(payment.status).toBe("declined");
      expect(payment.reviewNotes).toBe("Comprobante ilegible");
    }
  });

  it("leaves a single-month payment untouched by grouping", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPlanSubscriptions.activate, { planId: gym.planId });

    // A monthly subscription creates no advance rows at activation.
    expect(await readPayments(t)).toHaveLength(0);

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["receipt"])),
    );
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.planPayments.uploadProof, {
        storageId,
        fileName: "comprobante.png",
        contentType: "image/png",
      });

    const payments = await readPayments(t);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.advancePaymentGroupId).toBeUndefined();
    expect(payments[0]!.status).toBe("in_review");
  });
});
