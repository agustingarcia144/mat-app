#!/usr/bin/env node
/**
 * Generate a signed join-link token for an organization id.
 * Usage: JOIN_LINK_SECRET=xxx node scripts/generate-join-token.mjs <organization_id> [expiry_seconds]
 * Default expiry: 2 years.
 */
import crypto from 'crypto'

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const secret = process.env.JOIN_LINK_SECRET
if (!secret) {
  console.error('Set JOIN_LINK_SECRET')
  process.exit(1)
}

const organizationId = process.argv[2]
if (!organizationId) {
  console.error('Usage: JOIN_LINK_SECRET=xxx node scripts/generate-join-token.mjs <organization_id> [expiry_seconds]')
  process.exit(1)
}

const expirySeconds = parseInt(process.argv[3] || '0', 10) || 2 * 365 * 24 * 60 * 60
const exp = Math.floor(Date.now() / 1000) + expirySeconds
const payload = JSON.stringify({ o: organizationId, exp })
const payloadB64 = base64UrlEncode(Buffer.from(payload, 'utf-8'))
const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest()
const sigB64 = base64UrlEncode(sig)
const token = `${payloadB64}.${sigB64}`

console.log('Token (use in path /join/<token>):')
console.log(token)
console.log('')
console.log('Example URL: https://your-domain.com/join/' + token)
