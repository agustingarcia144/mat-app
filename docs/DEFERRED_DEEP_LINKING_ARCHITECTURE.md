# Deferred Deep Linking — Secure Architecture (B2B SaaS Fitness)

**Stack:** Expo (Managed), EAS, Expo Linking, Clerk, Convex, multi-organization.  
**Goal:** Production-safe QR-based gym join flow with deferred deep linking (no Branch/FDL).

---

## 1. Threat Model

### 1.1 Assets

- **Gym membership**: ability to associate a user with an organization; grants access to org data.
- **Organization identity**: which gym the user is joining; must not be spoofable.
- **User intent**: “join Gym X” must be explicit and confirmed; no silent joins.

### 1.2 Actors

- **End user**: scans QR, may be unauthenticated, may have 0 or many orgs.
- **Attacker**: can scan same QR, capture/share URLs, tamper with clients, replay requests.
- **Gym**: physical QR is public and long-lived; gym may be deleted or restricted later.

### 1.3 Trust Boundaries

- **Untrusted**: URL (including path/query), client storage (localStorage, AsyncStorage), any client-supplied `gymId` or `orgId`.
- **Trusted**: Convex (validation + membership write), Clerk (identity + org membership source of truth), backend-issued signed tokens and one-time join contracts.

---

## 2. Identified Risks

### 2.1 Attack Vectors

| Vector | Description | Impact |
|--------|-------------|--------|
| **Org injection** | Client sends arbitrary `gymId`/`orgId` to “join” any org | Unauthorized membership |
| **Token tampering** | Alter signed token (e.g. change org, extend expiry) | Join wrong org or bypass expiry |
| **Token forgery** | Create token without backend secret | Join any org without valid QR |
| **Replay** | Reuse same token multiple times (or after join) | Duplicate joins, enumeration, or abuse |
| **Enumeration** | Tokens or URLs guessable (e.g. sequential IDs) | Discover orgs or abuse join endpoint |
| **Bypass confirmation** | Client triggers “join” without user consent | Silent membership |
| **Clerk/Convex desync** | Convex thinks user is member but Clerk does not (or vice versa) | Broken auth or wrong data access |

### 2.2 Tampering Risks

- **URL / query params**: Any `gymId`, `orgId`, or unsigned “token” in the link must be ignored for authorization. Only server-validated, signed payloads may drive membership.
- **Signed token**: Must be HMAC-signed (or equivalent) so any change invalidates the signature. Payload must include org identifier, expiry, and optional nonce/use-once id.
- **Web fallback storage**: If join intent is stored in localStorage or similar, assume it can be edited; use it only for UX (e.g. redirect after install). Actual join must be driven by the same signed link opened in-app.

### 2.3 Replay Risks

- **Same token, multiple users**: Token should not embed user id; join is “any authenticated user may consume this token once (or limited times) for this org.” Replay is mitigated by **single-use or limited-use** token semantics (see Token Strategy).
- **Same token, same user, twice**: Idempotent “join”: if already member, return success and do not create duplicate membership; optionally record that token was used.
- **Old token after leave/ban**: Token represents “invitation to join at scan time”; backend must re-check org exists, user not banned, and (if you add it) org still allows join-by-QR.

### 2.4 Race Conditions

- **Double-tap confirm**: User taps “Join” twice; two requests. Backend must be idempotent (e.g. “add membership” = “ensure membership exists”; Clerk create membership is naturally idempotent by org+user).
- **Token consumed by another device**: If token is single-use globally, second device gets “already used.” Handle with clear error and no partial state.
- **Webhook vs direct read**: After calling Clerk to create membership, Convex syncs via webhook. Mobile may read Convex before webhook completes. Prefer: after “join” API success, show success and let existing “current membership” / org list logic (and optional refetch) handle eventual consistency; avoid assuming Convex has the new membership in the same request.

### 2.5 Mobile Lifecycle Risks

| Scenario | Risk |
|----------|------|
| **Cold start via link** | App opens from killed state with URL; must capture URL before router/auth redirects and store “pending join” for after auth. |
| **Background resume** | Link opens app in background; listener must run and persist intent; avoid overwriting previous pending intent unless intentional. |
| **App reinstall** | No durable storage from before install; only way to restore intent is **same URL** (e.g. Universal Link) opened after install, or web fallback that preserves link. |
| **Deep link while logged out** | Do not join before auth. Store pending join; after login (and optional onboarding), run join flow with stored token. |
| **First open after install** | If opened via Universal Link, same as cold start; capture URL and defer until authenticated. |

