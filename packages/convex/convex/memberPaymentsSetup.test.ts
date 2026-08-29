import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import {
  MEMBER_MP_DISABLED_REASON,
  isMemberMercadoPagoEnabled,
  parseBooleanFlag,
} from "./memberPaymentsEnv";
import {
  FakeMercadoPago,
  MercadoPagoNetworkError,
  errorResponse,
  jsonResponse,
} from "./mercadoPago.fake";
import {
  authorizedPaymentResponse,
  oauthTokenResponse,
  preapprovalResponse,
  providerErrors,
  SELLER_B,
  sellerIdentityResponse,
} from "./mercadoPago.fixtures";
import {
  buildMercadoPagoUrl,
  sanitizeProviderError,
} from "./mercadoPagoTransport";

const modules = import.meta.glob("./**/*.*s");

describe("backend test harness", () => {
  it("can create and read a document against the real schema", async () => {
    const t = convexTest(schema, modules);

    const organizationId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("organizations", {
        name: "Gimnasio Test",
        slug: "gimnasio-test",
        createdAt: now,
        updatedAt: now,
      });
    });

    const organization = await t.run(async (ctx) => ctx.db.get(organizationId));
    expect(organization?.slug).toBe("gimnasio-test");
  });
});

describe("member payments kill switch", () => {
  it("is off unless the environment explicitly enables it", () => {
    expect(isMemberMercadoPagoEnabled()).toBe(false);
  });

  it("only treats the exact string 'true' as enabled", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag(" TRUE ")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(false);
    expect(parseBooleanFlag("yes")).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag("")).toBe(false);
  });

  it("has a member-facing reason to show when disabled", () => {
    expect(MEMBER_MP_DISABLED_REASON.length).toBeGreaterThan(0);
  });
});

describe("mercado pago transport helpers", () => {
  it("builds URLs against the API base with query params", () => {
    expect(
      buildMercadoPagoUrl({
        method: "GET",
        path: "/preapproval/search",
        query: { external_reference: "mat_sub_1", limit: 10, skip: undefined },
      }),
    ).toBe(
      "https://api.mercadopago.com/preapproval/search?external_reference=mat_sub_1&limit=10",
    );
  });

  it("redacts tokens and payer emails from provider errors", () => {
    const message = sanitizeProviderError(401, {
      message:
        "invalid token APP_USR-1234-abcd-5678 for payer socio@ejemplo.com.ar",
    });
    expect(message).not.toContain("APP_USR-1234");
    expect(message).not.toContain("socio@ejemplo.com.ar");
    expect(message).toContain("[redacted-token]");
    expect(message).toContain("[redacted-email]");
  });

  it("caps error length so a provider payload cannot flood the logs", () => {
    expect(
      sanitizeProviderError(500, { message: "x".repeat(5_000) }).length,
    ).toBeLessThan(350);
  });
});

describe("fake mercado pago transport", () => {
  it("never performs a real request and records what was sent", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson("POST /preapproval", preapprovalResponse());

    const response = await fake.transport({
      method: "POST",
      path: "/preapproval",
      accessToken: "TEST-gym-token",
      idempotencyKey: "checkout-session-1",
      body: { reason: "MAT" },
    });

    expect(response.ok).toBe(true);
    expect(response.body.id).toBe("2c9380848a1b2c3d");
    expect(fake.requests).toHaveLength(1);
    expect(fake.idempotencyKeysFor("POST /preapproval")).toEqual([
      "checkout-session-1",
    ]);
  });

  it("matches wildcard resource paths", async () => {
    const fake = new FakeMercadoPago();
    fake.onJson(
      "GET /authorized_payments/*",
      authorizedPaymentResponse({ payment_status: "approved" }),
    );

    const response = await fake.transport({
      method: "GET",
      path: "/authorized_payments/5000000001",
    });
    expect(response.body.payment_status).toBe("approved");
  });

  it("replays a scripted sequence for retry scenarios", async () => {
    const fake = new FakeMercadoPago();
    fake.onSequence("GET /users/me", [
      errorResponse(401, providerErrors.unauthorized),
      jsonResponse(sellerIdentityResponse(SELLER_B)),
    ]);

    const first = await fake.transport({ method: "GET", path: "/users/me" });
    const second = await fake.transport({ method: "GET", path: "/users/me" });

    expect(first.status).toBe(401);
    expect(second.body.id).toBe(SELLER_B.userId);
    expect(fake.countFor("GET /users/me")).toBe(2);
  });

  it("simulates a provider success whose response is lost", async () => {
    const fake = new FakeMercadoPago();
    let createdOnProvider = 0;
    fake.onLostResponse("POST /preapproval", () => {
      createdOnProvider += 1;
    });

    await expect(
      fake.transport({ method: "POST", path: "/preapproval" }),
    ).rejects.toBeInstanceOf(MercadoPagoNetworkError);
    expect(createdOnProvider).toBe(1);
  });

  it("fails loudly on an unregistered route instead of silently succeeding", async () => {
    const fake = new FakeMercadoPago();
    await expect(
      fake.transport({ method: "POST", path: "/v1/payments" }),
    ).rejects.toThrow(/no responder registered/);
  });
});

describe("provider fixtures", () => {
  it("model an OAuth exchange that returns both tokens", () => {
    const tokens = oauthTokenResponse({ user_id: SELLER_B.userId });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.user_id).toBe(SELLER_B.userId);
  });

  it("model an authorized preapproval that has not yet charged", () => {
    const preapproval = preapprovalResponse({ status: "authorized" });
    expect(preapproval.status).toBe("authorized");
    // Authorization alone must never be read as a payment.
    expect(preapproval).not.toHaveProperty("payment_status");
  });
});
