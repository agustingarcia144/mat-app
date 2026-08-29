import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  buildWebhookSignatureManifest,
  evaluatePaymentMethods,
  type MethodAvailabilityInput,
} from "./memberPaymentDomain";
import { encryptSecret, hmacSha256Hex } from "./memberPaymentsCrypto";
import {
  FakeMercadoPago,
  MercadoPagoNetworkError,
  errorResponse,
  jsonResponse,
} from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  preapprovalResponse,
  providerErrors,
  SELLER_A,
} from "./mercadoPago.fixtures";

import { drainScheduled } from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const ADMIN = "user_admin";
const MEMBER = "user_member";
const FAMILY_CHILD = "user_child";
const ROUTING_KEY = "routing-key-gym-a";
const WEBHOOK_SECRET = "test-webhook-secret";
const TEST_KEY = btoa("0123456789abcdef0123456789abcdef");
const PREAPPROVAL_ID = "2c9380848a1b2c3d";

beforeEach(() => {
  process.env.MEMBER_MP_PAYMENTS_ENABLED = "true";
  process.env.MERCADOPAGO_CLIENT_ID = "test-client-id";
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-client-secret";
  process.env.MEMBER_PAYMENTS_OAUTH_REDIRECT_URL =
    "https://deployment.convex.site/member-payments/oauth/callback";
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY = TEST_KEY;
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION = "v1";
  process.env.MEMBER_PAYMENTS_WEB_APP_URL = "https://app.matgestion.app";
  process.env.MEMBER_PAYMENTS_WEBHOOK_BASE_URL = "https://deployment.convex.site";
  process.env.MEMBER_PAYMENTS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MEMBER_PAYMENTS_MOBILE_RETURN_URL =
    "https://matgestion.app/payments/return";
});

afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

// ---------------------------------------------------------------------------
// Eligibility rules (pure)
// ---------------------------------------------------------------------------

const ELIGIBLE: MethodAvailabilityInput = {
  killSwitchEnabled: true,
  mercadoPagoEntitled: true,
  bankTransferEnabled: true,
  mercadoPagoRecurringEnabled: true,
  mercadoPagoOneTimeEnabled: true,
  connectionUsable: true,
  planBillingMode: "join_date",
  planHasInterestTiers: false,
  planHasAdvanceDiscounts: true,
  isFamilyChild: false,
  hasLiveRecurringAgreement: false,
};

const methodFor = (input: MethodAvailabilityInput, method: string) =>
  evaluatePaymentMethods(input).find((option) => option.method === method)!;

