/**
 * HTTP entry points for member payments.
 *
 * Kept separate from the organization -> MAT billing routes
 * (`/mercadopago-webhook`), which use MAT's own global seller credential.
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildOAuthResultUrl,
  buildWebhookEventKey,
  buildWebhookSignatureManifest,
  classifyWebhookTopic,
  DEFAULT_RETURN_PATH,
  isWebhookTimestampFresh,
  parseSignatureHeader,
  parseWebhookRoutingKey,
} from "./memberPaymentDomain";
import {
  getMemberPaymentsWebAppUrl,
  getMemberPaymentsWebhookSecret,
} from "./memberPaymentsEnv";
import { hmacSha256Hex, safeEqual } from "./memberPaymentsCrypto";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/**
 * Mercado Pago OAuth callback: `GET /member-payments/oauth/callback`.
 *
 * The browser is always redirected back to an allowlisted web-app path with a
 * short result code. No token, provider message or organization id is ever put
 * in that URL.
 */
export const mercadoPagoOAuthCallback = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  let webAppOrigin: string;
  try {
    webAppOrigin = getMemberPaymentsWebAppUrl();
  } catch {
    // Without a configured origin there is nowhere safe to redirect to.
    return new Response("Member payments are not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) {
    console.error(
      `[member-payments] oauth callback returned provider error: ${providerError}`,
    );
    return redirect(
      buildOAuthResultUrl({
        webAppOrigin,
        returnPath: DEFAULT_RETURN_PATH,
        result: providerError === "access_denied" ? "denied" : "error",
        reason: providerError === "access_denied" ? undefined : "provider_error",
      }),
    );
  }

  if (!code || !state) {
    console.error(
      "[member-payments] oauth callback missing parameters " +
        `(code: ${code ? "present" : "absent"}, state: ${state ? "present" : "absent"})`,
    );
    return redirect(
      buildOAuthResultUrl({
        webAppOrigin,
        returnPath: DEFAULT_RETURN_PATH,
        result: "error",
        reason: "missing_parameters",
      }),
    );
  }

  const result = await ctx.runAction(
    internal.memberPaymentsActions.completeMercadoPagoConnection,
    { code, state },
  );

  return redirect(
    buildOAuthResultUrl({
      webAppOrigin,
      returnPath: result.returnPath || DEFAULT_RETURN_PATH,
      result: result.ok ? "success" : "error",
      reason: result.ok ? undefined : result.reason,
    }),
  );
});

/**
 * Member-payment webhook: `POST /member-payments/webhook/<routingKey>`.
 *
 * The routing key selects which gym's token to fetch the resource with,
 * without putting an organization id in a URL Mercado Pago stores.
 *
 * The handler stays deliberately thin: verify, deduplicate, acknowledge. The
 * resource fetch and state transition run in a scheduled action, so Mercado
 * Pago always gets a fast response and a retry costs nothing.
 */
export const mercadoPagoMemberWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const routingKey = parseWebhookRoutingKey(url.pathname);
  if (!routingKey) {
    return new Response("Not found", { status: 404 });
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const resourceId = readResourceId(payload, url);
  const requestId = request.headers.get("x-request-id");
  const { ts, v1 } = parseSignatureHeader(request.headers.get("x-signature"));

  // Nothing is read or written before the signature checks out.
  if (!resourceId || !requestId || !ts || !v1) {
    return new Response("Missing signature inputs", { status: 401 });
  }
  if (!isWebhookTimestampFresh(ts, Date.now())) {
    // A captured notification replayed later must not be accepted.
    return new Response("Stale notification", { status: 401 });
  }

  let expected: string;
  try {
    expected = await hmacSha256Hex(
      getMemberPaymentsWebhookSecret(),
      buildWebhookSignatureManifest({ dataId: resourceId, requestId, ts }),
    );
  } catch {
    return new Response("Member payments are not configured", { status: 500 });
  }

  if (!safeEqual(expected, v1)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const connection = await ctx.runQuery(
    internal.memberPayments.getConnectionByRoutingKeyInternal,
    { webhookRoutingKey: routingKey },
  );

  if (!connection) {
    // A signed notification for a gym MAT no longer knows about. Acknowledge
    // it so Mercado Pago stops retrying something that can never be applied.
    return new Response(null, { status: 200 });
  }

  const rawTopic = payload?.type ?? payload?.topic ?? url.searchParams.get("topic");
  const topic = classifyWebhookTopic(rawTopic);
  const action = typeof payload?.action === "string" ? payload.action : undefined;

  const { eventId, shouldProcess } = await ctx.runMutation(
    internal.memberPayments.recordWebhookEventInternal,
    {
      connectionId: connection._id,
      eventKey: buildWebhookEventKey({
        connectionId: connection._id,
        requestId,
        topic: String(rawTopic ?? "unknown"),
        resourceId,
        action,
      }),
      providerEventId:
        payload?.id === undefined || payload?.id === null
          ? undefined
          : String(payload.id),
      providerRequestId: requestId,
      topic: rawTopic ? String(rawTopic) : undefined,
      action,
      resourceType: topic ?? undefined,
      resourceId,
      ignored: topic === null,
    },
  );

  if (shouldProcess) {
    await ctx.scheduler.runAfter(
      0,
      internal.memberPaymentsActions.processWebhookEvent,
      { eventId },
    );
  }

  return new Response(null, { status: 200 });
});

function readResourceId(payload: any, url: URL): string | null {
  const raw =
    payload?.data?.id ??
    payload?.id ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id");
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

/**
 * Public payment status for the web fallback:
 * `GET /member-payments/return/<sessionId>`.
 *
 * Reached when a member finishes checkout on a device where the app did not
 * take over the return link — the app is not installed, app links are not
 * verified, or the browser stripped the hand-off. Without this the member is
 * left on a 404 wondering whether their money went somewhere.
 *
 * Returns a state and nothing else. See
 * `getCheckoutSessionPublicStatusInternal` for why it carries no amounts,
 * names or identifiers.
 */
export const memberPaymentReturnStatus = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const prefix = "/member-payments/return/";
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(prefix)) {
    return new Response("Not found", { status: 404 });
  }

  const sessionId = decodeURIComponent(
    pathname.slice(prefix.length).replace(/\/.*$/, "").trim(),
  );

  const result = sessionId
    ? await ctx.runQuery(
        internal.memberPayments.getCheckoutSessionPublicStatusInternal,
        { sessionId },
      )
    : { status: "unknown" as const };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
