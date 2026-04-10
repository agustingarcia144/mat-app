/**
 * Node.js actions for join gym flow (crypto, fetch to Clerk API).
 * Must be in a separate file so only these run in Node runtime.
 */
"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (3 - (str.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/**
 * Verify signed join token and return organization id.
 * Runs in Node for crypto.
 */
export const verifyJoinToken = internalAction({
  args: { token: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ organizationId: string; exp: number }> => {
    const { createHmac } = await import("node:crypto");
    const secret = process.env.JOIN_LINK_SECRET;
    if (!secret) {
      throw new Error("JOIN_LINK_SECRET is not configured");
    }

    const parts = args.token.split(".");
    if (parts.length !== 2) {
      throw new Error("Invalid token format");
    }

    const [payloadB64, sigB64] = parts;
    const payloadJson = base64UrlDecode(payloadB64).toString("utf-8");
    const message = payloadB64;
    const expectedSig = createHmac("sha256", secret).update(message).digest();
    const expectedSigB64 = base64UrlEncode(expectedSig);
    if (expectedSigB64 !== sigB64) {
      throw new Error("Invalid token signature");
    }

    let payload: { o?: string; exp?: number };
    try {
      payload = JSON.parse(payloadJson) as { o?: string; exp?: number };
    } catch {
      throw new Error("Invalid token payload");
    }

    const organizationId = payload.o;
    const exp = payload.exp;
    if (!organizationId || typeof exp !== "number") {
      throw new Error("Invalid token payload");
    }
    if (Date.now() / 1000 > exp) {
      throw new Error("Token expired");
    }

    return { organizationId, exp };
  },
});

/**
 * Create a signed join token for an organization.
 * Used to produce long-lived QR/deep-link URLs managed from the dashboard.
 */
export const createJoinToken = internalAction({
  args: {
    organizationId: v.string(),
    expiresInSeconds: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ token: string; exp: number }> => {
    const { createHmac } = await import("node:crypto");
    const secret = process.env.JOIN_LINK_SECRET;
    if (!secret) {
      throw new Error("JOIN_LINK_SECRET is not configured");
    }

    const ttl = Math.max(60, args.expiresInSeconds ?? 10 * 365 * 24 * 60 * 60);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const payload = JSON.stringify({ o: args.organizationId, exp });
    const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf-8"));
    const sig = createHmac("sha256", secret).update(payloadB64).digest();
    const sigB64 = base64UrlEncode(sig);

    return {
      token: `${payloadB64}.${sigB64}`,
      exp,
    };
  },
});
