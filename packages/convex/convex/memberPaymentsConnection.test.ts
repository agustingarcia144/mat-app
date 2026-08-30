import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { __setMercadoPagoTransportForTests } from "./memberPaymentsActions";
import {
  FakeMercadoPago,
  errorResponse,
  jsonResponse,
} from "./mercadoPago.fake";
import {
  oauthTokenResponse,
  providerErrors,
  SELLER_A,
  SELLER_B,
  sellerIdentityResponse,
} from "./mercadoPago.fixtures";
import { decryptSecret } from "./memberPaymentsCrypto";

const modules = import.meta.glob("./**/*.*s");

const ADMIN = "user_admin";
const MEMBER = "user_member";

// A deterministic 32-byte AES-256 key. Test-only; never a real deployment key.
const TEST_KEY = btoa("0123456789abcdef0123456789abcdef");

beforeEach(() => {
  process.env.MERCADOPAGO_CLIENT_ID = "test-client-id";
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-client-secret";
  process.env.MEMBER_PAYMENTS_OAUTH_REDIRECT_URL =
    "https://deployment.convex.site/member-payments/oauth/callback";
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY = TEST_KEY;
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION = "v1";
  process.env.MEMBER_PAYMENTS_WEB_APP_URL = "https://app.matgestion.app";
  process.env.MEMBER_PAYMENTS_WEBHOOK_BASE_URL =
    "https://deployment.convex.site";
});

type T = ReturnType<typeof convexTest>;

async function seedOrganization(
  t: T,
  options: { slug: string; adminUserId?: string; memberUserId?: string } = {
    slug: "gym-a",
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: options.slug,
      slug: options.slug,
      createdAt: now,
      updatedAt: now,
    });

    const addMembership = async (userId: string, role: "admin" | "member") => {
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
    };

    if (options.adminUserId) await addMembership(options.adminUserId, "admin");
    if (options.memberUserId) await addMembership(options.memberUserId, "member");

    return organizationId;
  });
}

/** Drive the whole connect flow and return the state the browser carried. */
async function beginConnection(t: T, identity: string) {
  const { authorizationUrl } = await t
    .withIdentity({ subject: identity })
    .action(api.memberPaymentsActions.beginMercadoPagoConnection, {});
  const url = new URL(authorizationUrl);
  return { authorizationUrl, state: url.searchParams.get("state")! };
}

function fakeWithSuccessfulOAuth(seller = SELLER_A) {
  const fake = new FakeMercadoPago();
  fake.onJson("POST /oauth/token", oauthTokenResponse({ user_id: seller.userId }));
  fake.onJson("GET /users/me", sellerIdentityResponse(seller));
  __setMercadoPagoTransportForTests(fake.transport);
  return fake;
}

describe("beginMercadoPagoConnection", () => {
  it("returns a MercadoPago authorization URL and stores only the state hash", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const { authorizationUrl, state } = await beginConnection(t, ADMIN);
    const url = new URL(authorizationUrl);

    expect(url.origin + url.pathname).toBe(
      "https://auth.mercadopago.com/authorization",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(state.length).toBeGreaterThan(20);

    const stored = await t.run((ctx) =>
      ctx.db.query("paymentProviderOAuthStates").collect(),
    );
    expect(stored).toHaveLength(1);
    // The raw state must never be persisted — only its hash.
    expect(stored[0]!.stateHash).not.toBe(state);
    expect(stored[0]!.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]!.consumedAt).toBeUndefined();
  });

  it("refuses a non-admin member", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, {
      slug: "gym-a",
      adminUserId: ADMIN,
      memberUserId: MEMBER,
    });

    await expect(beginConnection(t, MEMBER)).rejects.toThrow(/Admin role/i);
  });

  it("refuses an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    await expect(
      t.action(api.memberPaymentsActions.beginMercadoPagoConnection, {}),
    ).rejects.toThrow();
  });

  it("only allows an allowlisted return path", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    await t
      .withIdentity({ subject: ADMIN })
      .action(api.memberPaymentsActions.beginMercadoPagoConnection, {
        returnPath: "https://evil.example.com/steal",
      });

    const [stored] = await t.run((ctx) =>
      ctx.db.query("paymentProviderOAuthStates").collect(),
    );
    expect(stored!.returnPath).toBe("/dashboard/settings");
  });
});

