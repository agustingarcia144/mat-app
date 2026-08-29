import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import { DAY_MS } from "./billingDomain";
import { logMemberPaymentEvent } from "./memberPaymentNotifications";
import { FakeMercadoPago, errorResponse } from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  providerErrors,
  SELLER_A,
} from "./mercadoPago.fixtures";
import {
  ADMIN,
  MEMBER,
  PREAPPROVAL_ID,
  ROUTING_KEY,
  drainAllScheduled,
  postSignedWebhook,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const PRICE = 30_000;
const GRACE_DAYS = 5;

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Fixture = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
  externalReference: string;
};

async function seedMember(t: TestConvex): Promise<Fixture> {
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
      priceArs: PRICE,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      billingMode: "join_date",
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
      subscriptionId,
      agreementId,
      externalReference,
    };
  });
}

async function charge(
  t: TestConvex,
  fixture: Fixture,
  status: "approved" | "rejected",
  id = 5000000001,
) {
  const fake = new FakeMercadoPago();
  fake.onJson(
    "GET /authorized_payments/*",
    authorizedPaymentResponse({
      id,
      preapproval_id: PREAPPROVAL_ID,
      external_reference: fixture.externalReference,
      transaction_amount: PRICE,
      payment_status: status,
      payment_id: id + 2_000_000_000,
    }),
  );
  __setMercadoPagoTransportForTests(fake.transport);
  await postSignedWebhook(t, {
    topic: "subscription_authorized_payment",
    resourceId: String(id),
  });
}

const readNotifications = async (t: TestConvex) => {
  await drainAllScheduled(t);
  return await t.run((ctx) => ctx.db.query("notificationEvents").collect());
};

const typesFor = async (t: TestConvex, userId?: string) =>
  (await readNotifications(t))
    .filter((event) => (userId ? event.userId === userId : true))
    .map((event) => event.type);

describe("structured logging", () => {
  it("never emits a token, payload or payer email", () => {
    const lines: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (line: string) => lines.push(line);
    console.error = (line: string) => lines.push(line);

    try {
      logMemberPaymentEvent({
        event: "payment_approved",
        organizationId: "org1",
        providerResourceId: "7000000001",
        externalReference: "mat_sub_org1_sub1_abcdef01",
        amountArs: 30_000,
      });
      logMemberPaymentEvent({
        event: "operation_failed",
        organizationId: "org1",
        reason: "MercadoPago 400: [redacted-token]",
      });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.scope).toBe("member_payments");
      expect(parsed.organizationId).toBe("org1");
      expect(line).not.toContain("APP_USR");
      expect(line).not.toMatch(/@[\w-]+\.[\w.]+/);
    }
  });

  it("caps a long reason so one failure cannot flood the logs", () => {
    const lines: string[] = [];
    const originalError = console.error;
    console.error = (line: string) => lines.push(line);
    try {
      logMemberPaymentEvent({
        event: "checkout_failed",
        reason: "x".repeat(5_000),
      });
    } finally {
      console.error = originalError;
    }
    expect(JSON.parse(lines[0]!).reason.length).toBe(300);
  });
});

describe("member notifications", () => {
  it("confirms an approved charge", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "approved");

    expect(await typesFor(t, MEMBER)).toContain("member_payment_approved");
  });

  it("warns on a failed charge and again before the deadline", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "rejected");

    expect(await typesFor(t, MEMBER)).toContain("member_payment_failed");

    // The deadline is now inside the reminder window.
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, {
        graceUntil: Date.now() + 12 * 60 * 60 * 1000,
      }),
    );
    await t.mutation(internal.memberPayments.notifyGraceDeadlines, {});

    expect(await typesFor(t, MEMBER)).toContain("member_payment_grace_ending");
  });

  it("warns once per grace window, not once per reminder run", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "rejected");
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, {
        graceUntil: Date.now() + 12 * 60 * 60 * 1000,
      }),
    );

    await t.mutation(internal.memberPayments.notifyGraceDeadlines, {});
    await t.mutation(internal.memberPayments.notifyGraceDeadlines, {});

    const reminders = (await readNotifications(t)).filter(
      (event) => event.type === "member_payment_grace_ending",
    );
    expect(reminders).toHaveLength(1);
  });

  it("tells the member when suspension actually happens", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "rejected");
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );

    await t.mutation(internal.memberPayments.expireMemberPaymentGracePeriods, {});

    expect(await typesFor(t, MEMBER)).toContain("member_payment_suspended");
  });

  it("distinguishes a recovery from an ordinary payment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "rejected");
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { graceUntil: Date.now() - 1 }),
    );
    await t.mutation(internal.memberPayments.expireMemberPaymentGracePeriods, {});

    await charge(t, fixture, "approved", 5000000002);

    const types = await typesFor(t, MEMBER);
    expect(types).toContain("member_payment_recovered");
    expect(types).not.toContain("member_payment_approved");
  });

  it("announces a price change before it is charged", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.planBonifications.create, {
        subscriptionId: fixture.subscriptionId,
        discountType: "percentage",
        discountValue: 50,
        reason: "friend_and_family",
      });

    expect(await typesFor(t, MEMBER)).toContain(
      "member_payment_amount_changed",
    );
  });

  it("confirms a cancellation with its access-end date", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.cancelRecurringSubscription, {});

    expect(await typesFor(t, MEMBER)).toContain(
      "member_payment_cancellation_scheduled",
    );
  });

  it("nudges a member who opened a checkout and never finished", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const sessionId = await t.run(async (ctx) => {
      const now = Date.now();
      const subscription = await ctx.db.get(fixture.subscriptionId);
      return await ctx.db.insert("memberPaymentCheckoutSessions", {
        organizationId: fixture.organizationId,
        userId: MEMBER,
        planId: subscription!.planId,
        subscriptionId: fixture.subscriptionId,
        kind: "recurring_setup",
        months: 1,
        amountArs: PRICE,
        currency: "ARS",
        paymentMethod: "mercadopago_recurring",
        externalReference: "mat_sub_x_y_abcdef01",
        idempotencyKey: "k",
        status: "opened",
        expiresAt: now - 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.memberPayments.expireCheckoutSessionInternal, {
      sessionId,
    });

    expect(await typesFor(t, MEMBER)).toContain("member_checkout_incomplete");
  });
});

