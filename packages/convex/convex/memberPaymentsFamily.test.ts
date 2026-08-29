import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import { DAY_MS } from "./billingDomain";
import { FakeMercadoPago, errorResponse } from "./mercadoPago.fake";
import { preapprovalResponse, providerErrors, SELLER_A } from "./mercadoPago.fixtures";
import {
  ADMIN,
  FAMILY_CHILD,
  MEMBER,
  PREAPPROVAL_ID,
  ROUTING_KEY,
  setMemberPaymentTestEnv,
  testCredentials,
  type TestConvex,
} from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const PRICE = 30_000;
const OUTSIDER = "user_outsider";

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
  periodEnd: number;
};

/** A family payer on automatic debit, mid-cycle, with one child. */
async function seedFamilyOnDebit(
  t: TestConvex,
  options: { paymentMode?: "mercadopago_recurring" | "manual" } = {},
): Promise<Fixture> {
  const credentials = await testCredentials();

  return await t.run(async (ctx) => {
    const now = Date.now();
    const periodEnd = now + 20 * DAY_MS;

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
      [OUTSIDER, "member"],
    ] as const) {
      await ctx.db.insert("users", {
        externalId: userId,
        activeOrganizationId: organizationId,
        isSuperAdmin: undefined,
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
      activatedAt: now - 40 * DAY_MS,
      billingAnchorAt: now - 40 * DAY_MS,
      paymentMode: options.paymentMode ?? "mercadopago_recurring",
      createdAt: now,
      updatedAt: now,
    });

    const childSubscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: FAMILY_CHILD,
      planId,
      familyHeadUserId: MEMBER,
      familyParentSubscriptionId: subscriptionId,
      status: "active",
      activatedAt: now - 40 * DAY_MS,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(subscriptionId, {
      familyMemberUserIds: [FAMILY_CHILD],
    });

    let agreementId = "" as Id<"memberRecurringAgreements">;
    if ((options.paymentMode ?? "mercadopago_recurring") === "mercadopago_recurring") {
      agreementId = await ctx.db.insert("memberRecurringAgreements", {
        organizationId,
        connectionId,
        subscriptionId,
        payerUserId: MEMBER,
        providerPreapprovalId: PREAPPROVAL_ID,
        externalReference: `mat_sub_${organizationId}_${subscriptionId}_abcdef01`,
        status: "active",
        // Two members at the plan price.
        amountArs: PRICE * 2,
        currency: "ARS",
        familyMemberCount: 2,
        billingAnchorAt: now - 40 * DAY_MS,
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
      periodEnd,
    };
  });
}

const readAgreement = (t: TestConvex, id: Id<"memberRecurringAgreements">) =>
  t.run((ctx) => ctx.db.get(id));
const readOperations = (t: TestConvex) =>
  t.run((ctx) => ctx.db.query("memberPaymentProviderOperations").collect());

async function runWorker(t: TestConvex, fake?: FakeMercadoPago) {
  if (fake) __setMercadoPagoTransportForTests(fake.transport);
  await t.action(internal.memberPaymentsActions.runProviderOperations, {});
}

function updateFake() {
  const fake = new FakeMercadoPago();
  fake.onJson("PUT /preapproval/*", preapprovalResponse());
  return fake;
}

describe("family changes", () => {
  it("schedules a larger next charge when a member joins the group", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.pendingAmountArs).toBe(PRICE * 3);
    expect(agreement!.pendingAmountEffectiveAt).toBe(fixture.periodEnd);
    expect(agreement!.familyMemberCount).toBe(3);
    // The cycle in progress is untouched: no mid-month difference is charged.
    expect(agreement!.amountArs).toBe(PRICE * 2);

    const [operation] = await readOperations(t);
    expect(operation!.operation).toBe("update_amount");
    expect(operation!.input).toEqual({
      amountArs: PRICE * 3,
      effectiveAt: fixture.periodEnd,
    });
  });

  it("schedules a smaller next charge when a member leaves", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.cancel, {
        subscriptionId: fixture.childSubscriptionId,
      });

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.pendingAmountArs).toBe(PRICE);
    expect(agreement!.amountArs).toBe(PRICE * 2);
    expect((await readOperations(t))[0]!.operation).toBe("update_amount");
  });

  it("tells the provider without touching the amount the member is paying now", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    const fake = updateFake();
    await runWorker(t, fake);

    // One amount update, and never a charge.
    expect(fake.countFor("PUT /preapproval/*")).toBe(1);
    expect((fake.requests[0]!.body as any).auto_recurring.transaction_amount).toBe(
      PRICE * 3,
    );
    expect(fake.requests.some((request) => request.method === "POST")).toBe(false);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.amountArs).toBe(PRICE * 2);
    expect(agreement!.pendingAmountArs).toBe(PRICE * 3);
  });

  it("does nothing for a member who pays by transfer", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t, { paymentMode: "manual" });

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    expect(await readOperations(t)).toHaveLength(0);
  });

  it("collapses repeated edits into one provider call carrying the latest size", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.cancel, {
        subscriptionId: fixture.childSubscriptionId,
      });

    const operations = await readOperations(t);
    expect(operations).toHaveLength(1);
    // One member joined and one left, so the size is back where it started —
    // but Mercado Pago was already told the larger figure, so the correction
    // still has to be sent.
    expect(operations[0]!.input!.amountArs).toBe(PRICE * 2);
    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.pendingAmountArs).toBeUndefined();
  });
});

