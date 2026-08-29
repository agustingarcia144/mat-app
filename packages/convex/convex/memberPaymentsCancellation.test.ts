import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  DAY_MS,
  computeCancellationAccessEndsAt,
  getAdvanceBillingCycles,
} from "./billingDomain";
import { FakeMercadoPago } from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  preapprovalResponse,
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

const PRICE = 30_000;
const GRACE_DAYS = 5;
const TZ = "America/Argentina/Buenos_Aires";

beforeEach(() => setMemberPaymentTestEnv());
afterEach(() => {
  delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
});

type Fixture = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  planId: Id<"membershipPlans">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  childSubscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
  externalReference: string;
  periodEnd: number;
  anchorAt: number;
};

type SeedOptions = {
  /** "recurring" gives the member a live agreement; "manual" does not. */
  mode?: "recurring" | "manual";
  agreementStatus?: "active" | "pending_authorization";
  currentCyclePaid?: boolean;
};

async function seedMember(
  t: TestConvex,
  options: SeedOptions = {},
): Promise<Fixture> {
  const credentials = await testCredentials();
  const mode = options.mode ?? "recurring";

  return await t.run(async (ctx) => {
    const now = Date.now();
    const anchorAt = now - 40 * DAY_MS;
    const periodEnd = now + 20 * DAY_MS;

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
      name: "Familiar",
      isFamilyPlan: true,
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
      familyHeadUserId: MEMBER,
      status: "active",
      activatedAt: anchorAt,
      billingAnchorAt: anchorAt,
      paymentMode: mode === "recurring" ? "mercadopago_recurring" : "manual",
      createdAt: now,
      updatedAt: now,
    });

    const childSubscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: FAMILY_CHILD,
      planId,
      familyParentSubscriptionId: subscriptionId,
      status: "active",
      activatedAt: anchorAt,
      createdAt: now,
      updatedAt: now,
    });

    if (options.currentCyclePaid) {
      const [currentCycle] = getAdvanceBillingCycles(
        { billingMode: "join_date" },
        anchorAt,
        now,
        1,
        TZ,
      );
      await ctx.db.insert("planPayments", {
        organizationId,
        userId: MEMBER,
        subscriptionId,
        planId,
        billingPeriod: currentCycle!.billingPeriod,
        billingCycleStartAt: currentCycle!.cycleStartAt,
        billingCycleEndAt: currentCycle!.cycleEndAt,
        amountArs: PRICE * 2,
        paymentMethod: "bank_transfer",
        status: "approved",
        createdAt: now,
        updatedAt: now,
      });
    }

    const externalReference = `mat_sub_${organizationId}_${subscriptionId}_abcdef01`;
    let agreementId = "" as Id<"memberRecurringAgreements">;
    if (mode === "recurring") {
      agreementId = await ctx.db.insert("memberRecurringAgreements", {
        organizationId,
        connectionId,
        subscriptionId,
        payerUserId: MEMBER,
        providerPreapprovalId: PREAPPROVAL_ID,
        externalReference,
        status: options.agreementStatus ?? "active",
        amountArs: PRICE * 2,
        currency: "ARS",
        familyMemberCount: 2,
        billingAnchorAt: anchorAt,
        currentPeriodStart: now - 10 * DAY_MS,
        currentPeriodEnd: periodEnd,
        nextChargeAt: periodEnd,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      organizationId,
      connectionId,
      planId,
      subscriptionId,
      childSubscriptionId,
      agreementId,
      externalReference,
      periodEnd,
      anchorAt,
    };
  });
}

const readAgreement = (t: TestConvex, id: Id<"memberRecurringAgreements">) =>
  t.run((ctx) => ctx.db.get(id));
const readSubscription = (t: TestConvex, id: Id<"memberPlanSubscriptions">) =>
  t.run((ctx) => ctx.db.get(id));
const readOperations = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("memberPaymentProviderOperations").collect());
const readPayments = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("planPayments").collect());

const cancelAsMember = (t: TestConvex) =>
  t
    .withIdentity({ subject: MEMBER })
    .mutation(api.memberPaymentsCheckout.cancelRecurringSubscription, {});