describe("completeMercadoPagoConnection", () => {
  it("stores an active connection with encrypted credentials", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await seedOrganization(t, {
      slug: "gym-a",
      adminUserId: ADMIN,
    });
    fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(true);
    expect(result.returnPath).toBe("/dashboard/settings");

    const connection = await t.run(async (ctx) => {
      return await ctx.db
        .query("organizationPaymentProviderConnections")
        .withIndex("by_organization_provider", (q) =>
          q.eq("organizationId", organizationId).eq("provider", "mercadopago"),
        )
        .first();
    });

    expect(connection?.status).toBe("active");
    expect(connection?.providerAccountId).toBe(String(SELLER_A.userId));
    expect(connection?.providerNickname).toBe(SELLER_A.nickname);
    expect(connection?.webhookRoutingKey.length).toBeGreaterThan(10);

    // Credentials are stored encrypted, not in the clear.
    const tokens = oauthTokenResponse();
    expect(connection?.accessTokenCiphertext).not.toContain(tokens.access_token);
    expect(connection?.refreshTokenCiphertext).not.toContain(
      tokens.refresh_token,
    );
    expect(connection?.encryptionKeyVersion).toBe("v1");

    // ...and they round-trip back to the originals.
    const accessToken = await decryptSecret({
      ciphertext: connection!.accessTokenCiphertext,
      iv: connection!.accessTokenIv,
      keyVersion: connection!.encryptionKeyVersion,
    });
    expect(accessToken).toBe(tokens.access_token);
  });

  it("never returns credentials through the public query", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    const safe = await t
      .withIdentity({ subject: ADMIN })
      .query(api.memberPayments.getMercadoPagoConnection, {});

    expect(safe?.status).toBe("active");
    expect(safe?.providerNickname).toBe(SELLER_A.nickname);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain("Ciphertext");
    expect(serialized).not.toContain("webhookRoutingKey");
    expect(serialized).not.toContain(oauthTokenResponse().access_token);
  });

  it("rejects a replayed state", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    const fake = fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    const first = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );
    const replay = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe("invalid_state");
    // The replay must not have reached the provider at all.
    expect(fake.countFor("POST /oauth/token")).toBe(1);
  });

  it("rejects an unknown state", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    const fake = fakeWithSuccessfulOAuth();

    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state: "a-state-that-was-never-issued" },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_state");
    expect(fake.requests).toHaveLength(0);
  });

  it("rejects an expired state", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    await t.run(async (ctx) => {
      const [stored] = await ctx.db
        .query("paymentProviderOAuthStates")
        .collect();
      await ctx.db.patch(stored!._id, { expiresAt: Date.now() - 1 });
    });

    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_state");
  });

  it("reports a failed token exchange without connecting", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const fake = new FakeMercadoPago();
    fake.on("POST /oauth/token", errorResponse(400, providerErrors.validation));
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "bad-code", state },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exchange_failed");
    const connections = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connections).toHaveLength(0);
  });

  it("refuses a response with no refresh token", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const fake = new FakeMercadoPago();
    const { refresh_token: _dropped, ...withoutRefresh } = oauthTokenResponse();
    fake.onJson("POST /oauth/token", withoutRefresh);
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_refresh_token");
  });

  it("refuses when the token and the identity name different sellers", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const fake = new FakeMercadoPago();
    fake.onJson(
      "POST /oauth/token",
      oauthTokenResponse({ user_id: SELLER_A.userId }),
    );
    fake.onJson("GET /users/me", sellerIdentityResponse(SELLER_B));
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("seller_mismatch");
  });
});