describe("bonifications", () => {
  const createBonification = (
    t: TestConvex,
    fixture: Fixture,
    discountType: "percentage" | "fixed" | "full",
    discountValue: number,
  ) =>
    t.withIdentity({ subject: ADMIN }).mutation(api.planBonifications.create, {
      subscriptionId: fixture.subscriptionId,
      discountType,
      discountValue,
      reason: "friend_and_family",
    });

  it("schedules the discounted amount for the next cycle", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);

    await createBonification(t, fixture, "percentage", 50);

    const agreement = await readAgreement(t, fixture.agreementId);
    // 50% off the per-member price, times two members.
    expect(agreement!.pendingAmountArs).toBe(PRICE);
    expect(agreement!.pendingAmountEffectiveAt).toBe(fixture.periodEnd);
    expect(agreement!.amountArs).toBe(PRICE * 2);
    expect((await readOperations(t))[0]!.operation).toBe("update_amount");
  });

  it("pauses the debit for a full bonification and keeps access", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);

    await createBonification(t, fixture, "full", 0);

    const [operation] = await readOperations(t);
    expect(operation!.operation).toBe("pause");

    await runWorker(t, updateFake());

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("paused_bonification");
    // The member keeps training; a full bonification is not a suspension.
    const subscription = await t.run((ctx) => ctx.db.get(fixture.subscriptionId));
    expect(subscription!.status).toBe("active");
  });

  it("schedules the new amount when the discount is edited", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await createBonification(t, fixture, "percentage", 50);
    await runWorker(t, updateFake());

    const [bonification] = await t.run((ctx) =>
      ctx.db.query("planBonifications").collect(),
    );
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.planBonifications.update, {
        bonificationId: bonification!._id,
        discountValue: 25,
      });

    const agreement = await readAgreement(t, fixture.agreementId);
    // 25% off, two members.
    expect(agreement!.pendingAmountArs).toBe(Math.round(PRICE * 0.75) * 2);
  });

  it("restores the full amount and resumes the debit when revoked", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await createBonification(t, fixture, "full", 0);
    await runWorker(t, updateFake());
    expect((await readAgreement(t, fixture.agreementId))!.status).toBe(
      "paused_bonification",
    );

    const [bonification] = await t.run((ctx) =>
      ctx.db.query("planBonifications").collect(),
    );
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.planBonifications.revoke, {
        bonificationId: bonification!._id,
      });

    const queued = (await readOperations(t)).filter(
      (operation) => operation.status === "queued",
    );
    expect(queued.map((operation) => operation.operation).sort()).toEqual([
      "resume",
      "update_amount",
    ]);
    // The resume is ordered behind the amount change, so the provider never
    // reinstates the bonified amount for the next charge.
    const resume = queued.find((operation) => operation.operation === "resume")!;
    const update = queued.find(
      (operation) => operation.operation === "update_amount",
    )!;
    expect(resume.executeAfter).toBeGreaterThan(update.executeAfter);

    // The amount goes back to what it was before the pause, so there is no
    // pending change left to announce — but the provider is still re-told the
    // figure, because the pause had scheduled zero.
    expect(update.input!.amountArs).toBe(PRICE * 2);
    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.amountArs).toBe(PRICE * 2);
    expect(agreement!.pendingAmountArs).toBeUndefined();
  });

  it("never charges immediately when resuming would take money early", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { status: "paused_bonification" }),
    );

    await t.mutation(internal.memberPayments.enqueueProviderOperationInternal, {
      organizationId: fixture.organizationId,
      connectionId: fixture.connectionId,
      agreementId: fixture.agreementId,
      operation: "resume",
    });

    // Mercado Pago comes back intending to charge today, not at the cycle end.
    const fake = new FakeMercadoPago();
    fake.onJson(
      "PUT /preapproval/*",
      preapprovalResponse({
        status: "authorized",
        next_payment_date: new Date().toISOString(),
      }),
    );
    await runWorker(t, fake);

    const agreement = await readAgreement(t, fixture.agreementId);
    // The debit is abandoned rather than allowed to take money early.
    expect(agreement!.status).toBe("failed");
    expect(agreement!.nextChargeAt).toBeUndefined();

    const cancelQueued = (await readOperations(t)).find(
      (operation) => operation.operation === "cancel",
    );
    expect(cancelQueued).toBeTruthy();
  });

  it("resumes normally when the provider keeps the intended charge date", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { status: "paused_bonification" }),
    );

    await t.mutation(internal.memberPayments.enqueueProviderOperationInternal, {
      organizationId: fixture.organizationId,
      connectionId: fixture.connectionId,
      agreementId: fixture.agreementId,
      operation: "resume",
    });

    const fake = new FakeMercadoPago();
    fake.onJson(
      "PUT /preapproval/*",
      preapprovalResponse({
        status: "authorized",
        next_payment_date: new Date(fixture.periodEnd).toISOString(),
      }),
    );
    await runWorker(t, fake);

    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.status).toBe("active");
    expect(agreement!.nextChargeAt).toBe(fixture.periodEnd);
  });
});

