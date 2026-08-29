import { describe, expect, it, vi } from "vitest";
import {
  classifyProviderStatus,
  createPreapproval,
  createPreference,
  fetchWebhookResource,
  findPreapprovalByExternalReference,
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  MercadoPagoApiError,
  setPreapprovalStatus,
  toNetworkError,
  updatePreapprovalAmount,
  type ClientContext,
} from "./mercadoPagoClient";
import {
  FakeMercadoPago,
  MercadoPagoNetworkError,
  errorResponse,
  jsonResponse,
} from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  paymentResponse,
  preapprovalResponse,
  preferenceResponse,
  providerErrors,
  SELLER_A,
} from "./mercadoPago.fixtures";

function clientFor(
  fake: FakeMercadoPago,
  overrides: Partial<ClientContext> = {},
): ClientContext {
  return {
    transport: fake.transport,
    accessToken: "TEST-gym-token",
    ...overrides,
  };
}

const CREATE_PARAMS = {
  reason: "MAT - Plan mensual",
  externalReference: "mat_sub_org1_sub1_abc",
  amountArs: 30_000,
  notificationUrl:
    "https://deployment.convex.site/member-payments/webhook/routing-key",
  backUrl: "https://matgestion.app/payments/return",
  idempotencyKey: "session-1",
};

describe("error classification", () => {
  it("treats rejected credentials as an auth problem", () => {
    expect(classifyProviderStatus(401)).toBe("auth");
  });

  it("treats throttling and provider faults as retryable", () => {
    expect(classifyProviderStatus(429)).toBe("rate_limited");
    expect(classifyProviderStatus(408)).toBe("transient");
    expect(classifyProviderStatus(500)).toBe("transient");
    expect(classifyProviderStatus(502)).toBe("transient");
    expect(classifyProviderStatus(503)).toBe("transient");
  });

  it("treats validation, permission, not-found and conflict as permanent", () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(classifyProviderStatus(status)).toBe("permanent");
    }
  });

  it("marks only the recoverable kinds as retryable", () => {
    const retryable = (kind: any) =>
      new MercadoPagoApiError(kind, "x").retryable;
    expect(retryable("rate_limited")).toBe(true);
    expect(retryable("transient")).toBe(true);
    expect(retryable("network")).toBe(true);
    expect(retryable("permanent")).toBe(false);
    // Auth is handled by a single refresh-and-retry inside the adapter, not by
    // the outbox: repeating it from the queue would just fail identically.
    expect(retryable("auth")).toBe(false);
  });

  it("wraps a thrown transport failure as a retryable network error", () => {
    const error = toNetworkError(new MercadoPagoNetworkError("aborted"));
    expect(error.kind).toBe("network");
    expect(error.retryable).toBe(true);
  });
});

describe("createPreapproval", () => {
  it("sends MAT's amount, external reference and per-gym notification URL", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());

    const result = await createPreapproval(clientFor(fake), CREATE_PARAMS);

    const request = fake.requests[0]!;
    expect(request.accessToken).toBe("TEST-gym-token");
    expect(request.idempotencyKey).toBe("session-1");
    const body = request.body as any;
    expect(body.external_reference).toBe(CREATE_PARAMS.externalReference);
    expect(body.notification_url).toBe(CREATE_PARAMS.notificationUrl);
    expect(body.auto_recurring.transaction_amount).toBe(30_000);
    expect(body.auto_recurring.currency_id).toBe("ARS");
    expect(body.auto_recurring.frequency_type).toBe("months");
    // Created pending: the member still has to authorize it.
    expect(body.status).toBe("pending");
    // No provider plan is referenced — MAT owns the pricing.
    expect(body.preapproval_plan_id).toBeUndefined();

    expect(result.id).toBe("2c9380848a1b2c3d");
    expect(result.status).toBe("pending");
    expect(result.amountArs).toBe(30_000);
  });

  it("reuses the persisted idempotency key when the caller retries", async () => {
    const fake = new FakeMercadoPago();
    fake.onSequence("POST /preapproval", [
      errorResponse(500, providerErrors.serverError),
      jsonResponse(preapprovalResponse()),
    ]);

    await expect(
      createPreapproval(clientFor(fake), CREATE_PARAMS),
    ).rejects.toThrow(MercadoPagoApiError);
    await createPreapproval(clientFor(fake), CREATE_PARAMS);

    expect(fake.idempotencyKeysFor("POST /preapproval")).toEqual([
      "session-1",
      "session-1",
    ]);
  });

  it("classifies a rejected amount as permanent", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(400, providerErrors.validation));

    await expect(
      createPreapproval(clientFor(fake), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "permanent", retryable: false, status: 400 });
  });

  it("classifies throttling as retryable", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(429, providerErrors.rateLimited));

    await expect(
      createPreapproval(clientFor(fake), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "rate_limited", retryable: true });
  });

  it("classifies a provider fault as retryable", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(500, providerErrors.serverError));

    await expect(
      createPreapproval(clientFor(fake), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "transient", retryable: true });
  });

  it("surfaces a lost response as a retryable network error", async () => {
    const fake = new FakeMercadoPago();
    let createdOnProvider = 0;
    fake.onLostResponse("POST /preapproval", () => {
      createdOnProvider += 1;
    });

    await expect(
      createPreapproval(clientFor(fake), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "network", retryable: true });
    expect(createdOnProvider).toBe(1);
  });

  it("never leaks a token or a payer email through the error message", async () => {
    const fake = new FakeMercadoPago();
    fake.on(
      "POST /preapproval",
      errorResponse(400, {
        message: "bad token APP_USR-9999-secret for socio@ejemplo.com",
      }),
    );

    let error: MercadoPagoApiError | undefined;
    try {
      await createPreapproval(clientFor(fake), CREATE_PARAMS);
    } catch (thrown) {
      error = thrown as MercadoPagoApiError;
    }

    expect(error).toBeInstanceOf(MercadoPagoApiError);
    expect(error!.message).toContain("[redacted-token]");
    expect(error!.message).toContain("[redacted-email]");
    expect(error!.message).not.toContain("APP_USR-9999");
    expect(error!.message).not.toContain("socio@ejemplo.com");
  });
});