### 2.6 Org Desynchronization Risks

- **Clerk as source of truth**: All org membership must be created in Clerk (Backend API). Convex only reflects membership via webhooks. Do not create `organizationMemberships` in Convex directly for “join by QR”; that would desync (Clerk would not have the member).
- **Active org**: After adding a new gym, do **not** auto-switch `activeOrganizationExternalId` or Clerk active org. Let user stay on current org or choose later; auto-switching can confuse and create race with token refresh / Convex reads.

### 2.7 Clerk Token Refresh Issues

- **JWT expiry mid-flow**: If user opens link, goes to login, completes 2FA slowly, token may expire. Handle 401 from Convex and re-prompt auth; keep pending join in storage so after re-auth the join runs.
- **Org claim in token**: After Clerk adds user to org, the next token may include new org. Convex `requireCurrentOrganizationMembership` uses identity org or `activeOrganizationExternalId`. Do not assume new org is “active” until user or app sets it.

### 2.8 Edge Cases

| Case | Handling |
|------|----------|
| User removed from gym after scanning | At confirm time, backend validates token and org; at join time, Clerk create membership. If user was removed, they are simply re-added (gym’s policy). If you need “banned” state, backend must check a ban list before calling Clerk. |
| User scans twice | Same token; idempotent join (already member → success). No duplicate membership. |
| User cancels confirmation | Discard pending join; clear stored intent. No server call. |
| User installs but never completes | Pending intent remains in app storage until consumed or cleared (e.g. on next app open with different link or after expiry). Optional: clear intent if token is expired when app opens. |
| Gym deleted after QR printed | Backend validates org exists before showing confirm and before calling Clerk. If org deleted, return “Gym no longer available.” |
| Token expired when app opens | Do not show “Join Gym X”; show “Link expired” and clear intent. |

---

## 3. Secure Architecture (High Level)

- **QR / link**: Encodes a **signed token** (HMAC) that binds: org identifier (Clerk org id or stable slug), expiry, optional nonce/use-once id. No trust of client-supplied org id.
- **App (installed)**: Opens via custom scheme or Universal Link; captures URL, parses token, stores “pending join” (token only). After auth, show confirmation screen with org name fetched server-side using token; on confirm, call Convex join API only.
- **Web fallback (not installed)**: Same URL; page shows gym branding (from server using token) and app download; preserves link in URL or short-lived cookie for “open in app” after install (no trust of client storage for authorization).
- **Backend join**: One Convex mutation (or mutation + action): validate signature and payload, ensure org exists and user not banned, then **call Clerk Backend API** to create organization membership; Convex syncs via existing webhook. No Convex-only membership creation for this flow.
- **Confirmation**: Always show “Do you want to join Gym X?” with gym name from backend; never auto-join without explicit user action.

---

## 4. Token Strategy

### 4.1 Token Type and Format

- **Format**: Opaque signed payload (e.g. base64url(JSON payload) + “.” + base64url(HMAC-SHA256)).
- **Payload**: `{ o: string, exp: number, jti?: string }` where `o` = Clerk organization ID (or stable org slug if you resolve server-side), `exp` = expiry (Unix s), optional `jti` = unique id for one-time use.
- **Why not JWT**: JWTs are fine; opaque HMAC is simpler and keeps size small. Both prevent tampering and support expiry. Avoid putting sensitive data in payload; org id is not secret (QR is public) but must be bound so it cannot be changed.

### 4.2 Expiration

- **Recommendation**: Long-lived (e.g. 2 years) so printed QR stays valid. Replay is limited by one-time or idempotent join and by auth.
- **Alternative**: Shorter (e.g. 90 days) if you rotate QRs periodically; then you need a process to re-print and replace.

### 4.3 Rotation

- QR can be permanent (long-lived token). No need to rotate unless you introduce one-time tokens (then each print could have unique `jti`). Rotation of the **signing key** invalidates all existing QRs; do only with migration plan.

### 4.4 What the Token Represents

