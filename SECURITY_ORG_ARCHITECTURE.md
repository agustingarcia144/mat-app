# Secure Organization Architecture (Clerk + Convex + Next.js)

This document defines a production-grade, invite-only, Clerk-centric organization model for the gym SaaS platform.

## 1) Recommended architecture

### Core principles

- **Clerk is source of truth** for organizations, memberships, and roles.
- **Convex is an authorization/cache mirror**, never an authority for identity ownership.
- **Frontend is untrusted**; all security decisions happen server-side (Convex/Next API).
- **Org context must be explicit and deterministic** (no implicit "first membership wins").
- **Least privilege by default** (`member` baseline; privileged operations require server-verified staff/admin role).

### Runtime components

- **Clerk**
  - AuthN
  - Organizations, memberships, invitations, roles
- **Next.js App Router**
  - UI
  - Middleware route gating
  - Secure server API routes for controlled Clerk mutations
- **Convex**
  - Domain data and business logic
  - Webhook ingestion from Clerk with idempotency + replay checks
  - Authorization guardrails on every query/mutation

### Trust boundaries

- Browser -> Next/Convex: untrusted payloads
- Next/Convex -> Clerk backend API: trusted server credentials only
- Clerk webhooks -> Convex HTTP route: signed payload + dedupe ledger

---

## 2) Secure onboarding flow (invite-only)

### Desired flow

1. Internal admin pre-creates organization in Clerk.
2. Admin sends Clerk organization invitation to target email with assigned role.
3. Invitee opens invite URL, signs up/signs in through Clerk.
4. Clerk creates membership.
5. Clerk webhook syncs organization/membership to Convex.
6. User selects active organization (if multi-org), then accesses app.

### Controls

- Public sign-up UI is blocked unless invitation ticket is present.
- Dashboard access requires:
  - authenticated session
  - active organization context
  - active membership in Convex for org-scoped data
- Users with no memberships are denied org data access.

---

## 3) Organization lifecycle flow

### Create

- Only internal/admin backoffice creates orgs in Clerk.
- Convex receives `organization.created` and upserts mirror record by `externalId`.

### Update

- Org updates are allowed only through secure server endpoint.
- Server verifies authenticated admin role for active org.
- Only safe fields are mutable (`name`, controlled metadata fields).
- Clerk update triggers webhook -> Convex sync.

### Delete

- Deletion is **not exposed in client UI**.
- If organization is deleted in Clerk by internal operations:
  - webhook removes mirrored org and memberships in Convex.

---

## 4) Membership lifecycle flow

### Invite

- Admin sends invitation in Clerk.
- Role selected at invitation time (`admin`, `trainer`, `member` mapping policy).

### Accept

- Invitee signs up/signs in via invitation link.
- Membership becomes active in Clerk.
- Webhook `organizationMembership.created` upserts Convex membership.

### Role changes

- Role changes happen in Clerk/admin backend only.
- Webhook `organizationMembership.updated` patches role in Convex mirror.

### Removal

- Membership removals in Clerk emit webhook deletion event.
- Convex membership is deleted by membership id (or fallback org+user pair).

---

## 5) Convex schema alignment strategy

### Key tables

- `organizations.externalId` -> Clerk org ID
- `organizationMemberships.externalMembershipId` -> Clerk membership ID (optional for backward compatibility)
- `users.activeOrganizationExternalId` -> selected org context fallback
- `webhookEvents` -> idempotency/replay/failure ledger

### Consistency contract

- Convex auth checks always validate membership per organization.
- Role checks derive from mirrored Clerk role data.
- Active org resolution priority:
  1. Clerk active org claim in token
  2. persisted `users.activeOrganizationExternalId`
  3. only if exactly one active membership exists

---

## 6) Clerk configuration adjustments required

1. **Disable self-service org creation**
   - Turn off public organization creation in Clerk dashboard.
2. **Invite-only access policy**
   - Keep invitation flow enabled.
   - Restrict open sign-up patterns as needed in Clerk settings.
3. **Webhook subscriptions**
   - `user.created|updated|deleted`
   - `organization.created|updated|deleted`
   - `organizationMembership.created|updated|deleted`
4. **JWT template**
   - Ensure active organization claims are present for org context (`org_id`, role).
5. **Session controls**
   - Enforce MFA/session duration policies for admins.

---

## 7) Secure dialog implementation strategy

### Edit Organization dialog

- UI: custom ShadCN dialog in dashboard.
- API: `PATCH /api/secure/organization`
  - requires authenticated user + active org + admin role
  - validates payload server-side
  - updates Clerk organization via server credentials
  - no deletion exposed
  - Convex sync via webhook

