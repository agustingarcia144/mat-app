import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  buildExternalReference,
  buildWebhookEventKey,
  buildWebhookSignatureManifest,
  classifyWebhookTopic,
  canApplyTransactionStatus,
  isWebhookTimestampFresh,
  MAX_WEBHOOK_AGE_MS,
  mapProviderPaymentStatus,
  parseSignatureHeader,
  parseWebhookRoutingKey,
} from "./memberPaymentDomain";
import { encryptSecret, hmacSha256Hex } from "./memberPaymentsCrypto";
import { FakeMercadoPago, errorResponse } from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  paymentResponse,
  preapprovalResponse,
  SELLER_A,
  SELLER_B,
} from "./mercadoPago.fixtures";

import { drainScheduled } from "./memberPayments.testing";

const modules = import.meta.glob("./**/*.*s");

const MEMBER = "user_member";
const ROUTING_KEY = "routing-key-gym-a";
const WEBHOOK_SECRET = "test-webhook-secret";
const PREAPPROVAL_ID = "2c9380848a1b2c3d";
const TEST_KEY = btoa("0123456789abcdef0123456789abcdef");

beforeEach(() => {
  process.env.MERCADOPAGO_CLIENT_ID = "test-client-id";
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-client-secret";
  process.env.MEMBER_PAYMENTS_OAUTH_REDIRECT_URL =
    "https://deployment.convex.site/member-payments/oauth/callback";
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY = TEST_KEY;
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION = "v1";
  process.env.MEMBER_PAYMENTS_WEB_APP_URL = "https://app.matgestion.app";
  process.env.MEMBER_PAYMENTS_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

describe("topic classification", () => {
  it("never sends a subscription charge to the one-time payments endpoint", () => {
    // The topic contains "payment" but is a different resource entirely.
    expect(classifyWebhookTopic("subscription_authorized_payment")).toBe(
      "subscription_authorized_payment",
    );
    expect(classifyWebhookTopic("authorized_payment")).toBe(
      "subscription_authorized_payment",
    );
  });

  it("recognises preapproval and one-time payment topics", () => {
    expect(classifyWebhookTopic("subscription_preapproval")).toBe(
      "subscription_preapproval",
    );
    expect(classifyWebhookTopic("preapproval")).toBe("subscription_preapproval");
    expect(classifyWebhookTopic("payment")).toBe("payment");
    expect(classifyWebhookTopic("PAYMENT")).toBe("payment");
  });

  it("ignores topics member payments do not act on", () => {
    for (const topic of [
      "plan",
      "invoice",
      "point_integration_wh",
      "merchant_order",
      "",
      undefined,
      null,
    ]) {
      expect(classifyWebhookTopic(topic as string)).toBeNull();
    }
  });
});

describe("signature inputs", () => {
  it("builds the manifest Mercado Pago signs", () => {
    expect(
      buildWebhookSignatureManifest({
        dataId: "ABC123",
        requestId: "req-1",
        ts: "1700000000",
      }),
    ).toBe("id:abc123;request-id:req-1;ts:1700000000;");
  });

  it("parses the ts and v1 parts of the signature header", () => {
    expect(parseSignatureHeader("ts=123,v1=deadbeef")).toEqual({
      ts: "123",
      v1: "deadbeef",
    });
    expect(parseSignatureHeader(null)).toEqual({ ts: undefined, v1: undefined });
  });

  it("accepts fresh timestamps in seconds or milliseconds and rejects old ones", () => {
    const now = 1_700_000_000_000;
    expect(isWebhookTimestampFresh("1700000000", now)).toBe(true);
    expect(isWebhookTimestampFresh(String(now), now)).toBe(true);
    expect(
      isWebhookTimestampFresh(String(now - MAX_WEBHOOK_AGE_MS - 1_000), now),
    ).toBe(false);
    expect(isWebhookTimestampFresh("not-a-number", now)).toBe(false);
  });
});

describe("routing key parsing", () => {
  it("reads the key out of the notification path", () => {
    expect(parseWebhookRoutingKey("/member-payments/webhook/abc123")).toBe(
      "abc123",
    );
    expect(parseWebhookRoutingKey("/member-payments/webhook/abc123/extra")).toBe(
      "abc123",
    );
  });

  it("rejects anything else", () => {
    expect(parseWebhookRoutingKey("/member-payments/webhook/")).toBeNull();
    expect(parseWebhookRoutingKey("/mercadopago-webhook")).toBeNull();
  });
});

describe("event deduplication key", () => {
  it("uses the provider request id when there is one", () => {
    expect(
      buildWebhookEventKey({
        connectionId: "conn1",
        requestId: "req-9",
        topic: "payment",
        resourceId: "7",
      }),
    ).toBe("conn1:req:req-9");
  });

  it("is scoped to the connection so two gyms never collide", () => {
    const a = buildWebhookEventKey({
      connectionId: "conn1",
      topic: "payment",
      resourceId: "7",
    });
    const b = buildWebhookEventKey({
      connectionId: "conn2",
      topic: "payment",
      resourceId: "7",
    });
    expect(a).not.toBe(b);
  });
});

describe("provider payment status mapping", () => {
  it("maps the statuses that decide access", () => {
    expect(mapProviderPaymentStatus("approved")).toBe("approved");
    expect(mapProviderPaymentStatus("rejected")).toBe("rejected");
    expect(mapProviderPaymentStatus("refunded")).toBe("refunded");
    expect(mapProviderPaymentStatus("charged_back")).toBe("charged_back");
    expect(mapProviderPaymentStatus("in_process")).toBe("pending");
    expect(mapProviderPaymentStatus("something_new")).toBe("unknown");
    expect(mapProviderPaymentStatus(undefined)).toBe("unknown");
  });
});

describe("transaction status transitions", () => {
  it("never walks an approved payment back to pending or rejected", () => {
    expect(canApplyTransactionStatus("approved", "pending")).toBe(false);
    expect(canApplyTransactionStatus("approved", "rejected")).toBe(false);
    expect(canApplyTransactionStatus("approved", "unknown")).toBe(false);
  });

  it("allows the genuine reversals", () => {
    expect(canApplyTransactionStatus("approved", "refunded")).toBe(true);
    expect(canApplyTransactionStatus("approved", "charged_back")).toBe(true);
  });

  it("treats a reversal as final", () => {
    expect(canApplyTransactionStatus("refunded", "approved")).toBe(false);
    expect(canApplyTransactionStatus("charged_back", "approved")).toBe(false);
  });

  it("lets a pending payment move anywhere", () => {
    expect(canApplyTransactionStatus("pending", "approved")).toBe(true);
    expect(canApplyTransactionStatus("pending", "rejected")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end webhook pipeline
// ---------------------------------------------------------------------------

type T = ReturnType<typeof convexTest>;

type Fixture = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  subscriptionId: Id<"memberPlanSubscriptions">;
  agreementId: Id<"memberRecurringAgreements">;
  externalReference: string;
};

async function seedGym(t: T): Promise<Fixture> {
  const credentials = await Promise.all([
    encryptSecret("TEST-gym-token", { key: TEST_KEY, keyVersion: "v1" }),
    encryptSecret("TG-gym-refresh", { key: TEST_KEY, keyVersion: "v1" }),
  ]);

  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "Gym A",
      slug: `gym-${now}`,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: MEMBER,
      role: "member",
      status: "active",
      joinedAt: now,
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

    const planId = await ctx.db.insert("membershipPlans", {
      organizationId,
      name: "Mensual",
      priceArs: 30_000,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      billingMode: "join_date",
      isActive: true,
      createdBy: "admin",
      createdAt: now,
      updatedAt: now,
    });

    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: MEMBER,
      planId,
      status: "pending_payment",
      activatedAt: now,
      paymentMode: "mercadopago_recurring",
      createdAt: now,
      updatedAt: now,
    });

    const externalReference = buildExternalReference({
      kind: "sub",
      organizationId: String(organizationId),
      localId: String(subscriptionId),
      nonce: "abc",
    });

    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId,
      connectionId,
      subscriptionId,
      payerUserId: MEMBER,
      providerPreapprovalId: PREAPPROVAL_ID,
      externalReference,
      status: "pending_first_payment",
      amountArs: 30_000,
      currency: "ARS",
      familyMemberCount: 1,
      billingAnchorAt: now,
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

async function postWebhook(
  t: T,
  options: {
    topic: string;
    resourceId: string;
    action?: string;
    routingKey?: string;
    secret?: string;
    ts?: string;
    requestId?: string;
    signature?: string;
  },
) {
  const ts = options.ts ?? String(Math.floor(Date.now() / 1000));
  const requestId = options.requestId ?? `req-${Math.random()}`;
  const signature =
    options.signature ??
    (await hmacSha256Hex(
      options.secret ?? WEBHOOK_SECRET,
      buildWebhookSignatureManifest({
        dataId: options.resourceId,
        requestId,
        ts,
      }),
    ));

  return await t.fetch(
    `/member-payments/webhook/${options.routingKey ?? ROUTING_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${signature}`,
      },
      body: JSON.stringify({
        type: options.topic,
        action: options.action ?? "created",
        data: { id: options.resourceId },
      }),
    },
  );
}

function fakeForGym(fixture: Fixture, overrides: (fake: FakeMercadoPago) => void) {
  const fake = new FakeMercadoPago();
  overrides(fake);
  __setMercadoPagoTransportForTests(fake.transport);
  return fake;
}

const readEvents = (t: T) =>
  t.run((ctx) => ctx.db.query("paymentProviderWebhookEvents").collect());
const readTransactions = (t: T) =>
  t.run((ctx) => ctx.db.query("memberPaymentTransactions").collect());

describe("webhook authentication", () => {
  it("rejects a request with no signature", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const response = await t.fetch(`/member-payments/webhook/${ROUTING_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "7" } }),
    });

    expect(response.status).toBe(401);
    expect(await readEvents(t)).toHaveLength(0);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const response = await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      secret: "not-the-real-secret",
    });

    expect(response.status).toBe(401);
    // Nothing is recorded for an unauthenticated notification.
    expect(await readEvents(t)).toHaveLength(0);
  });

  it("rejects a captured notification replayed later", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const staleTs = String(
      Math.floor((Date.now() - MAX_WEBHOOK_AGE_MS - 60_000) / 1000),
    );
    const response = await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      ts: staleTs,
    });

    expect(response.status).toBe(401);
    expect(await readEvents(t)).toHaveLength(0);
  });

  it("returns 404 for a path with no routing key", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/member-payments/webhook/", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(404);
  });

  it("acknowledges a signed notification for an unknown gym without work", async () => {
    const t = convexTest(schema, modules);
    await seedGym(t);

    const response = await postWebhook(t, {
      topic: "payment",
      resourceId: "7",
      routingKey: "routing-key-that-does-not-exist",
    });

    expect(response.status).toBe(200);
    expect(await readEvents(t)).toHaveLength(0);
  });
});

describe("webhook processing", () => {
  it("records an approved recurring charge fetched from the provider", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /authorized_payments/*",
        authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          transaction_amount: 30_000,
        }),
      ),
    );

    const response = await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
    });
    expect(response.status).toBe(200);

    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("processed");
    expect(event!.resourceType).toBe("subscription_authorized_payment");

    const transactions = await readTransactions(t);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("approved");
    expect(transactions[0]!.kind).toBe("recurring");
    expect(transactions[0]!.grossAmountArs).toBe(30_000);
    expect(transactions[0]!.providerAuthorizedPaymentId).toBe("5000000001");

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.lastPaymentStatus).toBe("approved");
    expect(agreement!.latestAuthorizedPaymentId).toBe("5000000001");
  });

  it("does not grant access on preapproval authorization alone", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, { status: "pending_authorization" }),
    );
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /preapproval/*",
        preapprovalResponse({
          status: "authorized",
          external_reference: fixture.externalReference,
        }),
      ),
    );

    await postWebhook(t, {
      topic: "subscription_preapproval",
      resourceId: PREAPPROVAL_ID,
    });
    await drainScheduled(t);

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.status).toBe("pending_first_payment");

    const subscription = await t.run((ctx) => ctx.db.get(fixture.subscriptionId));
    // Authorization is not payment: the member still has no access.
    expect(subscription!.status).toBe("pending_payment");
    expect(await readTransactions(t)).toHaveLength(0);
  });

  it("deduplicates a redelivered notification", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    const fake = fakeForGym(fixture, (f) =>
      f.onJson(
        "GET /authorized_payments/*",
        authorizedPaymentResponse({
          external_reference: fixture.externalReference,
        }),
      ),
    );

    const requestId = "req-duplicate";
    await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId,
    });
    await drainScheduled(t);
    await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
      requestId,
    });
    await drainScheduled(t);

    expect(await readEvents(t)).toHaveLength(1);
    // The redelivery did not cost another provider fetch.
    expect(fake.countFor("GET /authorized_payments/*")).toBe(1);
    expect(await readTransactions(t)).toHaveLength(1);
  });

  it("stays on one transaction when the same charge arrives twice with new ids", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /authorized_payments/*",
        authorizedPaymentResponse({
          external_reference: fixture.externalReference,
        }),
      ),
    );

    for (const requestId of ["req-1", "req-2"]) {
      await postWebhook(t, {
        topic: "subscription_authorized_payment",
        resourceId: "5000000001",
        requestId,
      });
      await drainScheduled(t);
    }

    expect(await readEvents(t)).toHaveLength(2);
    // Two notifications, one charge: keyed on the provider's own id.
    expect(await readTransactions(t)).toHaveLength(1);
  });

  it("never regresses an approved charge when a stale notification arrives", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);

    const fake = new FakeMercadoPago();
    fake.onSequence("GET /authorized_payments/*", [
      {
        status: 200,
        ok: true,
        body: authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          payment_status: "approved",
        }),
      },
      {
        status: 200,
        ok: true,
        body: authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          payment_status: "pending",
        }),
      },
    ]);
    __setMercadoPagoTransportForTests(fake.transport);

    for (const requestId of ["req-approved", "req-stale-pending"]) {
      await postWebhook(t, {
        topic: "subscription_authorized_payment",
        resourceId: "5000000001",
        requestId,
      });
      await drainScheduled(t);
    }

    const transactions = await readTransactions(t);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("approved");
  });

  it("accepts a genuine reversal of an approved charge", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);

    const fake = new FakeMercadoPago();
    fake.onSequence("GET /authorized_payments/*", [
      {
        status: 200,
        ok: true,
        body: authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          payment_status: "approved",
        }),
      },
      {
        status: 200,
        ok: true,
        body: authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          payment_status: "refunded",
        }),
      },
    ]);
    __setMercadoPagoTransportForTests(fake.transport);

    for (const requestId of ["req-approved", "req-refund"]) {
      await postWebhook(t, {
        topic: "subscription_authorized_payment",
        resourceId: "5000000001",
        requestId,
      });
      await drainScheduled(t);
    }

    expect((await readTransactions(t))[0]!.status).toBe("refunded");
  });

  it("ignores a resource belonging to a different seller account", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /preapproval/*",
        preapprovalResponse({
          collector_id: SELLER_B.userId,
          external_reference: fixture.externalReference,
        }),
      ),
    );

    await postWebhook(t, {
      topic: "subscription_preapproval",
      resourceId: PREAPPROVAL_ID,
    });
    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("ignored");
    expect(event!.error).toContain("seller_mismatch");
  });

  it("ignores a resource whose reference belongs to another gym", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /preapproval/*",
        preapprovalResponse({
          external_reference: buildExternalReference({
            kind: "sub",
            organizationId: "someothergymid",
            localId: "sub1",
            nonce: "abc",
          }),
        }),
      ),
    );

    await postWebhook(t, {
      topic: "subscription_preapproval",
      resourceId: PREAPPROVAL_ID,
    });
    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("ignored");
    expect(event!.error).toContain("organization_mismatch");
  });

  it("ignores a payment the gym took outside MAT", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /v1/payments/*",
        paymentResponse({ external_reference: "gym-own-store-order-42" }),
      ),
    );

    await postWebhook(t, { topic: "payment", resourceId: "7000000001" });
    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("ignored");
    expect(await readTransactions(t)).toHaveLength(0);
  });

  it("records the money but flags a charge whose amount was not agreed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /authorized_payments/*",
        authorizedPaymentResponse({
          external_reference: fixture.externalReference,
          transaction_amount: 99_999,
        }),
      ),
    );

    await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
    });
    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("processed");
    expect(event!.error).toContain("amount_mismatch");

    // Money that moved is never dropped, even when the amount is wrong.
    const transactions = await readTransactions(t);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.grossAmountArs).toBe(99_999);
  });

  it("marks an unknown resource as ignored rather than retrying forever", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.on("GET /authorized_payments/*", errorResponse(404, { message: "not found" })),
    );

    await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "does-not-exist",
    });
    await drainScheduled(t);

    expect((await readEvents(t))[0]!.status).toBe("ignored");
  });

  it("records an unsupported topic as ignored without fetching anything", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    const fake = fakeForGym(fixture, () => {});

    const response = await postWebhook(t, {
      topic: "merchant_order",
      resourceId: "123",
    });
    await drainScheduled(t);

    expect(response.status).toBe(200);
    expect((await readEvents(t))[0]!.status).toBe("ignored");
    expect(fake.requests).toHaveLength(0);
  });

  it("leaves a transient provider failure retryable", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.on("GET /authorized_payments/*", errorResponse(500, { message: "boom" })),
    );

    await postWebhook(t, {
      topic: "subscription_authorized_payment",
      resourceId: "5000000001",
    });
    await drainScheduled(t);

    const [event] = await readEvents(t);
    expect(event!.status).toBe("failed");
    expect(event!.error).toBeTruthy();
  });
});

describe("reconciliation", () => {
  it("repairs a first payment whose notification never arrived", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);

    // Make the agreement look stale so reconciliation picks it up.
    await t.run((ctx) =>
      ctx.db.patch(fixture.agreementId, {
        status: "pending_first_payment",
        updatedAt: Date.now() - 60 * 60 * 1000,
      }),
    );

    fakeForGym(fixture, (fake) => {
      fake.onJson(
        "GET /preapproval/*",
        preapprovalResponse({
          status: "authorized",
          external_reference: fixture.externalReference,
        }),
      );
      fake.onJson("GET /authorized_payments/search", {
        results: [
          authorizedPaymentResponse({
            external_reference: fixture.externalReference,
            payment_status: "approved",
          }),
        ],
      });
    });

    // No webhook was ever delivered.
    expect(await readEvents(t)).toHaveLength(0);

    const result = await t.action(
      internal.memberPaymentsActions.reconcileMemberPayments,
      {},
    );

    expect(result.resyncedAgreements).toBe(1);
    const transactions = await readTransactions(t);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("approved");
    expect(transactions[0]!.reconciliationSource).toBe("reconciliation");

    const agreement = await t.run((ctx) => ctx.db.get(fixture.agreementId));
    expect(agreement!.lastPaymentStatus).toBe("approved");
  });

  it("retries an event whose processing died mid-flight", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    fakeForGym(fixture, (fake) =>
      fake.onJson(
        "GET /authorized_payments/*",
        authorizedPaymentResponse({
          external_reference: fixture.externalReference,
        }),
      ),
    );

    const { eventId } = await t.mutation(
      internal.memberPayments.recordWebhookEventInternal,
      {
        connectionId: fixture.connectionId,
        eventKey: "conn:req:stuck",
        providerRequestId: "stuck",
        topic: "subscription_authorized_payment",
        resourceType: "subscription_authorized_payment",
        resourceId: "5000000001",
      },
    );
    await t.run((ctx) =>
      ctx.db.patch(eventId, { receivedAt: Date.now() - 60 * 60 * 1000 }),
    );

    const result = await t.action(
      internal.memberPaymentsActions.reconcileMemberPayments,
      {},
    );

    expect(result.retriedEvents).toBe(1);
    expect((await readEvents(t))[0]!.status).toBe("processed");
    expect(await readTransactions(t)).toHaveLength(1);
  });

  it("expires an abandoned checkout session", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);
    __setMercadoPagoTransportForTests(new FakeMercadoPago().transport);

    const sessionId = await t.run(async (ctx) => {
      const now = Date.now();
      const subscription = await ctx.db.get(fixture.subscriptionId);
      return await ctx.db.insert("memberPaymentCheckoutSessions", {
        organizationId: fixture.organizationId,
        userId: MEMBER,
        planId: subscription!.planId,
        kind: "recurring_setup",
        months: 1,
        amountArs: 30_000,
        currency: "ARS",
        paymentMethod: "mercadopago_recurring",
        externalReference: "mat_sub_x_y_z",
        idempotencyKey: "key-1",
        status: "opened",
        expiresAt: now - 1_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.action(
      internal.memberPaymentsActions.reconcileMemberPayments,
      {},
    );

    expect(result.expiredSessions).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(sessionId)))!.status).toBe("expired");
  });

  it("never expires a session that was already paid", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedGym(t);

    const sessionId = await t.run(async (ctx) => {
      const now = Date.now();
      const subscription = await ctx.db.get(fixture.subscriptionId);
      return await ctx.db.insert("memberPaymentCheckoutSessions", {
        organizationId: fixture.organizationId,
        userId: MEMBER,
        planId: subscription!.planId,
        kind: "advance_purchase",
        months: 3,
        amountArs: 81_000,
        currency: "ARS",
        paymentMethod: "mercadopago_checkout",
        externalReference: "mat_adv_x_y_z",
        idempotencyKey: "key-2",
        status: "approved",
        expiresAt: now - 1_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.memberPayments.expireCheckoutSessionInternal, {
      sessionId,
    });

    expect((await t.run((ctx) => ctx.db.get(sessionId)))!.status).toBe("approved");
  });
});
