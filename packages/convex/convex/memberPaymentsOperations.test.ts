import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  computeRetryDelayMs,
  decideOperationOutcome,
  hasExhaustedAttempts,
  mapPreapprovalStatusToAgreement,
  MAX_OPERATION_ATTEMPTS,
  OPERATION_RETRY_BASE_MS,
  OPERATION_RETRY_MAX_MS,
  OPERATION_STALE_RUNNING_MS,
} from "./memberPaymentDomain";
import { FakeMercadoPago, errorResponse, jsonResponse } from "./mercadoPago.fake";
import { preapprovalResponse, providerErrors } from "./mercadoPago.fixtures";

const modules = import.meta.glob("./**/*.*s");

const ADMIN = "user_admin";
const MEMBER = "user_member";
const PREAPPROVAL_ID = "2c9380848a1b2c3d";

beforeEach(() => {
  process.env.MERCADOPAGO_CLIENT_ID = "test-client-id";
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-client-secret";
  process.env.MEMBER_PAYMENTS_OAUTH_REDIRECT_URL =
    "https://deployment.convex.site/member-payments/oauth/callback";
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY = btoa(
    "0123456789abcdef0123456789abcdef",
  );
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION = "v1";
  process.env.MEMBER_PAYMENTS_WEB_APP_URL = "https://app.matgestion.app";
});

// ---------------------------------------------------------------------------
// Retry policy (pure)
// ---------------------------------------------------------------------------

describe("retry policy", () => {
  it("backs off exponentially from the base delay", () => {
    expect(computeRetryDelayMs(1)).toBe(OPERATION_RETRY_BASE_MS);
    expect(computeRetryDelayMs(2)).toBe(OPERATION_RETRY_BASE_MS * 2);
    expect(computeRetryDelayMs(3)).toBe(OPERATION_RETRY_BASE_MS * 4);
    expect(computeRetryDelayMs(4)).toBe(OPERATION_RETRY_BASE_MS * 8);
  });

  it("never waits longer than the cap", () => {
    expect(computeRetryDelayMs(50)).toBe(OPERATION_RETRY_MAX_MS);
    for (let attempts = 1; attempts <= 50; attempts += 1) {
      expect(computeRetryDelayMs(attempts)).toBeLessThanOrEqual(
        OPERATION_RETRY_MAX_MS,
      );
    }
  });

  it("gives up after the bounded number of attempts", () => {
    expect(hasExhaustedAttempts(MAX_OPERATION_ATTEMPTS - 1)).toBe(false);
    expect(hasExhaustedAttempts(MAX_OPERATION_ATTEMPTS)).toBe(true);
  });

  it("parks a non-retryable failure immediately", () => {
    expect(
      decideOperationOutcome({
        succeeded: false,
        retryable: false,
        attempts: 1,
        now: 0,
      }),
    ).toEqual({ status: "permanently_failed" });
  });

  it("requeues a retryable failure with backoff", () => {
    expect(
      decideOperationOutcome({
        succeeded: false,
        retryable: true,
        attempts: 2,
        now: 1_000,
      }),
    ).toEqual({
      status: "queued",
      executeAfter: 1_000 + OPERATION_RETRY_BASE_MS * 2,
    });
  });

  it("parks a retryable failure once attempts run out", () => {
    expect(
      decideOperationOutcome({
        succeeded: false,
        retryable: true,
        attempts: MAX_OPERATION_ATTEMPTS,
        now: 0,
      }),
    ).toEqual({ status: "permanently_failed" });
  });
});

