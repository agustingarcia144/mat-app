# Deferred Deep Linking — Implementation Summary

This document describes what was implemented and how to configure it. See [DEFERRED_DEEP_LINKING_ARCHITECTURE.md](./DEFERRED_DEEP_LINKING_ARCHITECTURE.md) for the full security design.

## What Was Implemented

### 1. Convex backend (`packages/convex/convex/`)

- **`joinGym.ts`**
  - **`verifyJoinToken`** (internal action, Node): Verifies HMAC-signed token, returns `{ clerkOrgId, exp }`. Uses env `JOIN_LINK_SECRET`.
  - **`createClerkMembership`** (internal action, Node): Calls Clerk API `POST /organizations/:id/memberships` to add the user as `org:member`. Uses env `CLERK_SECRET_KEY`. Idempotent (treats “already member” as success).
  - **`getOrgByExternalId`** (internal query): Returns `{ name, logoUrl }` for an organization by Clerk external id.
  - **`getJoinPreview`** (public mutation): Requires auth. Validates token, returns `{ name, logoUrl, alreadyMember, organizationExternalId }` for the confirmation screen.
  - **`joinGymByToken`** (public mutation): Requires auth. Validates token, ensures org exists in Convex, calls Clerk to create membership. Returns `{ success, organizationExternalId, organizationName }`.
  - **`httpJoinPreview`** (HTTP action): `GET /join/<token>`. Public (no auth). Validates token, returns JSON `{ name, logoUrl }` or error. Used by the web fallback page.

- **Join approval**: `joinGymByToken` creates a **pending join request** (table `organizationJoinRequests`) instead of creating membership directly. **`listPendingJoinRequests`** (query, staff only), **`approveJoinRequest`** (mutation: creates Clerk membership + marks approved), **`rejectJoinRequest`** (mutation) so gym admins/trainers control who joins.

- **`http.ts`**: New route with `pathPrefix: "/join/"`, method GET, handler `httpJoinPreview`.

**Token format:** `base64url(JSON.stringify({ o, exp })) + "." + base64url(HMAC-SHA256(payloadB64, JOIN_LINK_SECRET))`  
- `o` = Clerk organization ID  
- `exp` = Unix expiry (seconds)

### 2. Token generation script

- **`scripts/generate-join-token.mjs`**  
  Generates a signed token for a Clerk org id.  
  Usage:
  ```bash
  JOIN_LINK_SECRET=<secret> node scripts/generate-join-token.mjs <clerk_org_id> [expiry_seconds]
  ```
  Default expiry: 2 years. Use the printed token in the path: `https://your-domain.com/join/<token>`.

### 3. Web fallback (`apps/web/`)

- **`app/join/[token]/page.tsx`**  
  Server component. Fetches join preview from Convex HTTP (`CONVEX_HTTP_URL/join/<token>`). Renders gym name and logo, App Store / Play Store links, and an “open in app” link (`mat-app://join/<token>`). Handles invalid/expired token with a clear message.

### 4. Mobile app (`apps/mobile/`)

- **`lib/pending-join.ts`**  
  SecureStore helpers: `getPendingJoinToken`, `setPendingJoinToken`, `clearPendingJoinToken`, and `parseJoinTokenFromUrl(url)` for `https://.../join/TOKEN` and `mat-app://join/TOKEN`.

- **`contexts/pending-join-context.tsx`**  
  `PendingJoinProvider`: loads pending token from SecureStore on mount; subscribes to `Linking.getInitialURL()` and `Linking.addEventListener('url')`; when URL contains `/join/<token>`, stores the token. Exposes `pendingToken`, `setPendingToken`, `clearPending`, `isLoading`.

- **`app/join-gym-confirm.tsx`**  
  Screen shown when user is authenticated and there is a pending join token. Calls `getJoinPreview`, shows “¿Querés unirte a este gimnasio? {name}” with Join / Cancel. On Join: `joinGymByToken`, then `clearPending` and navigate to `/select-organization`. On Cancel or error: `clearPending` and navigate. Handles “already member” and invalid/expired token.

- **`app/_layout.tsx`**  
  Uses `usePendingJoin()`. If authenticated and `pendingToken` is set and not already on `join-gym-confirm`, redirects to `/join-gym-confirm`. Added `Stack.Screen name="join-gym-confirm"`. Unauthenticated users on join-gym-confirm are sent to `/`.

- **`components/providers/providers.tsx`**  
  Wraps children with `PendingJoinProvider` inside Convex/Clerk.