### User Profile dialog

- UI: custom ShadCN dialog in dashboard.
- API: `PATCH /api/secure/profile`
  - requires authenticated user
  - only safe personal fields
  - no role/org membership fields accepted
  - Convex sync via user webhook

---

## 8) RBAC permission matrix (backend-enforced)

| Capability | admin | trainer | member |
|---|---:|---:|---:|
| View org-scoped data | ✅ | ✅ | ✅ |
| Edit organization profile | ✅ | ❌ | ❌ |
| Invite members | ✅ | (optional) ❌ by default | ❌ |
| Assign member roles | ✅ | ❌ | ❌ |
| Edit training plans/classes | ✅ | ✅ | ❌ |
| Self profile edit | ✅ | ✅ | ✅ |
| Delete organization | ❌ (client) | ❌ | ❌ |

### Safety invariants

- Prevent last-admin removal/demotion:
  - before role downgrade/removal, count active admins in org; block if count == 1.
- Prevent self-lockout:
  - admins cannot demote themselves if they are last admin.
- Multi-admin orgs:
  - role changes require admin privileges, audited, and validated against minimum-admin invariant.

---

## 9) Threat model & hardening

### Attack surface

- Sign-up and invite acceptance endpoints
- Clerk webhook endpoint
- Convex queries/mutations with org identifiers
- Active organization switching
- Role/membership update actions

### Major risks and mitigations

1. **Unauthorized org creation**
   - Mitigation: disable public org creation in Clerk + remove client UI pathways.
2. **Privilege escalation (member -> staff/admin)**
   - Mitigation: server-side role checks for all privileged mutations.
3. **Membership spoofing/cross-org access**
   - Mitigation: require org membership per query/mutation; never trust frontend org claims.
4. **Webhook replay/duplicate processing**
   - Mitigation: Svix signature validation + timestamp freshness + `webhookEvents` dedupe ledger.
5. **State drift Clerk vs Convex**
   - Mitigation: idempotent upserts/deletes, processed-event ledger, retry-safe handlers.
6. **Org hijacking by active-org confusion**
   - Mitigation: explicit active org resolution and forced selection for multi-org users.
7. **Cross-org data leakage by direct ID lookup**
   - Mitigation: org membership validation before returning any entity by ID.

### Defensive coding patterns

- Validate all mutation input server-side
- Deny by default
- Never authorize based on client role/org payload
- Use immutable audit records for webhook processing state

---

## 10) Edge case matrix

| Scenario | Expected behavior |
|---|---|
| User signs up without invitation | Blocked from usable sign-up flow; no org access |
| User has 0 org memberships | Redirect to org selection/no-access state |
| User has 1 org | Auto-select org context |
| User has multiple orgs, no active org selected | Force org selection before dashboard |
| Membership deleted while session alive | Next authorized call fails org membership checks |
| Role downgraded mid-session | Privileged mutations denied immediately after webhook sync |
| Duplicate webhook delivery | Event deduped by `svixId` ledger |
| Out-of-window webhook replay | Rejected by timestamp freshness check |
| Convex miss during transient webhook failure | Retry uses idempotent upsert/delete path |

---

## 11) Migration plan from current implementation

1. **Deploy backend guardrails first**
   - Convex permission hardening
   - webhook idempotency ledger
2. **Enable secure org selection path**
   - middleware gate + select organization page
3. **Roll out custom dialogs**
   - organization/profile backend routes
   - remove default Clerk modal surfaces
4. **Disable public org creation in Clerk dashboard**
5. **Backfill and verify data**
   - confirm `externalId` mappings
   - verify memberships synced for all active users
6. **Run security regression suite**
   - cross-org read/write attempts
   - role escalation attempts
   - stale webhook replay attempts

---

## 12) Stripe integration compatibility strategy

Design billing around **organization as tenant**:

- Add billing table keyed by `organization.externalId` (or Convex org `_id` + external link).
- Stripe customer/subscription maps 1:1 with gym organization.
- Webhooks from Stripe update billing state in Convex.
- Access policy extension:
  - paid status required for premium features (soft/hard gates per plan).
- Keep Clerk as membership authority and Stripe as billing authority; Convex composes both for authorization decisions.

---

## 13) Operational recommendations

- Add audit logs for:
  - org updates
  - role changes
  - invitation sends/revocations
- Add alerts on webhook failures/backlog.
- Periodically reconcile Clerk->Convex membership counts.
- Add automated tests for:
  - last-admin protection
  - cross-org access denial
  - idempotent webhook replay handling