describe("preapproval status mapping", () => {
  it("never promotes an unauthorized agreement straight to active", () => {
    expect(
      mapPreapprovalStatusToAgreement("authorized", "pending_authorization"),
    ).toBe("pending_first_payment");
  });

  it("leaves an already-charging agreement alone", () => {
    expect(mapPreapprovalStatusToAgreement("authorized", "active")).toBe("active");
    expect(mapPreapprovalStatusToAgreement("authorized", "retrying")).toBe(
      "retrying",
    );
  });

  it("respects a scheduled cancellation rather than cancelling early", () => {
    expect(
      mapPreapprovalStatusToAgreement("cancelled", "cancellation_scheduled"),
    ).toBe("cancellation_scheduled");
    expect(mapPreapprovalStatusToAgreement("cancelled", "active")).toBe(
      "cancelled",
    );
  });

  it("ignores a status it does not model", () => {
    expect(mapPreapprovalStatusToAgreement("something_new", "active")).toBe(
      "active",
    );
  });
});

// ---------------------------------------------------------------------------
// Outbox worker (integration)
// ---------------------------------------------------------------------------

type T = ReturnType<typeof convexTest>;

type Fixture = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  agreementId: Id<"memberRecurringAgreements">;
};

async function seedConnectedAgreement(
  t: T,
  options: { preapprovalId?: string | undefined; agreementStatus?: any } = {},
): Promise<Fixture> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "Gym A",
      slug: `gym-${now}`,
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

    // A connection whose ciphertext decrypts with the test key.
    const connectionId = await ctx.db.insert(
      "organizationPaymentProviderConnections",
      {
        organizationId,
        provider: "mercadopago",
        status: "active",
        providerAccountId: "111111111",
        accessTokenCiphertext: "PLACEHOLDER",
        accessTokenIv: "PLACEHOLDER",
        refreshTokenCiphertext: "PLACEHOLDER",
        refreshTokenIv: "PLACEHOLDER",
        encryptionKeyVersion: "v1",
        webhookRoutingKey: "routing-key",
        lastRefreshedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    );

    const planId = await ctx.db.insert("membershipPlans", {
      organizationId,
      name: "Mensual",
      priceArs: 30_000,
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
      activatedAt: now,
      paymentMode: "mercadopago_recurring",
      createdAt: now,
      updatedAt: now,
    });

    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId,
      connectionId,
      subscriptionId,
      payerUserId: MEMBER,
      providerPreapprovalId:
        "preapprovalId" in options ? options.preapprovalId : PREAPPROVAL_ID,
      externalReference: "mat_sub_org_sub_abc",
      status: options.agreementStatus ?? "active",
      amountArs: 30_000,
      currency: "ARS",
      familyMemberCount: 1,
      billingAnchorAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId, connectionId, agreementId };
  });
}

/**
 * The worker resolves a real access token by decrypting the stored ciphertext.
 * Seeded rows carry a placeholder, so this replaces them with a token the test
 * key can actually decrypt.
 */
async function encryptSeededCredentials(t: T, connectionId: Fixture["connectionId"]) {
  const { encryptSecret } = await import("./memberPaymentsCrypto");
  const config = {
    key: process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY!,
    keyVersion: "v1",
  };
  const [access, refresh] = await Promise.all([
    encryptSecret("TEST-gym-token", config),
    encryptSecret("TG-gym-refresh", config),
  ]);
  await t.run(async (ctx) => {
    await ctx.db.patch(connectionId, {
      accessTokenCiphertext: access.ciphertext,
      accessTokenIv: access.iv,
      refreshTokenCiphertext: refresh.ciphertext,
      refreshTokenIv: refresh.iv,
    });
  });
}

async function enqueue(
  t: T,
  fixture: Fixture,
  operation: "update_amount" | "pause" | "resume" | "cancel" | "resync",
  input?: { amountArs?: number; effectiveAt?: number; reason?: string },
) {
  return (await t.mutation(
    internal.memberPayments.enqueueProviderOperationInternal,
    {
      organizationId: fixture.organizationId,
      connectionId: fixture.connectionId,
      agreementId: fixture.agreementId,
      operation,
      input,
    },
  )) as Id<"memberPaymentProviderOperations">;
}

const readOperation = (t: T, operationId: Id<"memberPaymentProviderOperations">) =>
  t.run((ctx) => ctx.db.get(operationId));

