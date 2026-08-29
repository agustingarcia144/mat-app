import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import { computeGraceUntil, DAY_MS } from "./billingDomain";
import { FakeMercadoPago } from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  SELLER_A,
} from "./mercadoPago.fixtures";
import {
  ADMIN,
  FAMILY_CHILD,
  MEMBER,
  PREAPPROVAL_ID,
  ROUTING_KEY,
  postSignedWebhook,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const GRACE_DAYS = 5;
const AMOUNT = 30_000;

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Fixture = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  childSubscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
  planId: Id<"membershipPlans">;
  externalReference: string;
};

/** A gym with an already-active recurring member and one family child. */
async function seedActiveMember(
  t: TestConvex,
  options: { withFamilyChild?: boolean } = {},
): Promise<Fixture> {
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
          platformFeeBps: 250,
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
        gracePeriodDays: GRACE_DAYS,
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
      priceArs: AMOUNT,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      billingMode: "join_date",
      isActive: true,
      createdBy: ADMIN,
      createdAt: now,
      updatedAt: now,
    });

    const activatedAt = now - 40 * DAY_MS;
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: MEMBER,
      planId,
      status: "active",
      activatedAt,
      billingAnchorAt: activatedAt,
      paymentMode: "mercadopago_recurring",
      createdAt: activatedAt,
      updatedAt: activatedAt,
    });

    let childSubscriptionId = subscriptionId;
    if (options.withFamilyChild !== false) {
      childSubscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
        organizationId,
        userId: FAMILY_CHILD,
        planId,
        familyParentSubscriptionId: subscriptionId,
        status: "active",
        activatedAt,
        paymentMode: "mercadopago_recurring",
        createdAt: activatedAt,
        updatedAt: activatedAt,
      });
    }

    const externalReference = `mat_sub_${organizationId}_${subscriptionId}_abcdef01`;
    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId,
      connectionId,
      subscriptionId,
      payerUserId: MEMBER,
      providerPreapprovalId: PREAPPROVAL_ID,
      externalReference,
      status: "active",
      amountArs: AMOUNT,
      currency: "ARS",
      familyMemberCount: options.withFamilyChild === false ? 1 : 2,
      billingAnchorAt: activatedAt,
      currentPeriodStart: now - 10 * DAY_MS,
      currentPeriodEnd: now + 20 * DAY_MS,
      nextChargeAt: now + 20 * DAY_MS,
      createdAt: activatedAt,
      updatedAt: activatedAt,
    });

    return {
      organizationId,
      connectionId,
      subscriptionId,
      childSubscriptionId,
      agreementId,
      planId,
      externalReference,
    };
  });
}

function chargeFake(
  fixture: Fixture,
  charge: {
    paymentStatus: "approved" | "rejected" | "refunded";
    id?: number;
    amountArs?: number;
  },
) {
  const fake = new FakeMercadoPago();
  fake.onJson(
    "GET /authorized_payments/*",
    authorizedPaymentResponse({
      id: charge.id ?? 5000000001,
      preapproval_id: PREAPPROVAL_ID,
      external_reference: fixture.externalReference,
      transaction_amount: charge.amountArs ?? AMOUNT,
      payment_status: charge.paymentStatus,
      payment_id: (charge.id ?? 5000000001) + 2_000_000_000,
    }),
  );
  __setMercadoPagoTransportForTests(fake.transport);
  return fake;
}

const postCharge = (t: TestConvex, resourceId = "5000000001") =>
  postSignedWebhook(t, {
    topic: "subscription_authorized_payment",
    resourceId,
  });

const readAgreement = (t: TestConvex, id: Id<"memberRecurringAgreements">) =>
  t.run((ctx) => ctx.db.get(id));
const readSubscription = (t: TestConvex, id: Id<"memberPlanSubscriptions">) =>
  t.run((ctx) => ctx.db.get(id));
const readPlanPayments = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("planPayments").collect());
const readLedger = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("platformCommissionLedger").collect());

describe("approved renewal", () => {
  it("records exactly one payment for the anchored cycle", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "approved" });

    await postCharge(t);

    const payments = await readPlanPayments(t);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("approved");
    expect(payments[0]!.paymentMethod).toBe("mercadopago_recurring");
    expect(payments[0]!.amountArs).toBe(AMOUNT);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("active");
    expect(agreement!.nextChargeAt).toBe(agreement!.currentPeriodEnd);
  });

  it("does not duplicate the row when the same charge is redelivered", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "approved" });

    await postCharge(t);
    await postCharge(t);

    expect(await readPlanPayments(t)).toHaveLength(1);
    expect(await readLedger(t)).toHaveLength(1);
  });
});

