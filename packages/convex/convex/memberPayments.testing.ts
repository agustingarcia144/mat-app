/**
 * Shared test scaffolding for the member-payment suites.
 *
 * The double-dotted filename keeps this out of the Convex deployment bundle.
 */

import type { convexTest } from "convex-test";
import { buildWebhookSignatureManifest } from "./memberPaymentDomain";
import { encryptSecret, hmacSha256Hex } from "./memberPaymentsCrypto";

export type TestConvex = ReturnType<typeof convexTest>;

export const ADMIN = "user_admin";
export const MEMBER = "user_member";
export const FAMILY_CHILD = "user_child";
export const ROUTING_KEY = "routing-key-gym-a";
export const WEBHOOK_SECRET = "test-webhook-secret";
export const PREAPPROVAL_ID = "2c9380848a1b2c3d";

/** A deterministic 32-byte AES-256 key. Test-only; never a deployment key. */
export const TEST_ENCRYPTION_KEY = btoa("0123456789abcdef0123456789abcdef");

/** Every variable the member-payment code reads, pointed at fakes. */
export function setMemberPaymentTestEnv(options: { killSwitch?: boolean } = {}) {
  if (options.killSwitch === false) {
    delete process.env.MEMBER_MP_PAYMENTS_ENABLED;
  } else {
    process.env.MEMBER_MP_PAYMENTS_ENABLED = "true";
  }
  process.env.MERCADOPAGO_CLIENT_ID = "test-client-id";
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-client-secret";
  process.env.MEMBER_PAYMENTS_OAUTH_REDIRECT_URL =
    "https://deployment.convex.site/member-payments/oauth/callback";
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION = "v1";
  process.env.MEMBER_PAYMENTS_WEB_APP_URL = "https://app.matgestion.app";
  process.env.MEMBER_PAYMENTS_WEBHOOK_BASE_URL = "https://deployment.convex.site";
  process.env.MEMBER_PAYMENTS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.MEMBER_PAYMENTS_MOBILE_RETURN_URL =
    "https://matgestion.app/payments/return";
}

/** Credentials a seeded connection can actually decrypt. */
export async function testCredentials() {
  const config = { key: TEST_ENCRYPTION_KEY, keyVersion: "v1" };
  const [access, refresh] = await Promise.all([
    encryptSecret("TEST-gym-token", config),
    encryptSecret("TG-gym-refresh", config),
  ]);
  return {
    accessTokenCiphertext: access.ciphertext,
    accessTokenIv: access.iv,
    refreshTokenCiphertext: refresh.ciphertext,
    refreshTokenIv: refresh.iv,
    encryptionKeyVersion: "v1" as const,
  };
}

/**
 * The webhook handler acknowledges immediately and does the real work in a
 * scheduled action. Wait for that work by watching the ledger rather than by
 * guessing at a delay, so tests never depend on wall-clock timing.
 */
export async function drainScheduled(t: TestConvex, attempts = 200) {
  for (let pass = 0; pass < attempts; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await t.finishInProgressScheduledFunctions();

    const stillProcessing = await t.run((ctx) =>
      ctx.db
        .query("paymentProviderWebhookEvents")
        .filter((q) => q.eq(q.field("status"), "processing"))
        .first(),
    );
    if (!stillProcessing) return;
  }

  throw new Error("Timed out waiting for webhook processing to finish");
}

/**
 * Let every pending scheduled function run, including ones scheduled by other
 * scheduled functions.
 *
 * Notifications fan out through a chain — mutation schedules a notify
 * mutation, which schedules the push action, which records the event — so
 * waiting on a single condition is not enough. Bounded so a runaway chain
 * fails the test instead of hanging it.
 */
export async function drainAllScheduled(t: TestConvex, passes = 12) {
  for (let pass = 0; pass < passes; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await t.finishInProgressScheduledFunctions();
  }
}

/** Post a correctly signed member-payment notification and let it settle. */
export async function postSignedWebhook(
  t: TestConvex,
  options: {
    topic: string;
    resourceId: string;
    action?: string;
    routingKey?: string;
    requestId?: string;
    secret?: string;
  },
) {
  const requestId = options.requestId ?? `req-${Math.random()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Hex(
    options.secret ?? WEBHOOK_SECRET,
    buildWebhookSignatureManifest({
      dataId: options.resourceId,
      requestId,
      ts,
    }),
  );

  const response = await t.fetch(
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

  await drainScheduled(t);
  return response;
}