describe("payment method eligibility", () => {
  it("offers everything when every condition is met", () => {
    for (const option of evaluatePaymentMethods(ELIGIBLE)) {
      expect(option.available).toBe(true);
      expect(option.reason).toBeUndefined();
    }
  });

  it("hides Mercado Pago behind the runtime kill switch", () => {
    const input = { ...ELIGIBLE, killSwitchEnabled: false };
    expect(methodFor(input, "mercadopago_recurring").available).toBe(false);
    expect(methodFor(input, "mercadopago_checkout").available).toBe(false);
    // Transfer keeps working: the switch stops card payments, not the gym.
    expect(methodFor(input, "bank_transfer").available).toBe(true);
  });

  it("requires the gym's MAT plan to include member Mercado Pago", () => {
    const input = { ...ELIGIBLE, mercadoPagoEntitled: false };
    expect(methodFor(input, "mercadopago_recurring").available).toBe(false);
    expect(methodFor(input, "mercadopago_checkout").available).toBe(false);
  });

  it("requires a connected seller account", () => {
    const input = { ...ELIGIBLE, connectionUsable: false };
    expect(methodFor(input, "mercadopago_recurring").reason).toContain(
      "no conectó",
    );
  });

  it("offers recurring debit only on join-date plans", () => {
    const input = { ...ELIGIBLE, planBillingMode: "calendar" as const };
    const recurring = methodFor(input, "mercadopago_recurring");
    expect(recurring.available).toBe(false);
    expect(recurring.reason).toContain("fecha de alta");
    // Calendar plans can still pay in advance with a one-time checkout.
    expect(methodFor(input, "mercadopago_checkout").available).toBe(true);
  });

  it("refuses recurring debit on a plan that charges late-payment interest", () => {
    const input = { ...ELIGIBLE, planHasInterestTiers: true };
    const recurring = methodFor(input, "mercadopago_recurring");
    expect(recurring.available).toBe(false);
    expect(recurring.reason).toContain("intereses");
    // One-time and transfer flows keep late fees.
    expect(methodFor(input, "mercadopago_checkout").available).toBe(true);
    expect(methodFor(input, "bank_transfer").available).toBe(true);
  });

  it("lets only the family payer pay", () => {
    const input = { ...ELIGIBLE, isFamilyChild: true };
    for (const option of evaluatePaymentMethods(input)) {
      expect(option.available).toBe(false);
      expect(option.reason).toContain("titular");
    }
  });

  it("refuses a second live agreement", () => {
    const input = { ...ELIGIBLE, hasLiveRecurringAgreement: true };
    expect(methodFor(input, "mercadopago_recurring").available).toBe(false);
    expect(methodFor(input, "mercadopago_recurring").reason).toContain(
      "débito automático en curso",
    );
  });

  it("hides advance purchase on a plan with no configured discounts", () => {
    const input = { ...ELIGIBLE, planHasAdvanceDiscounts: false };
    expect(methodFor(input, "mercadopago_checkout").available).toBe(false);
    expect(methodFor(input, "mercadopago_recurring").available).toBe(true);
  });

  it("respects the gym's own method toggles", () => {
    expect(
      methodFor({ ...ELIGIBLE, bankTransferEnabled: false }, "bank_transfer")
        .available,
    ).toBe(false);
    expect(
      methodFor(
        { ...ELIGIBLE, mercadoPagoRecurringEnabled: false },
        "mercadopago_recurring",
      ).available,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end checkout
// ---------------------------------------------------------------------------

type T = ReturnType<typeof convexTest>;

type Gym = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  planId: Id<"membershipPlans">;
};

type SeedOptions = {
  billingMode?: "calendar" | "join_date";
  interestTiers?: boolean;
  mercadoPagoEntitled?: boolean;
  recurringEnabled?: boolean;
  withConnection?: boolean;
  planPriceArs?: number;
};

async function seedGym(t: T, options: SeedOptions = {}): Promise<Gym> {
  const credentials = await Promise.all([
    encryptSecret("TEST-gym-token", { key: TEST_KEY, keyVersion: "v1" }),
    encryptSecret("TG-gym-refresh", { key: TEST_KEY, keyVersion: "v1" }),
  ]);

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
          mercadoPagoEnabled: options.mercadoPagoEntitled ?? true,
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
        mercadoPagoRecurringEnabled: options.recurringEnabled ?? true,
        mercadoPagoOneTimeEnabled: true,
        gracePeriodDays: 5,
        initialPaymentRequiresApproval: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    let connectionId = "" as Id<"organizationPaymentProviderConnections">;
    if (options.withConnection !== false) {
      connectionId = await ctx.db.insert(
        "organizationPaymentProviderConnections",
        {
          organizationId,
          provider: "mercadopago",
          status: "active",
          providerAccountId: String(SELLER_A.userId),
          providerNickname: SELLER_A.nickname,
          accessTokenCiphertext: credentials[0]!.ciphertext,
          accessTokenIv: credentials[0]!.iv,
          refreshTokenCiphertext: credentials[1]!.ciphertext,
          refreshTokenIv: credentials[1]!.iv,
          encryptionKeyVersion: "v1",
          webhookRoutingKey: ROUTING_KEY,
          lastRefreshedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      );
    }

    const planId = await ctx.db.insert("membershipPlans", {
      organizationId,
      name: "Mensual",
      priceArs: options.planPriceArs ?? 30_000,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      billingMode: options.billingMode ?? "join_date",
      interestTiers: options.interestTiers
        ? [{ daysAfterWindowEnd: 5, type: "percentage", value: 10 }]
        : undefined,
      advancePaymentDiscounts: [
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

function fakeWithCheckout() {
  const fake = new FakeMercadoPago();
  fake.onJson("POST /preapproval", preapprovalResponse());
  __setMercadoPagoTransportForTests(fake.transport);
  return fake;
}

async function startCheckout(t: T, gym: Gym) {
  return await t
    .withIdentity({ subject: MEMBER })
    .action(api.memberPaymentsActions.startRecurringCheckout, {
      planId: gym.planId,
    });
}

async function postAuthorizedPaymentWebhook(
  t: T,
  options: { resourceId?: string; requestId?: string } = {},
) {
  const resourceId = options.resourceId ?? "5000000001";
  const requestId = options.requestId ?? `req-${Math.random()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Hex(
    WEBHOOK_SECRET,
    buildWebhookSignatureManifest({ dataId: resourceId, requestId, ts }),
  );

  const response = await t.fetch(`/member-payments/webhook/${ROUTING_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${signature}`,
    },
    body: JSON.stringify({
      type: "subscription_authorized_payment",
      action: "created",
      data: { id: resourceId },
    }),
  });

  await drainScheduled(t);

  return response;
}

const readAgreements = (t: T) =>
  t.run((ctx) => ctx.db.query("memberRecurringAgreements").collect());
const readSessions = (t: T) =>
  t.run((ctx) => ctx.db.query("memberPaymentCheckoutSessions").collect());
const readSubscriptions = (t: T) =>
  t.run((ctx) => ctx.db.query("memberPlanSubscriptions").collect());
const readPlanPayments = (t: T) =>
  t.run((ctx) => ctx.db.query("planPayments").collect());
const readLedger = (t: T) =>
  t.run((ctx) => ctx.db.query("platformCommissionLedger").collect());

describe("getAvailablePaymentMethods", () => {
  it("computes the monthly amount on the server from plan, family and bonification", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { planPriceArs: 40_000 });

    // A family of three with a 25% bonification.
    await t.run(async (ctx) => {
      const now = Date.now();
      const parentId = await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: gym.organizationId,
        userId: MEMBER,
        planId: gym.planId,
        familyHeadUserId: MEMBER,
        status: "pending_payment",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: gym.organizationId,
        userId: FAMILY_CHILD,
        planId: gym.planId,
        familyHeadUserId: MEMBER,
        familyParentSubscriptionId: parentId,
        status: "pending_payment",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("planBonifications", {
        organizationId: gym.organizationId,
        subscriptionId: parentId,
        userId: MEMBER,
        planId: gym.planId,
        discountType: "percentage",
        discountValue: 25,
        reason: "friend_and_family",
        status: "active",
        createdBy: ADMIN,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getAvailablePaymentMethods, {
        planId: gym.planId,
      });

    expect(result!.coveredMemberCount).toBe(2);
    expect(result!.hasBonification).toBe(true);
    // 40 000 - 25% = 30 000 per member, times two members.
    expect(result!.monthlyAmountArs).toBe(60_000);
    expect(result!.advanceOptions.map((option) => option.months)).toEqual([
      3, 6, 12,
    ]);
  });

  it("tells a family child that the payer handles payment", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      const parentId = await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: gym.organizationId,
        userId: MEMBER,
        planId: gym.planId,
        status: "active",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: gym.organizationId,
        userId: FAMILY_CHILD,
        planId: gym.planId,
        familyParentSubscriptionId: parentId,
        status: "active",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: FAMILY_CHILD })
      .query(api.memberPaymentsCheckout.getAvailablePaymentMethods, {
        planId: gym.planId,
      });

    expect(result!.isFamilyChild).toBe(true);
    for (const method of result!.methods) {
      expect(method.available).toBe(false);
    }
  });

  it("reports the gym has not connected an account", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { withConnection: false });

    const result = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getAvailablePaymentMethods, {
        planId: gym.planId,
      });

    const recurring = result!.methods.find(
      (method) => method.method === "mercadopago_recurring",
    )!;
    expect(recurring.available).toBe(false);
    expect(recurring.reason).toContain("no conectó");
  });
});

describe("startRecurringCheckout", () => {
  it("creates local state before calling the provider and grants no access", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeWithCheckout();

    const result = await startCheckout(t, gym);

    expect(result.resumed).toBe(false);
    expect(result.checkoutUrl).toContain("mercadopago");

    const [session] = await readSessions(t);
    expect(session!.status).toBe("opened");
    expect(session!.providerPreapprovalId).toBe(PREAPPROVAL_ID);
    expect(session!.amountArs).toBe(30_000);

    const [agreement] = await readAgreements(t);
    expect(agreement!.status).toBe("pending_authorization");
    expect(agreement!.providerPreapprovalId).toBe(PREAPPROVAL_ID);

    const [subscription] = await readSubscriptions(t);
    // Choosing a plan is not paying for it.
    expect(subscription!.status).toBe("pending_payment");
    expect(subscription!.paymentMode).toBe("mercadopago_recurring");

    // The preapproval carried MAT's amount and the gym's own routing key.
    const body = fake.requests[0]!.body as any;
    expect(body.auto_recurring.transaction_amount).toBe(30_000);
    expect(body.notification_url).toContain(ROUTING_KEY);
    expect(body.external_reference).toContain(String(gym.organizationId));
  });

  it("returns the same session when the member taps again", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeWithCheckout();

    const first = await startCheckout(t, gym);
    const second = await startCheckout(t, gym);

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.resumed).toBe(true);
    expect(await readAgreements(t)).toHaveLength(1);
    // The provider was asked once, not twice.
    expect(fake.countFor("POST /preapproval")).toBe(1);
  });

  it("refuses a second live agreement on another plan", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeWithCheckout();
    await startCheckout(t, gym);

    const otherPlanId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("membershipPlans", {
        organizationId: gym.organizationId,
        name: "Premium",
        priceArs: 60_000,
        weeklyClassLimit: 5,
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 10,
        billingMode: "join_date",
        isActive: true,
        createdBy: ADMIN,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .action(api.memberPaymentsActions.startRecurringCheckout, {
          planId: otherPlanId,
        }),
    ).rejects.toThrow(/débito automático en curso/);

    expect(await readAgreements(t)).toHaveLength(1);
  });

  it("refuses when the plan is not eligible", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t, { billingMode: "calendar" });
    fakeWithCheckout();

    await expect(startCheckout(t, gym)).rejects.toThrow(/fecha de alta/);
    expect(await readAgreements(t)).toHaveLength(0);
  });

  it("refuses when the kill switch is off", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
    fakeWithCheckout();

    await expect(startCheckout(t, gym)).rejects.toThrow(/no están disponibles/);
    expect(await readAgreements(t)).toHaveLength(0);
  });

  it("adopts the resource the provider created when the response was lost", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    const fake = new FakeMercadoPago();
    let createdOnProvider = 0;
    fake.on("POST /preapproval", () => {
      createdOnProvider += 1;
      throw new MercadoPagoNetworkError("The operation was aborted");
    });
    fake.on("GET /preapproval/search", (request) => {
      const reference = String(request.query?.external_reference ?? "");
      return jsonResponse({
        results: [
          preapprovalResponse({
            id: "created-despite-timeout",
            external_reference: reference,
          }),
        ],
      });
    });
    __setMercadoPagoTransportForTests(fake.transport);

    const result = await startCheckout(t, gym);

    expect(createdOnProvider).toBe(1);
    expect(result.checkoutUrl).toContain("mercadopago");
    const agreements = await readAgreements(t);
    // One agreement, pointing at the resource the provider really created.
    expect(agreements).toHaveLength(1);
    expect(agreements[0]!.providerPreapprovalId).toBe("created-despite-timeout");
  });

  it("fails the session cleanly when the provider rejects the request", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(400, providerErrors.validation));
    __setMercadoPagoTransportForTests(fake.transport);

    await expect(startCheckout(t, gym)).rejects.toThrow(/No pudimos iniciar/);

    const [session] = await readSessions(t);
    expect(session!.status).toBe("failed");
    const [agreement] = await readAgreements(t);
    expect(agreement!.status).toBe("failed");
    const [subscription] = await readSubscriptions(t);
    expect(subscription!.status).toBe("pending_payment");
  });
});

describe("checkout return and cancellation", () => {
  it("treats the browser return as processing, never as paid", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeWithCheckout();
    const { sessionId } = await startCheckout(t, gym);

    const result = await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.markCheckoutReturned, { sessionId });

    expect(result.status).toBe("processing");
    const state = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getMyCheckoutSession, { sessionId });
    expect(state!.status).toBe("processing");
    expect(state!.subscriptionStatus).toBe("pending_payment");
  });

  it("leaves a closed checkout resumable until it expires", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeWithCheckout();
    const first = await startCheckout(t, gym);

    // The member closed the browser without paying, then came back later.
    const resumed = await startCheckout(t, gym);
    expect(resumed.sessionId).toBe(first.sessionId);

    // Once expired, reconciliation retires it.
    await t.run((ctx) =>
      ctx.db.patch(first.sessionId, { expiresAt: Date.now() - 1 }),
    );
    await t.action(internal.memberPaymentsActions.reconcileMemberPayments, {});
    const [session] = await readSessions(t);
    expect(session!.status).toBe("expired");
  });

  it("cancels the pending subscription when the member abandons checkout", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeWithCheckout();
    const { sessionId } = await startCheckout(t, gym);

    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.cancelMyCheckoutSession, {
        sessionId,
      });

    expect((await readSessions(t))[0]!.status).toBe("cancelled");
    expect((await readAgreements(t))[0]!.status).toBe("cancelled");
    expect((await readSubscriptions(t))[0]!.status).toBe("cancelled");
  });

  it("never lets another member read a checkout session", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    fakeWithCheckout();
    const { sessionId } = await startCheckout(t, gym);

    const state = await t
      .withIdentity({ subject: FAMILY_CHILD })
      .query(api.memberPaymentsCheckout.getMyCheckoutSession, { sessionId });
    expect(state).toBeNull();
  });
});

describe("first activation", () => {
  async function checkoutThenApprove(
    t: T,
    gym: Gym,
    options: { amountArs?: number } = {},
  ) {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);
    const checkout = await startCheckout(t, gym);

    const [agreement] = await readAgreements(t);
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        external_reference: agreement!.externalReference,
        preapproval_id: PREAPPROVAL_ID,
        transaction_amount: options.amountArs ?? 30_000,
        payment_status: "approved",
      }),
    );

    return { checkout, fake, agreement };
  }

  it("grants no access on authorization alone", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const fake = fakeWithCheckout();
    await startCheckout(t, gym);
    const [agreement] = await readAgreements(t);

    fake.onJson(
      "GET /preapproval/*",
      preapprovalResponse({
        status: "authorized",
        external_reference: agreement!.externalReference,
      }),
    );

    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = "req-auth";
    const signature = await hmacSha256Hex(
      WEBHOOK_SECRET,
      buildWebhookSignatureManifest({ dataId: PREAPPROVAL_ID, requestId, ts }),
    );
    await t.fetch(`/member-payments/webhook/${ROUTING_KEY}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${signature}`,
      },
      body: JSON.stringify({
        type: "subscription_preapproval",
        data: { id: PREAPPROVAL_ID },
      }),
    });
    await drainScheduled(t);

    expect((await readAgreements(t))[0]!.status).toBe("pending_first_payment");
    expect((await readSubscriptions(t))[0]!.status).toBe("pending_payment");
    expect(await readPlanPayments(t)).toHaveLength(0);
  });

  it("grants access once on the first approved payment", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await checkoutThenApprove(t, gym);

    await postAuthorizedPaymentWebhook(t);

    const [agreement] = await readAgreements(t);
    expect(agreement!.status).toBe("active");
    expect(agreement!.currentPeriodStart).toBeGreaterThan(0);
    expect(agreement!.nextChargeAt).toBe(agreement!.currentPeriodEnd);

    const [subscription] = await readSubscriptions(t);
    expect(subscription!.status).toBe("active");

    const payments = await readPlanPayments(t);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("approved");
    expect(payments[0]!.paymentMethod).toBe("mercadopago_recurring");
    expect(payments[0]!.amountArs).toBe(30_000);
    expect(payments[0]!.providerTransactionId).toBeTruthy();
  });

  it("records exactly one payment and one ledger entry for a redelivered notification", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await checkoutThenApprove(t, gym);

    await postAuthorizedPaymentWebhook(t, { requestId: "req-a" });
    await postAuthorizedPaymentWebhook(t, { requestId: "req-b" });

    expect(await readPlanPayments(t)).toHaveLength(1);
    expect(await readLedger(t)).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("memberPaymentTransactions").collect()),
    ).toHaveLength(1);
  });

  it("snapshots MAT's commission at the rate in force", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await checkoutThenApprove(t, gym);

    await postAuthorizedPaymentWebhook(t);

    const [entry] = await readLedger(t);
    expect(entry!.platformFeeBps).toBe(250);
    // 2.5% of 30 000.
    expect(entry!.feeAmountArs).toBe(750);
    expect(entry!.status).toBe("accrued");
    expect(entry!.collectionMode).toBe("monthly_gym_invoice");

    const [payment] = await readPlanPayments(t);
    expect(payment!.platformFeeArs).toBe(750);
    expect(payment!.gymNetAmountArs).toBe(30_000 - 750);
  });

  it("activates the whole family group, not only the payer", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);
    await startCheckout(t, gym);

    const [agreement] = await readAgreements(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: gym.organizationId,
        userId: FAMILY_CHILD,
        planId: gym.planId,
        familyParentSubscriptionId: agreement!.subscriptionId,
        status: "pending_payment",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        external_reference: agreement!.externalReference,
        transaction_amount: 30_000,
        payment_status: "approved",
      }),
    );

    await postAuthorizedPaymentWebhook(t);

    const subscriptions = await readSubscriptions(t);
    expect(subscriptions).toHaveLength(2);
    for (const subscription of subscriptions) {
      expect(subscription.status).toBe("active");
    }
  });

  it("does not grant access when the charged amount was not the agreed one", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    await checkoutThenApprove(t, gym, { amountArs: 99_999 });

    await postAuthorizedPaymentWebhook(t);

    const [subscription] = await readSubscriptions(t);
    expect(subscription!.status).toBe("pending_payment");
    expect(await readPlanPayments(t)).toHaveLength(0);
    // The money is still recorded for an operator to reconcile.
    const transactions = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.grossAmountArs).toBe(99_999);
  });

  it("does not grant access on a rejected first charge", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);

    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);
    await startCheckout(t, gym);
    const [agreement] = await readAgreements(t);
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        external_reference: agreement!.externalReference,
        payment_status: "rejected",
      }),
    );

    await postAuthorizedPaymentWebhook(t);

    expect((await readSubscriptions(t))[0]!.status).toBe("pending_payment");
    expect(await readPlanPayments(t)).toHaveLength(0);
    expect((await readAgreements(t))[0]!.lastPaymentStatus).toBe("rejected");
  });

  it("is repaired by reconciliation when the notification never arrives", async () => {
    const t = convexTest(schema, modules);
    const gym = await seedGym(t);
    const { fake } = await checkoutThenApprove(t, gym);
    const [agreement] = await readAgreements(t);

    // The provider authorized and charged, but no webhook was delivered.
    await t.run((ctx) =>
      ctx.db.patch(agreement!._id, {
        status: "pending_first_payment",
        updatedAt: Date.now() - 60 * 60 * 1000,
      }),
    );
    fake.onJson(
      "GET /preapproval/*",
      preapprovalResponse({
        status: "authorized",
        external_reference: agreement!.externalReference,
      }),
    );
    fake.onJson("GET /authorized_payments/search", {
      results: [
        authorizedPaymentResponse({
          external_reference: agreement!.externalReference,
          payment_status: "approved",
        }),
      ],
    });

    await t.action(internal.memberPaymentsActions.reconcileMemberPayments, {});

    expect((await readSubscriptions(t))[0]!.status).toBe("active");
    expect(await readPlanPayments(t)).toHaveLength(1);
  });
});
