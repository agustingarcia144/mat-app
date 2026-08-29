import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  buildConnectionNotificationUrl,
  buildExternalReference,
  buildOAuthResultUrl,
  DEFAULT_RETURN_PATH,
  isConnectionUsable,
  isLiveAgreementStatus,
  isOAuthStateExpired,
  OAUTH_STATE_TTL_MS,
  parseExternalReference,
  resolveAccessTokenExpiry,
  resolveReturnPath,
  shouldRefreshAccessToken,
  toSafeConnection,
  TOKEN_REFRESH_MARGIN_MS,
} from "./memberPaymentDomain";
import {
  decryptSecret,
  encryptSecret,
  randomHex,
  randomToken,
  safeEqual,
  sha256Hex,
} from "./memberPaymentsCrypto";

const CRYPTO_CONFIG = {
  key: btoa("0123456789abcdef0123456789abcdef"),
  keyVersion: "v1",
};

describe("return path allowlist", () => {
  it("accepts the dashboard paths the connect flow starts from", () => {
    expect(resolveReturnPath("/dashboard/settings")).toBe("/dashboard/settings");
    expect(resolveReturnPath("/dashboard/payments")).toBe("/dashboard/payments");
  });

  it("falls back to the default for anything else", () => {
    for (const hostile of [
      "https://evil.example.com",
      "//evil.example.com",
      "/dashboard/settings/../../etc",
      "javascript:alert(1)",
      "",
      undefined,
      null,
    ]) {
      expect(resolveReturnPath(hostile as string)).toBe(DEFAULT_RETURN_PATH);
    }
  });
});

describe("buildOAuthResultUrl", () => {
  it("redirects to the allowlisted path on the web app origin", () => {
    const url = buildOAuthResultUrl({
      webAppOrigin: "https://app.matgestion.app",
      returnPath: "/dashboard/payments",
      result: "success",
    });
    expect(url).toBe("https://app.matgestion.app/dashboard/payments?mp=success");
  });

  it("cannot be pointed at another origin by a crafted return path", () => {
    const url = new URL(
      buildOAuthResultUrl({
        webAppOrigin: "https://app.matgestion.app",
        returnPath: "https://evil.example.com/steal",
        result: "success",
      }),
    );
    expect(url.origin).toBe("https://app.matgestion.app");
    expect(url.pathname).toBe(DEFAULT_RETURN_PATH);
  });

  it("carries a short reason code and truncates anything longer", () => {
    const url = new URL(
      buildOAuthResultUrl({
        webAppOrigin: "https://app.matgestion.app",
        returnPath: "/dashboard/settings",
        result: "error",
        reason: "x".repeat(500),
      }),
    );
    expect(url.searchParams.get("reason")!.length).toBe(60);
  });
});

describe("buildAuthorizationUrl", () => {
  it("sends the state and the exact registered redirect URI", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "client-123",
        redirectUri: "https://deployment.convex.site/member-payments/oauth/callback",
        state: "state-abc",
      }),
    );
    expect(url.host).toBe("auth.mercadopago.com");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://deployment.convex.site/member-payments/oauth/callback",
    );
  });
});

describe("connection notification URL", () => {
  it("embeds the routing key and never the organization id", () => {
    const url = buildConnectionNotificationUrl(
      "https://deployment.convex.site",
      "routing-key-abc",
    );
    expect(url).toBe(
      "https://deployment.convex.site/member-payments/webhook/routing-key-abc",
    );
    expect(url).not.toContain("organization");
  });
});