describe("failed renewal and grace", () => {
  it("keeps access and opens a grace window anchored to the first failure", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });

    const before = Date.now();
    await postCharge(t);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("retrying");
    expect(agreement!.lastPaymentStatus).toBe("rejected");
    expect(agreement!.firstFailureAt).toBeGreaterThanOrEqual(before);
    expect(agreement!.graceUntil).toBe(
      computeGraceUntil(agreement!.firstFailureAt!, GRACE_DAYS),
    );

    // The member keeps training while their card is retried.
    const subscription = await readSubscription(t, fixture.subscriptionId);
    expect(subscription!.status).toBe("active");
    const child = await readSubscription(t, fixture.childSubscriptionId);
    expect(child!.status).toBe("active");
  });

  it("never moves the deadline forward, however many retries fail", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);

    chargeFake(fixture, { paymentStatus: "rejected", id: 5000000001 });
    await postCharge(t, "5000000001");
    const firstDeadline = (await readAgreement(t, fixture.agreementId))!
      .graceUntil;
    const firstFailureAt = (await readAgreement(t, fixture.agreementId))!
      .firstFailureAt;

    // Mercado Pago retries the same subscription several times.
    for (const [index, id] of [5000000002, 5000000003, 5000000004].entries()) {
      chargeFake(fixture, { paymentStatus: "rejected", id });
      await postSignedWebhook(t, {
        topic: "subscription_authorized_payment",
        resourceId: String(id),
        requestId: `retry-${index}`,
      });
    }

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.graceUntil).toBe(firstDeadline);
    expect(agreement!.firstFailureAt).toBe(firstFailureAt);
    expect(agreement!.status).toBe("retrying");
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");
  });

  it("does not suspend one second before the deadline", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);

    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() + 1_000 }),
    );
    const result = await t.mutation(
      internal.memberPayments.expireMemberPaymentGracePeriods,
      {},
    );

    expect(result.suspended).toBe(0);
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");
  });

  it("suspends the whole family group once the deadline passes", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);

    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );
    const result = await t.mutation(
      internal.memberPayments.expireMemberPaymentGracePeriods,
      {},
    );

    expect(result.suspended).toBe(1);
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("suspended");
    expect(
      (await readSubscription(t, fixture.childSubscriptionId))!.status,
    ).toBe("suspended");
    // The agreement stays in retry: the provider may still collect.
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "retrying",
    );
  });

  it("does not re-process an agreement whose grace was already acted on", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );

    await t.mutation(internal.memberPayments.expireMemberPaymentGracePeriods, {});
    const second = await t.mutation(
      internal.memberPayments.expireMemberPaymentGracePeriods,
      {},
    );

    expect(second.examined).toBe(0);
    // The audit anchor survives so a later failure cannot open a new window.
    expect(
      (await readAgreement(t, fixture.agreementId))!.firstFailureAt,
    ).toBeGreaterThan(0);
  });

  it("does not open a second grace window after suspension", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );
    await t.mutation(internal.memberPayments.expireMemberPaymentGracePeriods, {});

    chargeFake(fixture, { paymentStatus: "rejected", id: 5000000009 });
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000009",
    });

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.graceUntil).toBeUndefined();
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("suspended");
  });

  it("grants no grace before the first payment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.agreementId, {
        status: "pending_first_payment",
      });
      await ctx.db.patch(fixture.subscriptionId, { status: "pending_payment" });
    });

    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("pending_first_payment");
    expect(agreement!.graceUntil).toBeUndefined();
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("pending_payment");
  });
});

describe("recovery", () => {
  it("restores access for the whole family when a retry finally succeeds", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);

    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );
    await t.mutation(internal.memberPayments.expireMemberPaymentGracePeriods, {});
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("suspended");

    chargeFake(fixture, { paymentStatus: "approved", id: 5000000010 });
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000010",
    });

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("active");
    expect(agreement!.firstFailureAt).toBeUndefined();
    expect(agreement!.graceUntil).toBeUndefined();

    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");
    expect(
      (await readSubscription(t, fixture.childSubscriptionId))!.status,
    ).toBe("active");

    const payments = await readPlanPayments(t);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("approved");
  });

  it("reports the billing problem to the member while access continues", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);

    const state = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});

    expect(state!.subscriptionStatus).toBe("active");
    expect(state!.billingState).toBe("retrying");
    expect(state!.graceUntil).toBeGreaterThan(Date.now());
    expect(state!.lastPaymentStatus).toBe("rejected");
  });

  it("tells the member the grace window has closed even before the worker runs", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );

    const state = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});
    expect(state!.billingState).toBe("grace_expired");
  });

  it("shows a family child that they are not the payer", async () => {
    const t = convexTest(schema, modules);
    await seedActiveMember(t);

    const state = await t
      .withIdentity({ subject: FAMILY_CHILD })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});
    expect(state!.isFamilyChild).toBe(true);
    expect(state!.isPayer).toBe(false);
  });
});