- **Option A — gymId direct**: Payload `o` = Clerk org id. Backend resolves to Convex org, validates org exists. Simple; Clerk org id is not secret.
- **Option B — inviteId in DB**: Store a row “join link” with orgId, optional expiry, optional use count; token = signed `inviteId`. Gives revocation and analytics. For “permanent QR on wall,” Option A is enough; Option B useful if you want per-link revocation or limits.

**Recommendation**: Start with Option A (token = signed Clerk org id + exp [+ jti]). Add Option B later if you need per-link revoke or use limits.

### 4.5 Tampering and Enumeration

- **Tampering**: Signature covers full payload; change of `o` or `exp` breaks verification. Use a server-side secret (e.g. Convex env `JOIN_LINK_SECRET`) only for signing/verification.
- **Enumeration**: Use Clerk org id (UUID) in payload so tokens are not guessable. Do not use sequential ids. Rate-limit join endpoint by user and/or IP.

---

## 5. Deep Link Structure

### 5.1 URL Format

- **Universal Link (HTTPS, preferred)**  
  `https://app.yourdomain.com/join/<signed_token>`  
  Example: `https://app.yourdomain.com/join/eyJvIjoib3JnX...}.sig`

- **Custom scheme (fallback)**  
  `mat-app://join/<signed_token>`

- **Web fallback (same URL)**  
  When app not installed, same URL opens in browser; server serves join page that shows gym and app download, and preserves intent (e.g. “Open in app” button that re-opens same URL so app can capture it after install).

### 5.2 Why Token Must Be Signed

- So the backend can trust that the “join this org” request was issued by us and not modified. Client cannot create or alter a valid token without the secret. Expiry and (if used) one-time use are enforced server-side.

### 5.3 Domain and Expo / EAS

- **Domain**: Use a dedicated subdomain (e.g. `app.yourdomain.com`) for Universal Links and web fallback. Host the join page and (if needed) redirects there.
- **iOS**: `apple-app-site-association` (AASA) at `https://app.yourdomain.com/.well-known/apple-app-site-association` with `applinks` for `app.yourdomain.com` and path prefix `/join`.
- **Android**: `assetlinks.json` for Android App Links (same domain).
- **Expo**: In `app.json` / `app.config.*`: set `scheme: "mat-app"` (already present); add `ios.associatedDomains: ["applinks:app.yourdomain.com"]` and Android intent filters for the HTTPS URL. EAS Build will package these.

### 5.4 Expo Linking Configuration

- Use `expo-linking`: `Linking.getInitialURL()` on cold start, `Linking.addEventListener('url', ...)` for in-app opens. Parse path: `/join/<token>`, extract token, store as pending join (token only). Do not pass token in query params for join authority; path is enough and avoids log/leak via referrer.

---

## 6. Mobile Flow (Text Diagram)

1. **User scans QR**  
   → URL: `https://app.yourdomain.com/join/<signed_token>` (or `mat-app://join/<token>`).

2. **Device: app installed**  
   - OS opens app with URL (cold start or background).  
   - App: `getInitialURL()` or `url` event → parse `/join/<token>`, persist “pending join” = `{ token }` (e.g. SecureStore or in-memory + disk).  
   - If not authenticated → redirect to sign-in (existing flow).  
   - After auth: if `convexUser`/membership not ready, wait; then if there is a pending join token, fetch org preview (Convex query or mutation that only validates token and returns public org name).

3. **Device: app not installed**  
   - Browser opens `https://app.yourdomain.com/join/<signed_token>`.  
   - Server (Next.js or Convex HTTP): validate token, load org name, return HTML with gym branding + “Download app” (App Store / Play Store).  
   - “Open in app” can be same URL as link (user installs, later opens same link from email/saved or re-scans); or optional short-lived cookie that redirects to `mat-app://join/<token>` when app is installed (no trust for auth).

4. **After install (deferred)**  
   - User installs and opens app (via icon or via same link).  
   - If opened via link: same as (2)—capture token, store, auth, then confirm.  
   - If opened without link: no pending join; normal home or org selection.

5. **Confirmation screen**  
   - When: authenticated, Convex user/membership ready, and pending join token exists.  
   - Show: “Do you want to join Gym X?” (name from backend).  
   - Actions: “Join” → call `joinGymByToken({ token })`; “Cancel” → clear pending join.  
   - If user already has orgs: same copy; do not auto-switch active org after join.