describe("provider failures", () => {
  it("keeps the scheduled amount queued when the provider rejects the update", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    const fake = new FakeMercadoPago();
    fake.on("PUT /preapproval/*", errorResponse(500, providerErrors.serverError));
    await runWorker(t, fake);

    const [operation] = await readOperations(t);
    expect(operation!.status).toBe("queued");
    expect(operation!.attempts).toBe(1);

    // The intent survives the failure so a retry still carries it.
    const agreement = await readAgreement(t, fixture.agreementId);
    expect(agreement!.pendingAmountArs).toBe(PRICE * 3);
  });

  it("parks a rejected update for an operator instead of retrying forever", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    const fake = new FakeMercadoPago();
    fake.on("PUT /preapproval/*", errorResponse(400, providerErrors.validation));
    await runWorker(t, fake);

    expect((await readOperations(t))[0]!.status).toBe("permanently_failed");
  });
});

describe("who may manage the agreement", () => {
  it("shows the payer as the payer and the child as not", async () => {
    const t = convexTest(schema, modules);
    await seedFamilyOnDebit(t);

    const payerState = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});
    const childState = await t
      .withIdentity({ subject: FAMILY_CHILD })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});

    expect(payerState!.isPayer).toBe(true);
    expect(payerState!.isFamilyChild).toBe(false);
    expect(childState!.isPayer).toBe(false);
    expect(childState!.isFamilyChild).toBe(true);
    // The child still sees the group's billing state, but cannot act on it.
    expect(childState!.billingState).toBe("active");
  });

  it("refuses to start a second agreement from a family child", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    __setMercadoPagoTransportForTests(new FakeMercadoPago().transport);

    await expect(
      t
        .withIdentity({ subject: FAMILY_CHILD })
        .action(api.memberPaymentsActions.startRecurringCheckout, {
          planId: fixture.planId,
        }),
    ).rejects.toThrow(/titular/);
  });

  it("surfaces the pending amount and its date to the payer", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFamilyOnDebit(t);
    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPlanSubscriptions.associateToFamilyGroup, {
        userId: OUTSIDER,
        parentSubscriptionId: fixture.subscriptionId,
      });

    const state = await t
      .withIdentity({ subject: MEMBER })
      .query(api.memberPaymentsCheckout.getMyRecurringState, {});

    expect(state!.amountArs).toBe(PRICE * 2);
    expect(state!.pendingAmountArs).toBe(PRICE * 3);
    expect(state!.pendingAmountEffectiveAt).toBe(fixture.periodEnd);
  });
});