describe("authentication refresh", () => {
  it("refreshes once and retries after a rejected token", async () => {
    const fake = new FakeMercadoPago();
    fake.onSequence("POST /preapproval", [
      errorResponse(401, providerErrors.unauthorized),
      jsonResponse(preapprovalResponse()),
    ]);
    const refreshAccessToken = vi.fn(async () => "TEST-refreshed-token");

    const result = await createPreapproval(
      clientFor(fake, { refreshAccessToken }),
      CREATE_PARAMS,
    );

    expect(result.id).toBe("2c9380848a1b2c3d");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fake.requests[0]!.accessToken).toBe("TEST-gym-token");
    expect(fake.requests[1]!.accessToken).toBe("TEST-refreshed-token");
    // The retry must carry the same idempotency key, not a new one.
    expect(fake.idempotencyKeysFor("POST /preapproval")).toEqual([
      "session-1",
      "session-1",
    ]);
  });

  it("gives up after one refresh rather than looping", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(401, providerErrors.unauthorized));
    const refreshAccessToken = vi.fn(async () => "TEST-refreshed-token");

    await expect(
      createPreapproval(clientFor(fake, { refreshAccessToken }), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "auth" });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fake.countFor("POST /preapproval")).toBe(2);
  });

  it("does not retry when the connection can no longer be refreshed", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(401, providerErrors.unauthorized));
    const refreshAccessToken = vi.fn(async () => null);

    await expect(
      createPreapproval(clientFor(fake, { refreshAccessToken }), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fake.countFor("POST /preapproval")).toBe(1);
  });

  it("does not refresh on a non-auth failure", async () => {
    const fake = new FakeMercadoPago();
    fake.on("POST /preapproval", errorResponse(400, providerErrors.validation));
    const refreshAccessToken = vi.fn(async () => "TEST-refreshed-token");

    await expect(
      createPreapproval(clientFor(fake, { refreshAccessToken }), CREATE_PARAMS),
    ).rejects.toMatchObject({ kind: "permanent" });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe("recovering a lost creation", () => {
  it("finds the resource the provider created before the response was lost", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /preapproval/search", {
      results: [
        preapprovalResponse({
          id: "created-despite-timeout",
          external_reference: CREATE_PARAMS.externalReference,
        }),
      ],
    });

    const found = await findPreapprovalByExternalReference(
      clientFor(fake),
      CREATE_PARAMS.externalReference,
    );

    expect(found?.id).toBe("created-despite-timeout");
    expect(fake.requests[0]!.query).toMatchObject({
      external_reference: CREATE_PARAMS.externalReference,
    });
  });

  it("returns null when the provider really did not create anything", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /preapproval/search", { results: [] });

    expect(
      await findPreapprovalByExternalReference(clientFor(fake), "mat_sub_x_y_z"),
    ).toBeNull();
  });
});