- **`app.json`**  
  - `ios.associatedDomains`: `["applinks:mat-app-web.vercel.app"]` — requires paid Apple Developer account ($99/year).  
  - `android.intentFilters`: VIEW intent for `https://mat-app-web.vercel.app/join` (pathPrefix `/join`).

## Environment and configuration

### Convex (dashboard or `.env` for `convex dev`)

| Variable | Required | Description |
|----------|----------|-------------|
| `JOIN_LINK_SECRET` | Yes | Secret used to sign and verify join tokens (e.g. 32+ random bytes, base64). |
| `CLERK_SECRET_KEY` | Yes (for join) | Clerk secret key so the Convex action can create organization memberships. |

### Web app (Next.js)

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVEX_HTTP_URL` | Yes (for join page) | Base URL of Convex HTTP routes (e.g. `https://<deployment>.convex.site`). Used to fetch `GET /join/<token>`. |
| `NEXT_PUBLIC_APP_STORE_URL` | No | App Store link for the “Download app” button. Defaults to a generic App Store URL. |
| `NEXT_PUBLIC_PLAY_STORE_URL` | No | Play Store link. Defaults to a generic Play Store URL. |

### Mobile (Expo)

- Replace `app.yourdomain.com` in `app.json` (`associatedDomains` and `intentFilters`) with your real web domain that serves the join page and will be used for Universal Links / App Links.

## After pulling this implementation

1. **Convex**
   - Set `JOIN_LINK_SECRET` and `CLERK_SECRET_KEY` in the Convex dashboard (or env for `convex dev`).
   - Run codegen so `api.joinGym` is available:
     ```bash
     pnpm --filter @repo/convex exec convex codegen
     ```
     or run `convex dev` once.

2. **Web**
   - Set `CONVEX_HTTP_URL` to your Convex HTTP base (e.g. `https://<deployment>.convex.site`).
   - Ensure the join page is served at `https://<your-domain>/join/[token]` (same domain as in `associatedDomains` / `intentFilters`).

3. **Mobile**
   - In `app.json`, replace `app.yourdomain.com` with your domain.
   - Host the Apple App Site Association (AASA) and, for Android, `assetlinks.json` at that domain so Universal Links / App Links work.

4. **QR codes**
   - Generate tokens with `scripts/generate-join-token.mjs` and use URLs: `https://<your-domain>/join/<token>`.

## Join approval flow (gym control)

When a user joins via QR, they **do not** become a member immediately. A **pending join request** is created. Gym admins/trainers approve or reject in the web dashboard.

- **Schema**: `organizationJoinRequests` — `organizationId`, `userId`, `status` (pending | approved | rejected), `requestedAt`, `resolvedAt`, `resolvedBy`, `source` (e.g. `qr`).
- **joinGymByToken**: Creates a row with `status: 'pending'` (or returns success if already member or already pending). Returns `{ success, organizationName, pending, message }`.
- **Web dashboard** (Miembros): Card “Solicitudes de unión” at the top (only when there are pending requests; visible to admin/trainer). Each request shows user name/email and **Aprobar** / **Rechazar**.
- **approveJoinRequest** (mutation): Admin/trainer only. Calls Clerk to create membership, then marks the request `approved` and sets `resolvedAt` / `resolvedBy`.
- **rejectJoinRequest** (mutation): Admin/trainer only. Marks the request `rejected` with `resolvedAt` / `resolvedBy`.
- **Mobile**: After “Unirme”, the app shows “Solicitud enviada. El gimnasio revisará tu solicitud.” and a button to continue (no immediate membership).

## iOS device build: provisioning profile error

If you see `No profiles for 'com.agusstingarcia144.matapp' were found` when running on a physical device:

1. **Use the device script** (passes `-allowProvisioningUpdates` to xcodebuild):
   ```bash
   cd apps/mobile && pnpm run ios:device
   ```

2. **If that still fails**, do a one-time setup in Xcode:
   ```bash
   cd apps/mobile && pnpm run ios:xcode
   ```
   In Xcode: select the **Mat** target → **Signing & Capabilities** → enable **Automatically manage signing** → choose your **Team**. Then build (⌘B) or run (⌘R) from Xcode. After the profile is created, `pnpm run ios:device` should work.

## Security reminders

- Never trust `gymId`/`orgId` from the client; only from the verified token on the backend.
- All membership creation goes through Clerk API from the Convex action (on approve); Convex stays in sync via existing webhooks.
- Do not auto-switch the active org after join; the user chooses in select-organization.