describe("cancellation preview", () => {
  it("discloses the exact date access ends", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const preview = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.previewCancellation, {});

    expect(preview!.canCancel).toBe(true);
    expect(preview!.accessEndsAt).toBe(
      computeCancellationAccessEndsAt(fixture.periodEnd, GRACE_DAYS),
    );
    expect(preview!.coverageEndsAt).toBe(fixture.periodEnd);
    expect(preview!.gracePeriodDays).toBe(GRACE_DAYS);
    expect(preview!.familyMemberCount).toBe(2);
  });

  it("tells a family child the payer handles it", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    const preview = await t
      .withIdentity({ subject: FAMILY_CHILD })
      .query(api.memberPaymentsCheckout.previewCancellation, {});

    expect(preview!.canCancel).toBe(false);
    expect(preview!.reason).toContain("titular");
  });

  it("reports an unpaid checkout as cancellable immediately", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t, { agreementStatus: "pending_authorization" });

    const preview = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.previewCancellation, {});

    expect(preview!.immediate).toBe(true);
    expect(preview!.accessEndsAt).toBeNull();
  });
});

describe("cancelling automatic debit", () => {
  it("stops future debits now and keeps access to the disclosed date", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    const expected = computeCancellationAccessEndsAt(
      fixture.periodEnd,
      GRACE_DAYS,
    );

    const result = await cancelAsMember(t);

    expect(result.accessEndsAt).toBe(expected);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("cancellation_scheduled");
    expect(agreement!.cancellationRequestedAt).toBeGreaterThan(0);

    // Access is not revoked when the button is tapped.
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "active",
    );
    expect(
      (await readSubscription(t, fixture.childSubscriptionId))!.status,
    ).toBe("active");
    expect(
      (await readSubscription(t, fixture.subscriptionId))!.accessEndsAt,
    ).toBe(expected);

    const [operation] = await readOperations(t);
    expect(operation!.operation).toBe("cancel");
  });

  it("is idempotent when the member taps again", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    const first = await cancelAsMember(t);
    const second = await cancelAsMember(t);

    expect(second.accessEndsAt).toBe(first.accessEndsAt);
    expect(await readOperations(t)).toHaveLength(1);
  });

  it("cancels an unpaid checkout outright, with no coverage to honour", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t, {
      agreementStatus: "pending_authorization",
    });
    await t.run((ctx) =>
      ctx.db.patch(fixture.subscriptionId, { status: "pending_payment" }),
    );

    const result = await cancelAsMember(t);

    expect(result.accessEndsAt).toBeNull();
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "cancelled",
    );
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "cancelled",
    );
  });

  it("refuses a family child", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    await expect(
      t
        .withIdentity({ subject: FAMILY_CHILD })
        .mutation(api.memberPaymentsCheckout.cancelRecurringSubscription, {}),
    ).rejects.toThrow(/titular/);
  });
});

describe("access ending on the disclosed date", () => {
  it("changes nothing before the date arrives", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await cancelAsMember(t);

    const result = await t.mutation(
      internal.memberPayments.expireScheduledCancellations,
      {},
    );

    expect(result.cancelled).toBe(0);
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "active",
    );
  });

  it("cancels the whole family group once it does", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await cancelAsMember(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.subscriptionId, { accessEndsAt: Date.now() - 1 }),
    );

    const result = await t.mutation(
      internal.memberPayments.expireScheduledCancellations,
      {},
    );

    expect(result.cancelled).toBe(1);
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "cancelled",
    );
    expect(
      (await readSubscription(t, fixture.childSubscriptionId))!.status,
    ).toBe("cancelled");
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "cancelled",
    );
  });

  it("leaves members with no scheduled end alone", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const result = await t.mutation(
      internal.memberPayments.expireScheduledCancellations,
      {},
    );

    expect(result.examined).toBe(0);
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "active",
    );
  });
});

describe("no renewal after cancellation", () => {
  it("records a charge that slips through but never extends access", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await cancelAsMember(t);

    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({
        preapproval_id: PREAPPROVAL_ID,
        external_reference: fixture.externalReference,
        transaction_amount: PRICE * 2,
        payment_status: "approved",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);

    await postSignedWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
    });

    // No month was bought and the agreement did not reopen.
    expect(await readPayments(t)).toHaveLength(0);
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "cancellation_scheduled",
    );

    // The money that moved is flagged so it can be refunded.
    const [transaction] = await t.run((ctx) =>
      ctx.db.query("memberPaymentTransactions").collect(),
    );
    expect(transaction!.requiresAttention).toBe(true);
    expect(transaction!.attentionReason).toContain("charge_after_cancellation");
  });
});