describe("agreement updates", () => {
  it("sends only the new amount on an amount change", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse({ transaction_amount: 60_000 }));

    await updatePreapprovalAmount(clientFor(fake), {
      preapprovalId: "pre-1",
      amountArs: 60_000,
      idempotencyKey: "op-1",
    });

    const request = fake.requests[0]!;
    expect(request.path).toBe("/preapproval/pre-1");
    expect(request.idempotencyKey).toBe("op-1");
    expect(request.body).toEqual({
      auto_recurring: { transaction_amount: 60_000, currency_id: "ARS" },
    });
  });

  it("sends the provider's own status vocabulary for pause, resume and cancel", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("PUT /preapproval/*", preapprovalResponse());

    for (const status of ["paused", "authorized", "cancelled"] as const) {
      await setPreapprovalStatus(clientFor(fake), {
        preapprovalId: "pre-1",
        status,
        idempotencyKey: `op-${status}`,
      });
    }

    expect(fake.requests.map((r) => (r.body as any).status)).toEqual([
      "paused",
      "authorized",
      "cancelled",
    ]);
  });

  it("percent-encodes a preapproval id into the path", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /preapproval/*", preapprovalResponse());

    await getPreapproval(clientFor(fake), "pre/../admin");
    expect(fake.requests[0]!.path).toBe("/preapproval/pre%2F..%2Fadmin");
  });
});

describe("resource parsing", () => {
  it("reads an authorized payment's underlying payment result", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({ transaction_amount: 45_000 }),
    );

    const resource = await getAuthorizedPayment(clientFor(fake), "5000000001");
    expect(resource.preapprovalId).toBe("2c9380848a1b2c3d");
    expect(resource.paymentStatus).toBe("approved");
    expect(resource.paymentStatusDetail).toBe("accredited");
    expect(resource.paymentId).toBe("7000000001");
    expect(resource.amountArs).toBe(45_000);
  });

  it("reads gross, provider fee and net from a one-time payment", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /v1/payments/*", paymentResponse());

    const payment = await getPayment(clientFor(fake), "7000000001");
    expect(payment.status).toBe("approved");
    expect(payment.amountArs).toBe(90_000);
    expect(payment.providerFeeArs).toBe(5_490);
    expect(payment.netReceivedArs).toBe(84_510);
    expect(payment.collectorId).toBe(String(SELLER_A.userId));
  });

  it("excludes MAT's own application fee from the provider fee total", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /v1/payments/*", {
      ...paymentResponse(),
      fee_details: [
        { type: "mercadopago_fee", amount: 5_490 },
        { type: "application_fee", amount: 2_000 },
      ],
    });

    const payment = await getPayment(clientFor(fake), "7000000001");
    expect(payment.providerFeeArs).toBe(5_490);
  });

  it("returns a usable checkout URL for a one-time preference", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /checkout/preferences", preferenceResponse());

    const preference = await createPreference(clientFor(fake), {
      title: "MAT - 3 meses",
      externalReference: "mat_adv_org1_sess1_abc",
      amountArs: 81_000,
      notificationUrl: CREATE_PARAMS.notificationUrl,
      backUrl: CREATE_PARAMS.backUrl,
      idempotencyKey: "adv-1",
    });

    expect(preference.initPoint).toContain("mercadopago");
    const body = fake.requests[0]!.body as any;
    expect(body.items[0].unit_price).toBe(81_000);
    expect(body.items[0].currency_id).toBe("ARS");
    // No split fee unless the caller explicitly asked for one.
    expect(body.marketplace_fee).toBeUndefined();
  });

  it("sends the split fee only when one was snapshotted", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /checkout/preferences", preferenceResponse());

    await createPreference(clientFor(fake), {
      title: "MAT - 3 meses",
      externalReference: "mat_adv_org1_sess1_abc",
      amountArs: 81_000,
      marketplaceFeeArs: 2_430,
      notificationUrl: CREATE_PARAMS.notificationUrl,
      backUrl: CREATE_PARAMS.backUrl,
      idempotencyKey: "adv-1",
    });

    expect((fake.requests[0]!.body as any).marketplace_fee).toBe(2_430);
  });

  it("refuses a preference with no checkout URL rather than returning one", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /checkout/preferences", { id: "pref-1" });

    await expect(
      createPreference(clientFor(fake), {
        title: "MAT",
        externalReference: "mat_adv_x_y_z",
        amountArs: 1_000,
        notificationUrl: CREATE_PARAMS.notificationUrl,
        backUrl: CREATE_PARAMS.backUrl,
        idempotencyKey: "adv-1",
      }),
    ).rejects.toMatchObject({ kind: "permanent" });
  });
});

describe("webhook resource dispatch", () => {
  it("fetches a subscription authorized payment from its own endpoint", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /authorized_payments/*", authorizedPaymentResponse());

    const result = await fetchWebhookResource(
      clientFor(fake),
      "subscription_authorized_payment",
      "5000000001",
    );

    expect(result.type).toBe("subscription_authorized_payment");
    // The topic contains "payment" but is NOT a /v1/payments resource.
    expect(fake.requests[0]!.path).toBe("/authorized_payments/5000000001");
  });

  it("fetches a preapproval and a one-time payment from their endpoints", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("GET /preapproval/*", preapprovalResponse());
    fake.onJson("GET /v1/payments/*", paymentResponse());

    await fetchWebhookResource(clientFor(fake), "subscription_preapproval", "pre-1");
    await fetchWebhookResource(clientFor(fake), "payment", "7000000001");

    expect(fake.requests.map((r) => r.path)).toEqual([
      "/preapproval/pre-1",
      "/v1/payments/7000000001",
    ]);
  });
});
