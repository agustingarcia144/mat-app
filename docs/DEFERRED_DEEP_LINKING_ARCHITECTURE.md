# Deferred Deep Linking — Architecture

## Goal

Support QR-based organization join with a secure deferred flow:

1. User scans link.
2. App/web validates token.
3. User confirms join explicitly.
4. Backend creates request/membership in Convex.

## Trust boundaries

- Untrusted: client URL/body/query/local storage.
- Trusted: Convex verification and mutations.

## Security model

- Signed token with HMAC (`JOIN_LINK_SECRET`).
- Payload contains:
  - `o` (organization id)
  - `exp` (expiry timestamp)
- Backend verifies signature + expiry before any org action.

## Backend contract

- `getJoinPreview({ token })`
  - verifies token
  - returns public org preview data
- `joinGymByToken({ token })`
  - verifies token
  - creates pending join request
- `approveJoinRequest({ requestId })`
  - staff-only
  - creates/activates membership in Convex

## UX requirements

- No silent join.
- Always show confirmation with org name.
- Handle invalid/expired token with clear message.
- Keep join idempotent for retries.