describe("cross-organization isolation", () => {
  it("lets two gyms connect two different seller accounts", async () => {
    const t = convexTest(schema, modules);
    const gymA = await seedOrganization(t, {
      slug: "gym-a",
      adminUserId: "admin_a",
    });
    const gymB = await seedOrganization(t, {
      slug: "gym-b",
      adminUserId: "admin_b",
    });

    const fake = new FakeMercadoPago();
    fake.onSequence("POST /oauth/token", [
      jsonResponse(oauthTokenResponse({ user_id: SELLER_A.userId })),
      jsonResponse(oauthTokenResponse({ user_id: SELLER_B.userId })),
    ]);
    fake.onSequence("GET /users/me", [
      jsonResponse(sellerIdentityResponse(SELLER_A)),
      jsonResponse(sellerIdentityResponse(SELLER_B)),
    ]);
    __setMercadoPagoTransportForTests(fake.transport);

    const stateA = (await beginConnection(t, "admin_a")).state;
    const resultA = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-a", state: stateA },
    );
    const stateB = (await beginConnection(t, "admin_b")).state;
    const resultB = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-b", state: stateB },
    );

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    const connections = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connections).toHaveLength(2);

    const byOrg = new Map(
      connections.map((c) => [c.organizationId, c.providerAccountId]),
    );
    expect(byOrg.get(gymA)).toBe(String(SELLER_A.userId));
    expect(byOrg.get(gymB)).toBe(String(SELLER_B.userId));

    // Routing keys must be distinct so a webhook resolves exactly one gym.
    expect(connections[0]!.webhookRoutingKey).not.toBe(
      connections[1]!.webhookRoutingKey,
    );
  });

  it("refuses to connect one seller account to a second gym", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: "admin_a" });
    await seedOrganization(t, { slug: "gym-b", adminUserId: "admin_b" });
    fakeWithSuccessfulOAuth(SELLER_A);

    const stateA = (await beginConnection(t, "admin_a")).state;
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-a", state: stateA },
    );

    const stateB = (await beginConnection(t, "admin_b")).state;
    const resultB = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-b", state: stateB },
    );

    expect(resultB.ok).toBe(false);
    expect(resultB.reason).toBe("seller_already_connected");
    const connections = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connections).toHaveLength(1);
  });
});

describe("reconnect", () => {
  it("keeps the webhook routing key so stored notification URLs still resolve", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();

    const first = (await beginConnection(t, ADMIN)).state;
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-1", state: first },
    );
    const originalKey = (
      await t.run((ctx) =>
        ctx.db.query("organizationPaymentProviderConnections").collect(),
      )
    )[0]!.webhookRoutingKey;

    // Simulate a broken connection the admin repairs by reconnecting.
    await t.run(async (ctx) => {
      const [connection] = await ctx.db
        .query("organizationPaymentProviderConnections")
        .collect();
      await ctx.db.patch(connection!._id, {
        status: "refresh_required",
        lastError: "MercadoPago rejected the stored credentials",
      });
    });

    const second = (await beginConnection(t, ADMIN)).state;
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code-2", state: second },
    );

    expect(result.ok).toBe(true);
    const connections = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connections).toHaveLength(1);
    expect(connections[0]!.status).toBe("active");
    expect(connections[0]!.lastError).toBeUndefined();
    expect(connections[0]!.webhookRoutingKey).toBe(originalKey);
  });
});

