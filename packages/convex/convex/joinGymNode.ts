/**
 * Node.js actions for join gym flow (crypto, fetch to Clerk API).
 * Must be in a separate file so only these run in Node runtime.
 */
"use node"

import { internalAction } from './_generated/server'
import { v } from 'convex/values'

const CLERK_API_BASE = 'https://api.clerk.com/v1'

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): Buffer {
  const padded =
    str.replace(/-/g, '+').replace(/_/g, '/') +
    '=='.slice(0, (3 - (str.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

/**
 * Verify signed join token and return Clerk org id. Runs in Node for crypto.
 */
export const verifyJoinToken = internalAction({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ clerkOrgId: string; exp: number }> => {
    const { createHmac } = await import('node:crypto')
    const secret = process.env.JOIN_LINK_SECRET
    if (!secret) {
      throw new Error('JOIN_LINK_SECRET is not configured')
    }

    const parts = args.token.split('.')
    if (parts.length !== 2) {
      throw new Error('Invalid token format')
    }

    const [payloadB64, sigB64] = parts
    const payloadJson = base64UrlDecode(payloadB64).toString('utf-8')
    const message = payloadB64
    const expectedSig = createHmac('sha256', secret).update(message).digest()
    const expectedSigB64 = base64UrlEncode(expectedSig)
    if (expectedSigB64 !== sigB64) {
      throw new Error('Invalid token signature')
    }

    let payload: { o?: string; exp?: number }
    try {
      payload = JSON.parse(payloadJson) as { o?: string; exp?: number }
    } catch {
      throw new Error('Invalid token payload')
    }

    const clerkOrgId = payload.o
    const exp = payload.exp
    if (!clerkOrgId || typeof exp !== 'number') {
      throw new Error('Invalid token payload')
    }
    if (Date.now() / 1000 > exp) {
      throw new Error('Token expired')
    }

    return { clerkOrgId, exp }
  },
})

/**
 * Create organization membership in Clerk. Convex will sync via webhook.
 */
export const createClerkMembership = internalAction({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const secret = process.env.CLERK_SECRET_KEY
    if (!secret) {
      throw new Error('CLERK_SECRET_KEY is not configured')
    }

    const url = `${CLERK_API_BASE}/organizations/${args.clerkOrgId}/memberships`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: args.clerkUserId,
        role: 'org:member',
      }),
    })

    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      return { ok: true }
    }
    const errMsg = body?.errors?.[0]?.message ?? body?.message ?? res.statusText
    if (
      res.status === 422 &&
      /already a member|already exists/i.test(String(errMsg))
    ) {
      return { ok: true }
    }
    return { ok: false, error: errMsg }
  },
})