describe("enqueueing provider operations", () => {
  it("queues an operation with a persisted idempotency key", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);

    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 60_000,
    });

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("queued");
    expect(operation!.attempts).toBe(0);
    expect(operation!.idempotencyKey).toContain(String(operationId));
    expect(operation!.input).toEqual({ amountArs: 60_000 });
  });

  it("supersedes a still-queued operation of the same kind instead of stacking", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);

    const first = await enqueue(t, fixture, "update_amount", { amountArs: 60_000 });
    const second = await enqueue(t, fixture, "update_amount", { amountArs: 90_000 });

    expect(second).toBe(first);
    const operations = await t.run((ctx) =>
      ctx.db.query("memberPaymentProviderOperations").collect(),
    );
    expect(operations).toHaveLength(1);
    // The provider should be told the latest amount, not an obsolete one.
    expect(operations[0]!.input).toEqual({ amountArs: 90_000 });
  });

  it("keeps operations of different kinds separate", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);

    await enqueue(t, fixture, "update_amount", { amountArs: 60_000 });
    await enqueue(t, fixture, "pause");

    const operations = await t.run((ctx) =>
      ctx.db.query("memberPaymentProviderOperations").collect(),
    );
    expect(operations).toHaveLength(2);
  });
});

describe("claiming operations", () => {
  it("claims a due operation exactly once", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    await enqueue(t, fixture, "pause");

    const first = await t.mutation(
      internal.memberPayments.claimDueOperationsInternal,
      {},
    );
    const second = await t.mutation(
      internal.memberPayments.claimDueOperationsInternal,
      {},
    );

    expect(first).toHaveLength(1);
    // A second worker pass must not pick up the same running operation.
    expect(second).toHaveLength(0);
  });

  it("does not claim an operation whose backoff has not elapsed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");
    await t.run((ctx) =>
      ctx.db.patch(operationId, { executeAfter: Date.now() + 60_000 }),
    );

    expect(
      await t.mutation(internal.memberPayments.claimDueOperationsInternal, {}),
    ).toHaveLength(0);
  });

  it("reclaims an operation left running by a crashed worker", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");

    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});
    await t.run((ctx) =>
      ctx.db.patch(operationId, {
        updatedAt: Date.now() - OPERATION_STALE_RUNNING_MS - 1_000,
      }),
    );

    const reclaimed = await t.mutation(
      internal.memberPayments.claimDueOperationsInternal,
      {},
    );
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!._id).toBe(operationId);
  });
});