describe("token refresh", () => {
  async function connectedGym(t: T) {
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();
    const { state } = await beginConnection(t, ADMIN);
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code", state },
    );
    const [connection] = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    return connection!._id as Id<"organizationPaymentProviderConnections">;
  }

  it("replaces both tokens on a successful refresh", async () => {
    const t = convexTest(schema, modules);
    const connectionId = await connectedGym(t);

    const fake = new FakeMercadoPago();
    fake.onJson(
      "POST /oauth/token",
      oauthTokenResponse({
        access_token: "TEST-access-token-rotated",
        refresh_token: "TG-refresh-token-rotated",
        user_id: SELLER_A.userId,
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);

    const result = await t.action(
      internal.memberPaymentsActions.refreshConnectionInternal,
      { connectionId },
    );
    expect(result.refreshed).toBe(true);

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    const accessToken = await decryptSecret({
      ciphertext: connection!.accessTokenCiphertext,
      iv: connection!.accessTokenIv,
      keyVersion: connection!.encryptionKeyVersion,
    });
    const refreshToken = await decryptSecret({
      ciphertext: connection!.refreshTokenCiphertext,
      iv: connection!.refreshTokenIv,
      keyVersion: connection!.encryptionKeyVersion,
    });
    expect(accessToken).toBe("TEST-access-token-rotated");
    expect(refreshToken).toBe("TG-refresh-token-rotated");
    expect(connection!.status).toBe("active");
  });

  it("marks the connection as needing reconnection when refresh fails", async () => {
    const t = convexTest(schema, modules);
    const connectionId = await connectedGym(t);

    const fake = new FakeMercadoPago();
    fake.on("POST /oauth/token", errorResponse(401, providerErrors.unauthorized));
    __setMercadoPagoTransportForTests(fake.transport);

    const result = await t.action(
      internal.memberPaymentsActions.refreshConnectionInternal,
      { connectionId },
    );
    expect(result.refreshed).toBe(false);

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection!.status).toBe("refresh_required");
    expect(connection!.lastError).toBeTruthy();
    // The sanitized error must not carry the provider's token echo.
    expect(connection!.lastError).not.toContain("APP_USR");
  });

  it("discards a refresh that lost the race to a newer one", async () => {
    const t = convexTest(schema, modules);
    const connectionId = await connectedGym(t);

    // A concurrent refresh already landed, so lastRefreshedAt has moved on.
    const staleTimestamp = await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      const stale = connection!.lastRefreshedAt;
      await ctx.db.patch(connectionId, { lastRefreshedAt: Date.now() + 1_000 });
      return stale;
    });

    const applied = await t.run((ctx) =>
      ctx.runMutation(internal.memberPayments.recordConnectionRefreshInternal, {
        connectionId,
        expectedLastRefreshedAt: staleTimestamp,
        accessTokenCiphertext: "stale",
        accessTokenIv: "stale",
        refreshTokenCiphertext: "stale",
        refreshTokenIv: "stale",
        encryptionKeyVersion: "v1",
      }),
    );

    expect(applied).toEqual({ applied: false, reason: "superseded" });
    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection!.accessTokenCiphertext).not.toBe("stale");
  });
});

describe("disconnect", () => {
  async function connectedGym(t: T) {
    const organizationId = await seedOrganization(t, {
      slug: "gym-a",
      adminUserId: ADMIN,
      memberUserId: MEMBER,
    });
    fakeWithSuccessfulOAuth();
    const { state } = await beginConnection(t, ADMIN);
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code", state },
    );
    const [connection] = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    return {
      organizationId,
      connectionId: connection!._id as Id<"organizationPaymentProviderConnections">,
    };
  }

  it("clears credentials and disables MercadoPago when nothing is live", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, connectionId } = await connectedGym(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationSettings", {
        organizationId,
        planificationsEnabled: true,
        classesEnabled: true,
        financeEnabled: true,
        memberAutoApproval: false,
        memberPayments: {
          bankTransferEnabled: false,
          mercadoPagoRecurringEnabled: true,
          mercadoPagoOneTimeEnabled: true,
          gracePeriodDays: 5,
          initialPaymentRequiresApproval: true,
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    await t
      .withIdentity({ subject: ADMIN })
      .mutation(api.memberPayments.disconnectMercadoPago, {});

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection!.status).toBe("disconnected");
    expect(connection!.accessTokenCiphertext).toBe("");
    expect(connection!.refreshTokenCiphertext).toBe("");

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("organizationSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .first(),
    );
    expect(settings!.memberPayments!.mercadoPagoRecurringEnabled).toBe(false);
    expect(settings!.memberPayments!.mercadoPagoOneTimeEnabled).toBe(false);
    // A gym must never be left with no payment method at all.
    expect(settings!.memberPayments!.bankTransferEnabled).toBe(true);
  });

  it("is blocked while a live agreement still needs the credentials", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, connectionId } = await connectedGym(t);

    await t.run(async (ctx) => {
      const now = Date.now();
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
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberRecurringAgreements", {
        organizationId,
        connectionId,
        subscriptionId,
        payerUserId: MEMBER,
        externalReference: "mat_sub_x_y_z",
        status: "active",
        amountArs: 30_000,
        currency: "ARS",
        familyMemberCount: 1,
        billingAnchorAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: ADMIN })
        .mutation(api.memberPayments.disconnectMercadoPago, {}),
    ).rejects.toThrow(/débito\(s\) automático\(s\) activo/);

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection!.status).toBe("active");
    expect(connection!.accessTokenCiphertext).not.toBe("");
  });

  it("refuses a non-admin", async () => {
    const t = convexTest(schema, modules);
    await connectedGym(t);

    await expect(
      t
        .withIdentity({ subject: MEMBER })
        .mutation(api.memberPayments.disconnectMercadoPago, {}),
    ).rejects.toThrow(/Admin role/i);
  });
});