describe("admin alerts", () => {
  it("alerts admins when the connection breaks", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    await t.mutation(internal.memberPayments.recordConnectionStatusInternal, {
      connectionId: fixture.connectionId,
      status: "refresh_required",
      lastError: "MercadoPago rejected the stored credentials",
    });

    expect(await typesFor(t, ADMIN)).toContain("member_payment_admin_alert");
    // The member is not told about a problem only the gym can fix.
    expect(await typesFor(t, MEMBER)).not.toContain(
      "member_payment_admin_alert",
    );
  });

  it("alerts admins when an operation is parked", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const operationId = await t.mutation(
      internal.memberPayments.enqueueProviderOperationInternal,
      {
        organizationId: fixture.organizationId,
        connectionId: fixture.connectionId,
        agreementId: fixture.agreementId,
        operation: "pause",
      },
    );
    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});
    await t.mutation(internal.memberPayments.completeOperationInternal, {
      operationId,
      succeeded: false,
      retryable: false,
      error: "MercadoPago 400: invalid",
    });

    expect(await typesFor(t, ADMIN)).toContain("member_payment_admin_alert");
  });

  it("alerts admins when a charge does not match what was agreed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        preapproval_id: PREAPPROVAL_ID,
        external_reference: fixture.externalReference,
        transaction_amount: 99_999,
        payment_status: "approved",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);
    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
    });

    expect(await typesFor(t, ADMIN)).toContain("member_payment_admin_alert");
  });

  it("does not alert on a transient failure that will retry", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const operationId = await t.mutation(
      internal.memberPayments.enqueueProviderOperationInternal,
      {
        organizationId: fixture.organizationId,
        connectionId: fixture.connectionId,
        agreementId: fixture.agreementId,
        operation: "pause",
      },
    );
    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});
    await t.mutation(internal.memberPayments.completeOperationInternal, {
      operationId,
      succeeded: false,
      retryable: true,
      error: "MercadoPago 500",
    });

    expect(await typesFor(t, ADMIN)).not.toContain(
      "member_payment_admin_alert",
    );
  });
});

describe("operational metrics", () => {
  it("reports the numbers a support conversation starts from", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await charge(t, fixture, "approved");

    const metrics = await t
      .withIdentity({ subject: ADMIN })
      .query(api.memberPaymentsAdmin.getMetrics, {});

    expect(metrics!.payments.approved).toBe(1);
    expect(metrics!.payments.grossVolumeArs).toBe(PRICE);
    expect(metrics!.agreements.active).toBe(1);
    expect(metrics!.connection.status).toBe("active");
    expect(metrics!.webhooks.received).toBeGreaterThan(0);
    expect(metrics!.webhooks.failed).toBe(0);
    expect(metrics!.suspendedMembers).toBe(0);
  });

  it("reports no conversion rate rather than a fabricated zero", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    const metrics = await t
      .withIdentity({ subject: ADMIN })
      .query(api.memberPaymentsAdmin.getMetrics, {});

    expect(metrics!.checkout.started).toBe(0);
    expect(metrics!.checkout.conversionRate).toBeNull();
  });

  it("is admin-only", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .query(api.memberPaymentsAdmin.getMetrics, {}),
    ).rejects.toThrow(/Admin role/i);
  });
});