6. **Backend join**  
   - Mutation `joinGymByToken({ token })`: verify signature, expiry, load org by `o`, ensure user not already member (optional; Clerk create is idempotent), then **Convex action** calls Clerk Backend API to create organization membership for current user (role “member”).  
   - Webhook syncs to Convex.  
   - Return success (and optionally updated org list).  
   - Consume or mark token used if one-time (optional).

7. **After join**  
   - If user had no orgs: they now have one; existing logic can auto-select or send to select-organization.  
   - If user had orgs: stay on current org; new gym appears in org list for next time they choose.

---

## 7. Backend Contract

### 7.1 Token Verification (Query or Mutation)

- **Input**: `{ token: string }` (from client; never `gymId`/`orgId` from client for join decision).
- **Behavior**: Verify HMAC, parse payload, check `exp`, resolve `o` to Convex org (and Clerk org id). If invalid/expired → throw or return error code. If valid → return public org info for confirmation: `{ name: string, logoUrl?: string }` (and optionally `alreadyMember: boolean`).
- **Idempotent**: No state change; safe to call multiple times for “preview.”

### 7.2 Join Mutation

- **Name**: e.g. `joinGymByToken`.
- **Input**: `{ token: string }`. No `gymId`/`orgId` from client.
- **Auth**: Required (Clerk JWT); identity = current user.
- **Steps**:
  1. Verify signature and expiry; parse `o` (Clerk org id).
  2. Load Convex org by `externalId === o`; if missing → “Gym not found” / “Link invalid.”
  3. Optional: check user not banned (if you add ban list).
  4. Optional: if one-time token, check `jti` not already used; then mark used.
  5. Call **internal Convex action** with `clerkUserId`, `clerkOrgId`, role `member`. Action uses `CLERK_SECRET_KEY` (Convex env) and `fetch` to Clerk: `POST /v1/organizations/:id/memberships` (or equivalent) to create membership.
  6. Return success and optionally list of orgs (from Convex after webhook, or from Clerk response). Do not create `organizationMemberships` in Convex directly; Clerk + webhook do that.
- **Idempotency**: If Clerk returns “already member,” treat as success. No duplicate membership.
- **Errors**: Invalid/expired token, org not found, Clerk API error (e.g. user banned), network failure — return clear codes; do not leak internals.

### 7.3 Clerk API Usage

- Convex **action** (not mutation) must call Clerk: `POST https://api.clerk.com/v1/organizations/{orgId}/memberships` with body `{ user_id: clerkUserId, role: "org:member" }`. Requires `CLERK_SECRET_KEY` in Convex environment. After success, Clerk sends `organizationMembership.created` webhook; existing Convex webhook handler upserts `organizationMemberships`. No Convex-only insert for this flow.

### 7.4 Prevention Summary

- **Bypass**: Join only via this mutation; no other public mutation that adds membership by client-supplied org id.
- **Client org injection**: Org id comes only from verified token payload, never from request body/query.
- **Idempotency**: Clerk create membership + “already member” handling; optional `jti` for one-time tokens.

---

## 8. Failure Handling Strategy

| Scenario | Behavior |
|----------|----------|
| **Invalid token** | Do not show “Join Gym X.” Show “Invalid link” (or generic message); clear pending join. |
| **Expired token** | Same; “This link has expired.” Clear pending join. |
| **Gym deleted** | Backend returns “Gym no longer available.” Show that; clear pending join. |
| **User banned** | If you add ban list: backend returns “Cannot join this gym.” Do not call Clerk. |
| **Network failure** | Retry once; then “Could not complete. Try again later.” Keep pending join so user can retry. |
| **Token replay (one-time)** | If using `jti`: “This link was already used.” Clear pending join. |
| **Clerk session expired** | Convex returns 401; app re-prompts auth; keep pending join and resume after re-auth. |
| **Clerk API error** | Map to user message (“Could not add you to this gym”); log for ops. Do not create Convex membership without Clerk success. |

---

## 9. Test Matrix