describe("connection health check", () => {
  async function connectedGym(t: T) {
    await seedOrganization(t, {
      slug: "gym-a",
      adminUserId: ADMIN,
      memberUserId: MEMBER,
    });
    fakeWithSuccessfulOAuth();
    const { state } = await beginConnection(t, ADMIN);
    await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "code", state },
    );
  }

  it("reports the feature as unavailable while the kill switch is off", async () => {
    const t = convexTest(schema, modules);
    await connectedGym(t);
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;

    const result = await t
      .withIdentity({ subject: ADMIN })
      .action(api.memberPaymentsActions.checkMercadoPagoConnectionHealth, {});
    expect(result.status).toBe("error");
  });

  it("reports an active connection when the provider accepts the token", async () => {
    const t = convexTest(schema, modules);
    await connectedGym(t);
    process.env.MEMBER_MP_PAYMENTS_ENABLED = "true";

    const fake = new FakeMercadoPago();
    fake.onJson("GET /users/me", sellerIdentityResponse(SELLER_A));
    __setMercadoPagoTransportForTests(fake.transport);

    const result = await t
      .withIdentity({ subject: ADMIN })
      .action(api.memberPaymentsActions.checkMercadoPagoConnectionHealth, {});

    expect(result.status).toBe("active");
    expect(result.sellerNickname).toBe(SELLER_A.nickname);

    const [connection] = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connection!.lastHealthCheckAt).toBeGreaterThan(0);
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
  });

  it("asks for a reconnection when the credentials are rejected twice", async () => {
    const t = convexTest(schema, modules);
    await connectedGym(t);
    process.env.MEMBER_MP_PAYMENTS_ENABLED = "true";

    const fake = new FakeMercadoPago();
    fake.on("GET /users/me", errorResponse(401, providerErrors.unauthorized));
    fake.on("POST /oauth/token", errorResponse(401, providerErrors.unauthorized));
    __setMercadoPagoTransportForTests(fake.transport);

    const result = await t
      .withIdentity({ subject: ADMIN })
      .action(api.memberPaymentsActions.checkMercadoPagoConnectionHealth, {});

    expect(result.status).toBe("refresh_required");
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
  });

  it("reports no connection for a gym that never connected", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    process.env.MEMBER_MP_PAYMENTS_ENABLED = "true";

    const result = await t
      .withIdentity({ subject: ADMIN })
      .action(api.memberPaymentsActions.checkMercadoPagoConnectionHealth, {});
    expect(result.status).toBe("none");
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
  });
});

