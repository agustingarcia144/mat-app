# Deferred Deep Linking — Implementation Summary

Deferred join links are now fully Convex-native for organization membership flows.
Clerk remains auth-only.

## Implemented backend flow

- `verifyJoinToken` validates signed join token payload.
- `getJoinPreview` returns org name/logo and membership status for confirmation.
- `joinGymByToken` creates a pending join request.
- `approveJoinRequest` creates/activates membership in Convex.
- `rejectJoinRequest` marks pending request as rejected.

## Token payload

- `o`: organization id
- `exp`: Unix expiry (seconds)

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JOIN_LINK_SECRET` | Yes | Secret used to sign and verify join tokens |
| `CONVEX_HTTP_URL` | Yes (web join page) | Base URL for Convex HTTP endpoints |

## Operational notes

- Never trust organization identifiers from client body/query.
- Use token verification as the source of org selection.
- Membership writes happen in Convex only.