| # | Scenario | App state | Auth | Expectation |
|---|----------|------------|------|-------------|
| 1 | Open join link | Installed | Logged in, 0 orgs | Capture token; after load show confirm “Join Gym X?”; on confirm, join and then org selection or home. |
| 2 | Open join link | Installed | Logged in, N orgs | Same confirm; on confirm, add gym, stay on current org; new gym in list. |
| 3 | Open join link | Installed | Logged out | Capture token; redirect to sign-in; after login show confirm; on confirm join. |
| 4 | Open join link | Not installed | — | Web fallback: gym page + download buttons; no join until app installed and link opened again (or same URL in app). |
| 5 | Confirm join | — | Logged in | Already member of that org | Idempotent success; “You’re already a member.” |
| 6 | Removed member scans again | — | Logged in | Backend allows (or not if banned); if allowed, Clerk create re-adds. |
| 7 | Network offline at confirm | — | — | Retry; then error message; pending join kept. |
| 8 | Token tampered | — | — | Signature invalid; “Invalid link.” |
| 9 | Token expired | — | — | “Link expired.” Clear pending. |
| 10 | Cold start with link | Installed, killed | — | getInitialURL() captures link; store; auth then confirm. |
| 11 | Background + link | Installed, background | — | url event captures; store; if already auth’d, show confirm when app foregrounded (or on next nav). |
| 12 | Cancel confirmation | — | — | Pending join cleared; no API call. |

---

## 10. Rollout Plan

### 10.1 Backend Preparation

1. Add Convex env: `JOIN_LINK_SECRET` (HMAC key), `CLERK_SECRET_KEY` (if not already) for action.
2. Implement token generation (internal): payload `{ o, exp [, jti] }`, sign with `JOIN_LINK_SECRET`; expose via admin-only Convex action or script for generating QR payloads.
3. Implement token verification (query or mutation): verify signature, exp, return org preview.
4. Implement `joinGymByToken` mutation + internal action that calls Clerk to create membership. Add rate limit (e.g. per user).
5. Deploy Convex; test with Postman/curl (authenticated) and verify webhook sync.

### 10.2 Web Fallback

1. Route `https://app.yourdomain.com/join/[token]`: validate token, load org name, return HTML (gym name, logo, App Store / Play Store links). Optionally set cookie for “open in app” redirect (same URL).
2. Ensure AASA and assetlinks point to this domain for `/join/*`.

### 10.3 App Linking Configuration

1. Expo: confirm `scheme: "mat-app"`; add `ios.associatedDomains`, Android intent filters for `https://app.yourdomain.com/join`.
2. EAS Build: build with correct entitlements/domains.
3. In app: `getInitialURL` + `addEventListener('url')`; parse `/join/<token>`, store in SecureStore (or equivalent); clear after consume or on expiry.

### 10.4 Secure Token Rollout

1. Generate tokens per gym (Clerk org id + long expiry). Print QR pointing to `https://app.yourdomain.com/join/<token>`.
2. Do not expose token generation to client; only backend or admin tool.

### 10.5 QA Checklist

- [ ] Cold start with join link (signed in / signed out).
- [ ] Background open with join link.
- [ ] Install from web fallback then open same URL in app.
- [ ] Confirm join (new user; existing user with other orgs).
- [ ] Already member: idempotent success.
- [ ] Invalid/expired/tampered token: no join, clear message.
- [ ] Cancel confirmation: no join.
- [ ] No `gymId`/`orgId` in client join request (inspect network).
- [ ] After join, Convex and Clerk show same membership (no desync).

### 10.6 Production Validation

- [ ] AASA and assetlinks reachable and correct.
- [ ] Join endpoint rate-limited and logged.
- [ ] Secrets only in Convex env / server; never in client.
- [ ] Clerk webhook processing and Convex sync verified after join.

---

## Summary of Security Rules (Mandatory)

- **Never trust `gymId`/`orgId` from client** for join; only from verified token payload.
- **Never trust query/path for authorization** without server-side signature verification.
- **Never auto-join** without explicit user confirmation.
- **All membership changes** via Clerk API; Convex reflects via webhook only.
- **Org membership** for access control derived from backend (Clerk + Convex); client only displays.

This design keeps the QR public and permanent while preventing org injection, tampering, and replay, and preserves Clerk/Convex sync and multi-org behavior.