describe("OAuth callback route", () => {
  const CALLBACK = "/member-payments/oauth/callback";

  async function callback(t: T, query: string) {
    return await t.fetch(`${CALLBACK}${query}`, { method: "GET" });
  }

  it("redirects to the admin's return path on success", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    const response = await callback(t, `?code=auth-code&state=${state}`);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://app.matgestion.app");
    expect(location.pathname).toBe("/dashboard/settings");
    expect(location.searchParams.get("mp")).toBe("success");
  });

  it("reports a denial when the gym owner refuses authorization", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const response = await callback(t, "?error=access_denied");

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.searchParams.get("mp")).toBe("denied");
    const connections = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connections).toHaveLength(0);
  });

  it("reports an error when the provider sends no code", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const response = await callback(t, "?state=something");
    const location = new URL(response.headers.get("Location")!);
    expect(location.searchParams.get("mp")).toBe("error");
    expect(location.searchParams.get("reason")).toBe("missing_parameters");
  });

  it("reports an error for a replayed callback", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    fakeWithSuccessfulOAuth();

    const { state } = await beginConnection(t, ADMIN);
    await callback(t, `?code=auth-code&state=${state}`);
    const replay = await callback(t, `?code=auth-code&state=${state}`);

    const location = new URL(replay.headers.get("Location")!);
    expect(location.searchParams.get("mp")).toBe("error");
    expect(location.searchParams.get("reason")).toBe("invalid_state");
  });

  it("never puts a token or a provider message in the redirect", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });

    const fake = new FakeMercadoPago();
    fake.on(
      "POST /oauth/token",
      errorResponse(401, {
        message: "invalid token APP_USR-1111-secret for socio@ejemplo.com",
      }),
    );
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const response = await callback(t, `?code=bad&state=${state}`);
    const location = response.headers.get("Location")!;

    expect(location).not.toContain("APP_USR");
    expect(location).not.toContain("socio@ejemplo.com");
    expect(location).toContain("mp=error");
  });

  it("is not reachable by a non-GET request", async () => {
    const t = convexTest(schema, modules);
    // The route is registered for GET only, so the router rejects a POST
    // before the handler runs; the handler's own 405 guard is a second layer.
    const response = await t.fetch(CALLBACK, { method: "POST" });
    expect(response.status).toBe(404);
  });
});

describe("sandbox isolation", () => {
  it("refuses a real Mercado Pago account on a sandbox deployment", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    process.env.MEMBER_PAYMENTS_MP_ENV = "sandbox";

    const fake = new FakeMercadoPago();
    // A real account: the admin signed in with their own login instead of the
    // seller test user.
    fake.onJson(
      "POST /oauth/token",
      oauthTokenResponse({ user_id: SELLER_A.userId, live_mode: true }),
    );
    fake.onJson("GET /users/me", sellerIdentityResponse(SELLER_A));
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("live_account_on_sandbox");
    // Nothing is stored: a sandbox deployment never holds real credentials.
    expect(
      await t.run((ctx) =>
        ctx.db.query("organizationPaymentProviderConnections").collect(),
      ),
    ).toHaveLength(0);

    delete process.env.MEMBER_PAYMENTS_MP_ENV;
  });

  it("accepts a test account on a sandbox deployment", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    process.env.MEMBER_PAYMENTS_MP_ENV = "sandbox";

    const fake = new FakeMercadoPago();
    fake.onJson(
      "POST /oauth/token",
      oauthTokenResponse({ user_id: SELLER_A.userId, live_mode: false }),
    );
    fake.onJson("GET /users/me", sellerIdentityResponse(SELLER_A));
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(true);
    delete process.env.MEMBER_PAYMENTS_MP_ENV;
  });

  it("accepts a real account when the deployment is not a sandbox", async () => {
    const t = convexTest(schema, modules);
    await seedOrganization(t, { slug: "gym-a", adminUserId: ADMIN });
    delete process.env.MEMBER_PAYMENTS_MP_ENV;

    const fake = new FakeMercadoPago();
    fake.onJson(
      "POST /oauth/token",
      oauthTokenResponse({ user_id: SELLER_A.userId, live_mode: true }),
    );
    fake.onJson("GET /users/me", sellerIdentityResponse(SELLER_A));
    __setMercadoPagoTransportForTests(fake.transport);

    const { state } = await beginConnection(t, ADMIN);
    const result = await t.action(
      internal.memberPaymentsActions.completeMercadoPagoConnection,
      { code: "auth-code", state },
    );

    expect(result.ok).toBe(true);
    const [connection] = await t.run((ctx) =>
      ctx.db.query("organizationPaymentProviderConnections").collect(),
    );
    expect(connection!.liveMode).toBe(true);
  });
});