describe("legacy cancellation path", () => {
  it("sends a member with automatic debit to the flow that discloses the date", async () => {
    const t = convexTest(schema, modules);
    await seedMember(t);

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .mutation(api.memberPlanSubscriptions.cancel, {}),
    ).rejects.toThrow(/débito automático/);
  });

  it("still works for a member who pays by transfer", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t, { mode: "manual" });

    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPlanSubscriptions.cancel, {});

    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "cancelled",
    );
  });

  it("stops the debit when staff cancel a member outright", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.cancel, {
        subscriptionId: fixture.subscriptionId,
      });

    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "cancelled",
    );
    // The card must not keep being charged for someone with no access.
    const [operation] = await readOperations(t);
    expect(operation!.operation).toBe("cancel");
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "cancellation_scheduled",
    );
  });
});

describe("switching payment method", () => {
  it("moves from debit to transfer without interrupting access", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);

    const result = await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.switchToBankTransfer, {});

    expect(result.coveredUntil).toBe(fixture.periodEnd);

    const subscription = await readSubscription(t, fixture.subscriptionId);
    expect(subscription!.status).toBe("active");
    expect(subscription!.paymentMode).toBe("manual");
    // Not leaving: no access end is scheduled.
    expect(subscription!.accessEndsAt).toBeUndefined();

    expect((await readOperations(t))[0]!.operation).toBe("cancel");
  });

  it("closes the agreement once the provider confirms the switch", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    await t
      .withIdentity({ subject: MEMBER })
      .mutation(api.memberPaymentsCheckout.switchToBankTransfer, {});

    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse({ status: "cancelled" }));
    __setMercadoPagoTransportForTests(fake.transport);
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "cancelled",
    );
    // The member keeps training and now pays by transfer.
    expect((await readSubscription(t, fixture.subscriptionId))!.status).toBe(
      "active",
    );
  });

  it("defers the first debit when the current month is already paid", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t, {
      mode: "manual",
      currentCyclePaid: true,
    });

    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    await t
      .withIdentity({ subject: MEMBER })
      .action(api.memberPaymentsActions.startRecurringCheckout, {
        planId: fixture.planId,
      });

    const [, nextCycle] = getAdvanceBillingCycles(
      { billingMode: "join_date" },
      fixture.anchorAt,
      Date.now(),
      2,
      TZ,
    );

    const startDate = (fake.requests[0]!.body as any).auto_recurring.start_date;
    expect(startDate).toBeTruthy();
    // The debit starts at the first month the member has not paid for, so the
    // switch neither charges twice nor leaves a gap.
    expect(Date.parse(startDate)).toBe(nextCycle!.cycleStartAt);
  });

  it("charges straight away when the current month is unpaid", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t, { mode: "manual" });

    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    await t
      .withIdentity({ subject: MEMBER })
      .action(api.memberPaymentsActions.startRecurringCheckout, {
        planId: fixture.planId,
      });

    expect(
      (fake.requests[0]!.body as any).auto_recurring.start_date,
    ).toBeUndefined();
  });

  it("reuses the existing subscription rather than starting a second one", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t, { mode: "manual" });

    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    await t
      .withIdentity({ subject: MEMBER })
      .action(api.memberPaymentsActions.startRecurringCheckout, {
        planId: fixture.planId,
      });

    const subscriptions = await t.run((ctx) =>
      ctx.db.query("memberPlanSubscriptions").collect(),
    );
    // Payer and child only: no orphan subscription was created.
    expect(subscriptions).toHaveLength(2);
    const payer = subscriptions.find((item) => item._id === fixture.subscriptionId);
    expect(payer!.status).toBe("active");
  });

  it("refuses a second agreement while one is still live", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedMember(t);
    __setMercadoPagoTransportForTests(new FakeMercadoPago().transport);

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .action(api.memberPaymentsActions.startRecurringCheckout, {
          planId: fixture.planId,
        }),
    ).rejects.toThrow(/débito automático en curso/);
  });
});