describe("running provider operations", () => {
  async function readyGym(t: T, options?: { preapprovalId?: string }) {
    const fixture = await seedConnectedAgreement(t, options ?? {});
    await encryptSeededCredentials(t, fixture.connectionId);
    return fixture;
  }

  it("schedules an amount change for the next cycle once the provider confirms it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 90_000,
    });
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("succeeded");
    expect(operation!.attempts).toBe(1);
    expect(operation!.completedAt).toBeGreaterThan(0);

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    // The provider now bills the new amount from the next charge. The member
    // is still on the old amount for the cycle they already paid for, so
    // `amountArs` only moves when a charge at the new amount is approved.
    expect(agreement!.pendingAmountArs).toBe(90_000);
    expect(agreement!.amountArs).toBe(30_000);

    // The persisted key travelled with the call.
    expect(fake.requests[0]!.idempotencyKey).toBe(operation!.idempotencyKey);
  });

  it("pauses and resumes an agreement", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    await enqueue(t, fixture, "pause");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.agreementId)))!.status,
    ).toBe("paused_bonification");

    await enqueue(t, fixture, "resume");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.agreementId)))!.status,
    ).toBe("active");
  });

  it("never revives a cancelled agreement with a resume", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { status: "cancelled" }),
    );
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse());
    __setMercadoPagoTransportForTests(fake.transport);

    await enqueue(t, fixture, "resume");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    expect(
      (await t.run((ctx) => ctx.db.get(fixture.agreementId)))!.status,
    ).toBe("cancelled");
  });

  it("closes the agreement when nothing is waiting on an access-end date", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse({ status: "cancelled" }));
    __setMercadoPagoTransportForTests(fake.transport);

    await enqueue(t, fixture, "cancel");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.providerCancelledAt).toBeGreaterThan(0);
    expect(agreement!.nextChargeAt).toBeUndefined();
    // No disclosed end date: this was a payment-method switch, and the
    // agreement has nothing left to do.
    expect(agreement!.status).toBe("cancelled");
  });

  it("leaves a leaving member's agreement scheduled until their access ends", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const accessEndsAt = Date.now() + 20 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      const agreement = await ctx.db.get(fixture.agreementId);
      await ctx.db.patch(agreement!.subscriptionId, { accessEndsAt });
      await ctx.db.patch(fixture.agreementId, {
        status: "cancellation_scheduled",
      });
    });

    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse({ status: "cancelled" }));
    __setMercadoPagoTransportForTests(fake.transport);

    await enqueue(t, fixture, "cancel");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.providerCancelledAt).toBeGreaterThan(0);
    // Debits stop now; access runs to the date the member was shown.
    expect(agreement!.status).toBe("cancellation_scheduled");
  });

  it("resyncs the agreement from the provider's own view", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { status: "pending_authorization" }),
    );
    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /preapproval/*",
      preapprovalResponse({
        status: "authorized",
        next_payment_date: "2026-04-10T00:00:00.000Z",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);

    await enqueue(t, fixture, "resync");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    // Authorized but not yet charged: still no access.
    expect(agreement!.status).toBe("pending_first_payment");
    expect(agreement!.nextChargeAt).toBe(Date.parse("2026-04-10T00:00:00.000Z"));
  });

  it("requeues a rate-limited operation with backoff", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.on("PUT /preapproval/*", errorResponse(429, providerErrors.rateLimited));
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 90_000,
    });
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("queued");
    expect(operation!.attempts).toBe(1);
    expect(operation!.executeAfter).toBeGreaterThan(Date.now());
    expect(operation!.lastError).toBeTruthy();

    // Nothing is scheduled until the provider confirms.
    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.amountArs).toBe(30_000);
    expect(agreement!.pendingAmountArs).toBeUndefined();
  });

  it("requeues a provider fault and succeeds on the retry", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.onSequence("PUT /preapproval/*", [
      errorResponse(500, providerErrors.serverError),
      jsonResponse(preapprovalResponse()),
    ]);
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 90_000,
    });
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});
    // Fast-forward past the backoff.
    await t.run((ctx) => ctx.db.patch(operationId, { executeAfter: Date.now() }));
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("succeeded");
    expect(operation!.attempts).toBe(2);
    // Both attempts carried the same idempotency key.
    const keys = fake.idempotencyKeysFor("PUT /preapproval/*");
    expect(new Set(keys).size).toBe(1);
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.agreementId)))!.pendingAmountArs,
    ).toBe(90_000);
  });

  it("parks a validation error immediately instead of retrying it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.on("PUT /preapproval/*", errorResponse(400, providerErrors.validation));
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 90_000,
    });
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("permanently_failed");
    expect(operation!.attempts).toBe(1);
    expect(fake.countFor("PUT /preapproval/*")).toBe(1);
  });

  it("parks an operation whose agreement has no provider resource", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t, { preapprovalId: undefined });
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { providerPreapprovalId: undefined }),
    );
    const fake = new FakeMercadoPago();
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "pause");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("permanently_failed");
    expect(fake.requests).toHaveLength(0);
  });

  it("parks an update_amount with no amount rather than calling the provider", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "update_amount");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    expect((await readOperation(t, operationId))!.status).toBe(
      "permanently_failed",
    );
    expect(fake.requests).toHaveLength(0);
  });

  it("keeps a broken connection retryable so reconnecting repairs it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.connectionId, { status: "disconnected" }),
    );
    __setMercadoPagoTransportForTests(new FakeMercadoPago().transport);

    const operationId = await enqueue(t, fixture, "pause");
    await t.action(internal.memberPaymentsActions.runProviderOperations, {});

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("queued");
    expect(operation!.attempts).toBe(1);
  });

  it("gives up after the bounded number of attempts", async () => {
    const t = convexTest(schema, modules);
    const fixture = await readyGym(t);
    const fake = new FakeMercadoPago();
    fake.on("PUT /preapproval/*", errorResponse(500, providerErrors.serverError));
    __setMercadoPagoTransportForTests(fake.transport);

    const operationId = await enqueue(t, fixture, "pause");
    for (let pass = 0; pass < MAX_OPERATION_ATTEMPTS + 2; pass += 1) {
      await t.run((ctx) =>
        ctx.db.patch(operationId, { executeAfter: Date.now() }),
      );
      await t.action(internal.memberPaymentsActions.runProviderOperations, {});
    }

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("permanently_failed");
    expect(operation!.attempts).toBe(MAX_OPERATION_ATTEMPTS);
    // It stops calling the provider once parked.
    expect(fake.countFor("PUT /preapproval/*")).toBe(MAX_OPERATION_ATTEMPTS);
  });
});

describe("duplicate completion", () => {
  it("does not re-apply an amount change when completion is repeated", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "update_amount", {
      amountArs: 90_000,
    });
    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});

    const first = await t.mutation(
      internal.memberPayments.completeOperationInternal,
      { operationId, succeeded: true },
    );
    // A duplicated worker pass, or a redelivered completion.
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { pendingAmountArs: 120_000 }),
    );
    const second = await t.mutation(
      internal.memberPayments.completeOperationInternal,
      { operationId, succeeded: true },
    );

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    const operation = await readOperation(t, operationId);
    expect(operation!.attempts).toBe(1);
    // The second completion must not have overwritten the newer amount.
    expect(
      (await t.run((ctx) => ctx.db.get(fixture.agreementId)))!.pendingAmountArs,
    ).toBe(120_000);
  });

  it("does not reopen a permanently failed operation", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");
    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});
    await t.mutation(internal.memberPayments.completeOperationInternal, {
      operationId,
      succeeded: false,
      retryable: false,
      error: "rejected",
    });

    const late = await t.mutation(
      internal.memberPayments.completeOperationInternal,
      { operationId, succeeded: true },
    );

    expect(late.applied).toBe(false);
    expect((await readOperation(t, operationId))!.status).toBe(
      "permanently_failed",
    );
  });
});

describe("retryProviderOperation", () => {
  it("lets an admin requeue a parked operation with a fresh key", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");
    await t.mutation(internal.memberPayments.claimDueOperationsInternal, {});
    await t.mutation(internal.memberPayments.completeOperationInternal, {
      operationId,
      succeeded: false,
      retryable: false,
      error: "rejected",
    });
    const parkedKey = (await readOperation(t, operationId))!.idempotencyKey;

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPayments.retryProviderOperation, { operationId });

    const operation = await readOperation(t, operationId);
    expect(operation!.status).toBe("queued");
    expect(operation!.attempts).toBe(0);
    expect(operation!.lastError).toBeUndefined();
    expect(operation!.idempotencyKey).not.toBe(parkedKey);
  });

  it("refuses a non-admin", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .mutation(api.memberPayments.retryProviderOperation, { operationId }),
    ).rejects.toThrow(/Admin role/i);
  });

  it("refuses to requeue an operation that has not failed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedConnectedAgreement(t);
    const operationId = await enqueue(t, fixture, "pause");

    await expect(
      t
        .withIdentity({ subject: ADMIN })
        .mutation(api.memberPayments.retryProviderOperation, { operationId }),
    ).rejects.toThrow(/fallaron/);
  });
});
