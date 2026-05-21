import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const unsafeInternal = internal as any;
const MP_API_BASE = "https://api.mercadopago.com";
const MAX_WEBHOOK_AGE_MS = 10 * 60 * 1000;

function parseSignatureHeader(header: string | null) {
  const parts = new Map<string, string>();
  for (const part of (header ?? "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value) parts.set(key.trim(), value.trim());
  }
  return {
    ts: parts.get("ts"),
    v1: parts.get("v1"),
  };
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(signature);
}

async function verifyMercadoPagoSignature(request: Request, dataId: string | null) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing MERCADOPAGO_WEBHOOK_SECRET");
  }

  const requestId = request.headers.get("x-request-id");
  const { ts, v1 } = parseSignatureHeader(request.headers.get("x-signature"));
  if (!requestId || !ts || !v1 || !dataId) {
    return false;
  }

  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return false;
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  if (Math.abs(Date.now() - timestampMs) > MAX_WEBHOOK_AGE_MS) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  return safeEqual(expected, v1);
}

function getResourceType(payload: any, url: URL) {
  const raw = payload?.type ?? payload?.topic ?? url.searchParams.get("topic");
  if (!raw) return undefined;
  const value = String(raw);
  if (value.includes("payment")) return "payment";
  if (value.includes("preapproval")) return "preapproval";
  if (value.includes("subscription")) return "preapproval";
  return value;
}

function getResourceId(payload: any, url: URL) {
  return (
    payload?.data?.id ??
    payload?.id ??
    payload?.resource ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id")
  );
}

async function fetchMercadoPagoResource(resourceType: string, resourceId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN");
  }

  const path =
    resourceType === "payment"
      ? `/v1/payments/${encodeURIComponent(resourceId)}`
      : `/preapproval/${encodeURIComponent(resourceId)}`;

  const response = await fetch(`${MP_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `MercadoPago resource fetch failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

export const mercadoPagoWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rawPayload = await request.text();
  const payload = rawPayload ? JSON.parse(rawPayload) : {};
  const dataId = url.searchParams.get("data.id") ?? payload?.data?.id ?? null;

  const valid = await verifyMercadoPagoSignature(request, dataId);
  if (!valid) {
    return new Response("Invalid MercadoPago signature", { status: 400 });
  }

  const requestId = request.headers.get("x-request-id") ?? "unknown";
  const resourceType = getResourceType(payload, url);
  const resourceId = getResourceId(payload, url);
  const eventId = String(
    payload?.id ?? `${requestId}:${resourceType ?? "unknown"}:${resourceId ?? "unknown"}`,
  );
  const action = payload?.action ? String(payload.action) : undefined;

  const processing = await ctx.runMutation(
    unsafeInternal.organizationBilling.beginWebhookProcessingInternal,
    {
      eventId,
      requestId,
      type: String(payload?.type ?? payload?.topic ?? resourceType ?? "unknown"),
      action,
      resourceId: resourceId ? String(resourceId) : undefined,
      resourceType: resourceType ? String(resourceType) : undefined,
    },
  );

  if (processing.alreadyProcessed) {
    return new Response(null, { status: 200 });
  }

  try {
    if (!resourceType || !resourceId) {
      await ctx.runMutation(
        unsafeInternal.organizationBilling.markWebhookProcessedInternal,
        { eventId, status: "ignored" },
      );
      return new Response(null, { status: 200 });
    }

    const resource = await fetchMercadoPagoResource(
      String(resourceType),
      String(resourceId),
    );
    const result = await ctx.runMutation(
      unsafeInternal.organizationBilling.syncFromMercadoPagoInternal,
      { resource },
    );

    await ctx.runMutation(
      unsafeInternal.organizationBilling.markWebhookProcessedInternal,
      { eventId, status: result.synced ? "processed" : "ignored" },
    );

    return new Response(null, { status: 200 });
  } catch (error) {
    await ctx.runMutation(
      unsafeInternal.organizationBilling.markWebhookFailedInternal,
      {
        eventId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    );
    return new Response("MercadoPago webhook processing failed", {
      status: 500,
    });
  }
});