describe("legacy hourly suspension", () => {
  it("never suspends a provider-managed member who is inside grace", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "rejected" });
    await postCharge(t);

    // The hourly transfer-oriented pass runs while grace is still open.
    await t.mutation(internal.memberPlanSubscriptions.autoSuspendUnpaidForOrg, {
      orgId: fixture.organizationId,
    });

    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");
  });

  it("still suspends an unpaid manual subscription", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);

    // Same member, but paying by transfer and with no provider agreement.
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.subscriptionId, {
        paymentMode: "manual",
        activatedAt: Date.now() - 400 * DAY_MS,
      });
      await ctx.db.delete(fixture.agreementId);
    });

    const result = await t.mutation(
      internal.memberPlanSubscriptions.autoSuspendUnpaidForOrg,
      { orgId: fixture.organizationId },
    );

    expect(result.suspendedCount).toBeGreaterThan(0);
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("suspended");
  });
});

describe("refunds and chargebacks", () => {
  async function approvedThenReversed(
    t: TestConvex,
    fixture: Fixture,
    status: "refunded" | "charged_back",
  ) {
    chargeFake(fixture, { paymentStatus: "approved" });
    await postCharge(t);

    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        id: 5000000001,
        preapproval_id: PREAPPROVAL_ID,
        external_reference: fixture.externalReference,
        transaction_amount: AMOUNT,
        payment_status: status === "refunded" ? "refunded" : "charged_back",
        payment_id: 7000000001,
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);

    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId: "req-reversal",
    });
  }

  it("removes current coverage and suspends the group on a refund", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    await approvedThenReversed(t, fixture, "refunded");

    const payments = await readPlanPayments(t);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("declined");
    expect(payments[0]!.reviewNotes).toContain("devuelto");

    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("suspended");
    expect(
      (await readSubscription(t, fixture.childSubscriptionId))!.status,
    ).toBe("suspended");
  });

  it("adds a compensating ledger entry rather than editing the original", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    await approvedThenReversed(t, fixture, "refunded");

    const entries = await readLedger(t);
    expect(entries).toHaveLength(2);

    const original = entries.find((entry) => entry.feeAmountArs > 0)!;
    const reversal = entries.find((entry) => entry.feeAmountArs < 0)!;
    expect(original.feeAmountArs).toBe(750);
    expect(reversal.feeAmountArs).toBe(-750);
    expect(reversal.reversesLedgerId).toBe(original._id);
    // The accrual that already happened is left exactly as it was.
    expect(original.status).toBe("accrued");
  });

  it("flags the transaction for a human", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    await approvedThenReversed(t, fixture, "charged_back");

    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transaction!.status).toBe("charged_back");
    expect(transaction!.requiresAttention).toBe(true);
    expect(transaction!.attentionReason).toContain("charged_back");
  });

  it("does not rewrite a period that has already closed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "approved" });
    await postCharge(t);

    // The covered period ended months ago; later months were paid separately.
    const [payment] = await readPlanPayments(t);
    await t.run((ctx) =>
      ctx.db.patch(payment!._id, {
        billingCycleEndAt: Date.now() - 60 * DAY_MS,
      }),
    );

    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        id: 5000000001,
        preapproval_id: PREAPPROVAL_ID,
        external_reference: fixture.externalReference,
        transaction_amount: AMOUNT,
        payment_status: "refunded",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId: "req-historical",
    });

    // Closed history is untouched, and access is not silently revoked.
    const [after] = await readPlanPayments(t);
    expect(after!.status).toBe("approved");
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");

    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transaction!.requiresAttention).toBe(true);
    expect(transaction!.attentionReason).toContain("closed period");
    // The commission is still reversed.
    expect((await readLedger(t)).some((entry) => entry.feeAmountArs < 0)).toBe(
      true,
    );
  });

  it("keeps access when another approved payment still covers the period", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedActiveMember(t);
    chargeFake(fixture, { paymentStatus: "approved" });
    await postCharge(t);

    // A transfer for the same period was also approved (an overlap the gym
    // resolves manually); the refund must not lock the member out.
    const [payment] = await readPlanPayments(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("planPayments", {
        organizationId: fixture.organizationId,
        userId: MEMBER,
        subscriptionId: fixture.subscriptionId,
        planId: fixture.planId,
        billingPeriod: payment!.billingPeriod,
        amountArs: AMOUNT,
        paymentMethod: "bank_transfer",
        status: "approved",
        createdAt: now,
        updatedAt: now,
      });
    });

    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        id: 5000000001,
        preapproval_id: PREAPPROVAL_ID,
        external_reference: fixture.externalReference,
        transaction_amount: AMOUNT,
        payment_status: "refunded",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId: "req-refund-covered",
    });

    expect(
      (await readSubscription(t, fixture.subscriptionId))!.status,
    ).toBe("active");
  });
});