describe("OAuth state lifetime", () => {
  it("expires ten minutes after issue", () => {
    expect(OAUTH_STATE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("is expired exactly at, and after, its deadline", () => {
    const expiresAt = 1_000_000;
    expect(isOAuthStateExpired({ expiresAt }, expiresAt - 1)).toBe(false);
    expect(isOAuthStateExpired({ expiresAt }, expiresAt)).toBe(true);
    expect(isOAuthStateExpired({ expiresAt }, expiresAt + 1)).toBe(true);
  });
});

describe("token refresh timing", () => {
  it("refreshes inside the safety margin, not at the last moment", () => {
    const now = 1_000_000_000_000;
    const expiresAt = now + TOKEN_REFRESH_MARGIN_MS + 1;
    expect(shouldRefreshAccessToken({ accessTokenExpiresAt: expiresAt }, now)).toBe(
      false,
    );
    expect(
      shouldRefreshAccessToken({ accessTokenExpiresAt: now + 1_000 }, now),
    ).toBe(true);
  });

  it("does not refresh a connection with no known expiry", () => {
    expect(shouldRefreshAccessToken({}, Date.now())).toBe(false);
  });

  it("converts the provider's expires_in to an absolute timestamp", () => {
    const now = 1_000_000;
    expect(resolveAccessTokenExpiry(3_600, now)).toBe(now + 3_600_000);
    expect(resolveAccessTokenExpiry(undefined, now)).toBeUndefined();
    expect(resolveAccessTokenExpiry(0, now)).toBeUndefined();
    expect(resolveAccessTokenExpiry("not-a-number", now)).toBeUndefined();
  });
});

describe("agreement liveness", () => {
  it("treats every non-terminal state as live", () => {
    for (const status of [
      "pending_authorization",
      "pending_first_payment",
      "active",
      "retrying",
      "paused_bonification",
      "cancellation_scheduled",
    ] as const) {
      expect(isLiveAgreementStatus(status)).toBe(true);
    }
  });

  it("treats terminal states as not live", () => {
    expect(isLiveAgreementStatus("cancelled")).toBe(false);
    expect(isLiveAgreementStatus("failed")).toBe(false);
  });

  it("only considers an active connection usable", () => {
    expect(isConnectionUsable({ status: "active" })).toBe(true);
    for (const status of [
      "pending",
      "refresh_required",
      "error",
      "disconnected",
    ] as const) {
      expect(isConnectionUsable({ status })).toBe(false);
    }
    expect(isConnectionUsable(null)).toBe(false);
  });
});

describe("toSafeConnection", () => {
  it("drops every credential field by building from an allowlist", () => {
    const safe = toSafeConnection({
      _id: "conn_1" as never,
      _creationTime: 0,
      organizationId: "org_1" as never,
      provider: "mercadopago",
      status: "active",
      providerAccountId: "111",
      providerNickname: "TESTSELLER",
      accessTokenCiphertext: "SECRET-ACCESS",
      accessTokenIv: "SECRET-IV",
      refreshTokenCiphertext: "SECRET-REFRESH",
      refreshTokenIv: "SECRET-IV-2",
      encryptionKeyVersion: "v1",
      webhookRoutingKey: "SECRET-ROUTING-KEY",
      createdAt: 0,
      updatedAt: 0,
    } as never);

    const serialized = JSON.stringify(safe);
    for (const secret of [
      "SECRET-ACCESS",
      "SECRET-IV",
      "SECRET-REFRESH",
      "SECRET-ROUTING-KEY",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(safe.providerNickname).toBe("TESTSELLER");
    expect(safe.status).toBe("active");
  });
});

describe("external references", () => {
  it("round-trips a subscription reference", () => {
    const reference = buildExternalReference({
      kind: "sub",
      organizationId: "org123",
      localId: "sub456",
      nonce: "abc",
    });
    expect(parseExternalReference(reference)).toEqual({
      kind: "sub",
      organizationId: "org123",
      localId: "sub456",
      nonce: "abc",
    });
  });

  it("round-trips every reference a generated nonce can produce", () => {
    // Regression: a base64url nonce can contain "_", the delimiter this
    // reference is parsed on. Such a reference fails ownership verification
    // and its notifications look like they belong to another gym.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const nonce = randomHex(8);
      expect(nonce).toMatch(/^[0-9a-f]+$/);
      const reference = buildExternalReference({
        kind: "sub",
        organizationId: "jd7abc123xyz",
        localId: "kn9def456uvw",
        nonce,
      });
      expect(parseExternalReference(reference)).toEqual({
        kind: "sub",
        organizationId: "jd7abc123xyz",
        localId: "kn9def456uvw",
        nonce,
      });
    }
  });

  it("refuses to build a reference that could not be parsed back", () => {
    expect(() =>
      buildExternalReference({
        kind: "sub",
        organizationId: "org1",
        localId: "sub1",
        nonce: "has_underscore",
      }),
    ).toThrow(/must not contain/);
  });

  it("rejects a malformed or foreign reference", () => {
    expect(parseExternalReference("not-ours")).toBeNull();
    expect(parseExternalReference("mat_xxx_org_sub_nonce")).toBeNull();
    expect(parseExternalReference("mat_sub_org_sub")).toBeNull();
    expect(parseExternalReference("other_sub_org_sub_nonce")).toBeNull();
  });
});

describe("credential encryption", () => {
  it("round-trips a token and produces different ciphertext each time", async () => {
    const token = "APP_USR-1234567890-secret-token";
    const first = await encryptSecret(token, CRYPTO_CONFIG);
    const second = await encryptSecret(token, CRYPTO_CONFIG);

    expect(first.ciphertext).not.toContain(token);
    // A fresh IV per encryption, so identical tokens never share ciphertext.
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    expect(await decryptSecret(first, CRYPTO_CONFIG)).toBe(token);
    expect(await decryptSecret(second, CRYPTO_CONFIG)).toBe(token);
  });

  it("fails rather than silently returning garbage on a tampered ciphertext", async () => {
    const encrypted = await encryptSecret("token", CRYPTO_CONFIG);
    const tampered = {
      ...encrypted,
      ciphertext: btoa(atob(encrypted.ciphertext).replace(/.$/, "X")),
    };
    await expect(decryptSecret(tampered, CRYPTO_CONFIG)).rejects.toThrow();
  });

  it("refuses to decrypt with a different key version", async () => {
    const encrypted = await encryptSecret("token", CRYPTO_CONFIG);
    await expect(
      decryptSecret(encrypted, { ...CRYPTO_CONFIG, keyVersion: "v2" }),
    ).rejects.toThrow(/key version/i);
  });

  it("refuses a key that is not 32 bytes", async () => {
    await expect(
      encryptSecret("token", { key: btoa("too-short"), keyVersion: "v1" }),
    ).rejects.toThrow(/32 bytes/);
  });
});

describe("random tokens and hashing", () => {
  it("produces unique URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hashes deterministically to 64 hex characters", async () => {
    const hash = await sha256Hex("state-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("state-value")).toBe(hash);
    expect(await sha256Hex("state-value ")).not.toBe(hash);
  });

  it("compares equal-length strings without early exit", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
