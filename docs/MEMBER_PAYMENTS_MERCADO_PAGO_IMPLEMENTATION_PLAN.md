# Member Payments and Mercado Pago — Implementation Plan

Status: in progress — steps 0–14 built. Outstanding: step 12 device testing and step 15 sandbox E2E + rollout, both of which need real Mercado Pago test accounts.  
Last updated: 2026-08-28

## Progress log

| Step | Status | Date | Notes |
| --- | --- | --- | --- |
| 0 — Baseline | done | 2026-08-28 | Vitest + `convex-test` harness, provider fixtures, fake transport, kill switch, env docs. |
| 1 — Billing domain | done | 2026-08-28 | `billingDomain.ts` extracted and unit-tested; join-date advance coverage bug fixed. |
| 2 — Schema & policy | done | 2026-08-28 | 8 new tables, settings/entitlement policy, deletion cleanup, super-admin policy mutation. |
| 3 — Connection OAuth | done | 2026-08-28 | OAuth connect/callback/refresh/health/guarded disconnect, AES-256-GCM credential encryption, per-connection webhook routing key. 31 tests. |
| 4 — Provider client & outbox | done | 2026-08-28 | Typed adapter (preapproval/authorized payment/preference/payment/resource fetch), one-shot auth refresh, error classification, outbox worker with bounded backoff. 62 tests. Lost-response recovery by external reference is in place; the checkout half of that exit criterion lands with step 6. |
| 5 — Webhooks & reconciliation | done | 2026-08-28 | Per-connection notification route, signature + freshness verification, dedup ledger, correct subscription-topic dispatch, ownership/amount invariants, one idempotent transition mutation, reconciliation worker. 37 tests. |
| 6 — Recurring checkout | done | 2026-08-28 | Eligibility query with per-method reasons, server-computed amounts, local rows before the provider call, lost-response recovery by external reference, first-approved-payment activation of the whole family group, commission snapshot. 32 tests. |
| 7 — Renewal / grace / recovery | done | 2026-08-28 | Fixed grace anchored to the first failure (clamped to the cycle), hourly expiry worker, family-group suspension and recovery, legacy `autoSuspendUnpaid` excludes provider-managed subscriptions, refund/chargeback policy with compensating ledger entries. 20 tests. |
| 8 — Advance payments | done | 2026-08-28 | One-time Mercado Pago checkout with conditional split fee, anchored 3/6/12-cycle coverage starting at the first unpaid month, grouped bank-transfer proof/review/decline. 24 tests. Fixed a pre-existing bug that stored every advance transfer month at an amount of 0. |
| 9 — Family & bonifications | done | 2026-08-28 | Family add/remove and bonification create/edit/revoke enqueue next-cycle amount changes through the outbox; full bonification pauses, revoke re-amounts then resumes; resume that would charge early is abandoned and re-authorized. 16 tests. |
| 10 — Cancellation & method change | done | 2026-08-28 | Disclosed `accessEndsAt` before confirmation, debits stopped immediately, family group retired atomically on the disclosed date, staff cancellation stops the debit too, transfer↔recurring switching with a deferred first debit. 20 tests. |
| 11 — Web admin UI | done | 2026-08-28 | Member Payments settings section (connection health, connect/reconnect/guarded disconnect, method toggles, grace days), a Mercado Pago tab on Pagos (agreements, operations with retry, transactions with gross/fees/net), plan-form recurring eligibility notice. 16 permission tests. |
| 12 — Mobile member flow | built, **device testing outstanding** | 2026-08-28 | Method/term sheet replaces direct activation, `expo-web-browser` checkout, `/payments/return` screen (navigation only), universal + custom-scheme deep links, recurring status card, disclosed-date cancellation, transfer switch, unified history, proof upload restricted to transfers, gate blocks `pending_payment` and allows grace. **Not yet verified on real iOS/Android builds.** |
| 13 — Commission settlement | done | 2026-08-28 | Idempotent monthly settlement over closed months only, deterministic settlement reference, recurring charges forced to monthly invoicing, split fees recorded as already collected, super-admin settlement report. 15 tests. |
| 14 — Notifications & observability | done | 2026-08-28 | Member push for approved/failed/grace-ending/suspended/recovered/amount-change/cancellation/abandoned-checkout, admin alerts for broken connections, parked operations, amount mismatches and reversals, structured allowlisted logging, org metrics query, support runbook. 17 tests. |
| 15 — E2E QA & rollout | not started | | |

### Deviations from the written plan

1. **`memberPaymentsNode.ts` -> `memberPaymentsActions.ts`** (step 3). The Node
   runtime is not needed: AES-256-GCM comes from Web Crypto and Mercado Pago is
   reached with `fetch`, both available in the Convex default runtime — the same
   runtime the existing SaaS billing integration already uses. The separation
   the plan asked for is preserved: credentials and external calls live only in
   that module. OAuth request/response shaping is further split into
   `memberPaymentsOAuth.ts` so it can be tested against the fake transport.
2. **`memberPaymentWebhooks.ts` -> `memberPaymentsHttp.ts`** (step 3). One module
   holds the member-payment HTTP entry points; the OAuth callback lives there
   now and the webhook handler will join it in step 5.
3. **Grace-expiry and scheduled-cancellation cron jobs move to steps 7 and 10.**
   Step 5 asks for them alongside the reconciliation jobs, but the logic they
   would drive does not exist until those steps. Token refresh, provider
   operations and reconciliation are scheduled now; the other two are added
   with the flows that own them, so no cron ever runs against absent rules.
4. **Admin alerts for reversals are recorded, not yet delivered.** Step 7 asks
   for an admin alert on a historical reversal. The condition is persisted now
   as `memberPaymentTransactions.requiresAttention` / `attentionReason`, which
   the step 11 admin views surface; the push/email channel is step 14's job.
5. **Manual pause/resume is not exposed to admins** (step 11). Those states
   belong to the bonification lifecycle: an agreement paused by hand would sit
   in `paused_bonification` with no bonification to explain it, and the next
   family or price change would silently resume it. Admins get resync, retry
   and cancel, which cover the same support needs without that inconsistency.
6. **Test-support files use double-dotted names** (`mercadoPago.fake.ts`,
   `mercadoPago.fixtures.ts`). Convex's bundler skips entry points containing
   more than one dot, so these sit beside the code they support without ever
   being uploaded to a deployment.

### Verification baseline (recorded before any feature work)

| Command | Baseline result |
| --- | --- |
| `pnpm --filter web lint` | **fails**: 5 pre-existing errors, 7 warnings (`metrics/exercises/page.tsx` setState-in-effect; `<img>` and react-hook-form compiler warnings). Feature work must not add to this list. |
| `pnpm --filter web build` | passes |
| `pnpm --filter mobile lint` | passes (1 pre-existing unused-var warning) |
| `pnpm --filter mobile exec tsc --noEmit` | passes |
| `pnpm convex:codegen` | passes |
| `pnpm --filter @repo/convex test` | did not exist; added in step 0 |

## 1. Objective

Add member-to-gym payments to MAT while preserving the current gym-to-MAT SaaS
billing integration.

The completed feature must allow:

- Each gym to connect and receive money in its own Mercado Pago account.
- Gym administrators to enable bank transfer, Mercado Pago, or both from the
  web app.
- Members to select plans, pay, manage automatic debit, see payment status,
  and cancel from `apps/mobile` only.
- Mercado Pago recurring payments only for plans billed from the member's
  join date.
- One-time Mercado Pago or bank-transfer payments for 3, 6, and 12 months in
  advance.
- Family plans and full or partial bonifications.
- A configurable MAT transaction commission for plans such as PRO and no
  commission for a future ULTRA plan.
- Automatic retries, grace periods, suspension, recovery, reconciliation, and
  an auditable payment history.

This document is the implementation checklist and acceptance contract. An
implementation agent should complete the steps in order and must not mark a
step complete until its exit criteria pass.

## 2. Fixed product decisions

These decisions are already settled and should not be reopened during normal
implementation:

1. Each organization connects a different Mercado Pago seller account through
   OAuth. Member funds go directly to that gym.
2. Member payment UI lives only in `apps/mobile`. Do not add member checkout to
   the web app or `apps/mobile-admin`.
3. Gym payment configuration and operational tools live in `apps/web`.
4. A gym can enable bank transfer, Mercado Pago, or both.
5. A Mercado Pago browser return is never proof of payment. Only a server-side
   fetch of the provider resource can change financial or access state.
6. A recurring agreement being `authorized` is not sufficient to grant paid
   access. The first underlying payment must be `approved`.
7. A renewal failure retains access until the gym's configured grace deadline.
   Repeated provider retries must not extend that original deadline.
8. Mercado Pago recurrence is offered only when the plan uses
   `billingMode: "join_date"`.
9. Calendar-billed plans can still use transfer and one-time advance payments,
   but not Mercado Pago recurrence in v1.
10. Family composition is administered on the web. The designated family
    payer completes all payment actions in mobile.
11. Family-size, plan-price, and partial-bonification changes affect the next
    billing cycle. Do not prorate or charge a mid-cycle difference.
12. A full bonification pauses automatic debit. Removing it schedules the new
    amount and resumption for the next cycle.
13. A voluntary cancellation stops future Mercado Pago debits immediately.
    Local access ends at the current paid coverage end plus the configured
    grace period. Show that exact date before confirmation.
14. Advance payments are one-time purchases, never recurring agreements.
15. All money is calculated on the server and stored as integer ARS amounts.
16. Existing bank-transfer data and behavior must remain backward compatible.
17. Existing organization-to-MAT billing tables, token, checkout, and webhook
    route remain logically separate.

### V1 compatibility rule for late fees

Do not offer Mercado Pago recurring debit for a plan with `interestTiers`.
Provider retries use the agreed recurring amount and do not safely model MAT's
cumulative late-fee rules. The plan editor must explain the incompatibility.
One-time and transfer flows may continue using late fees.

## 3. Remaining launch configuration

These values must be configurable so their final business values do not block
development:

- PRO commission in basis points (`platformFeeBps`). Seed it as `0` until MAT
  approves the commercial percentage.
- Commission collection mode:
  - `none`
  - `marketplace_split`
  - `monthly_gym_invoice`
- Commission basis: use the gross approved member payment in v1.
- Initial payment grace: default to no access before the first approved
  payment. Do not reuse renewal grace for initial activation.

Before production commission collection is enabled, MAT must confirm the tax
and commercial treatment and obtain any Mercado Pago marketplace approval that
is required. Current provider documentation does not expose a split-fee field
on recurring `/preapproval` charges, so the safe fallback for recurring
payments is `monthly_gym_invoice`.

## 4. Source-of-truth and state model

Keep these concepts separate:

| Concern                                  | Source of truth                                              |
| ---------------------------------------- | ------------------------------------------------------------ |
| Provider authorization and charge result | Mercado Pago resource fetched by the backend                 |
| Gym access                               | `memberPlanSubscriptions` plus verified coverage/grace dates |
| Recurring billing lifecycle              | `memberRecurringAgreements`                                  |
| Monthly amount owed/paid                 | `planPayments`                                               |
| Individual provider attempts             | `memberPaymentTransactions`                                  |
| MAT commission settlement                | `platformCommissionLedger`                                   |
| Mobile return screen                     | Navigation only; never authoritative                         |

### Local subscription states

Extend `memberPlanSubscriptions.status` with `pending_payment`:

- `pending_payment`: plan chosen, but no approved first payment.
- `active`: member has access, including while a renewal is inside grace.
- `suspended`: grace ended without payment.
- `cancelled`: access ended permanently for this subscription.

Add these optional fields:

- `billingAnchorAt`
- `accessEndsAt`
- `cancellationRequestedAt`
- `paymentMode`: `manual`, `mercadopago_recurring`, or
  `mercadopago_one_time`

Keep provider states out of this status union. They belong on the recurring
agreement or transaction.

### Recurring agreement states

Use:

- `pending_authorization`
- `pending_first_payment`
- `active`
- `retrying`
- `paused_bonification`
- `cancellation_scheduled`
- `cancelled`
- `failed`

Required transitions:

| Event                  | Agreement result         | Subscription/access result           |
| ---------------------- | ------------------------ | ------------------------------------ |
| Checkout created       | `pending_authorization`  | `pending_payment`                    |
| Preapproval authorized | `pending_first_payment`  | Still no access                      |
| First payment approved | `active`                 | Activate whole family group          |
| Renewal approved       | `active`                 | Keep/reactivate access; clear grace  |
| Renewal rejected       | `retrying`               | Keep access until fixed `graceUntil` |
| Grace expires unpaid   | `retrying` or `failed`   | Suspend whole family group           |
| Retry approved         | `active`                 | Reactivate whole family group        |
| Full bonification      | `paused_bonification`    | Keep access                          |
| Voluntary cancel       | `cancellation_scheduled` | Keep access until `accessEndsAt`     |
| Access end reached     | `cancelled`              | Cancel whole family group            |

Out-of-order or duplicate events must never regress an approved payment to a
pending/rejected state or create a duplicate monthly payment.

## 5. Target backend data model

Implement schema changes in
`packages/convex/convex/schema.ts`. Make new fields optional where necessary so
the deployment is backward compatible.

### Extend `organizationSettings`

Add an optional `memberPayments` object:

- `bankTransferEnabled: boolean` — legacy default `true`
- `mercadoPagoRecurringEnabled: boolean` — default `false`
- `mercadoPagoOneTimeEnabled: boolean` — default `false`
- `gracePeriodDays: number` — integer, bounded to an agreed safe range
- `initialPaymentRequiresApproval: boolean` — default `true` for Mercado Pago

Return defaults from `organizationSettings.get`; do not require an immediate
backfill.

### Extend `appBillingPlans.entitlements`

Add an optional `memberPayments` policy:

- `mercadoPagoEnabled: boolean`
- `platformFeeBps: number`
- `feeCollectionMode: "none" | "marketplace_split" | "monthly_gym_invoice"`

Existing plans without this object behave as Mercado Pago disabled with zero
commission. Add super-admin-safe mutations to change this policy. Do not branch
on plan names in member payment code. A future ULTRA plan uses `0` basis points
and `none` without requiring code changes.

### Add `organizationPaymentProviderConnections`

Store one row per organization/provider:

- Organization and provider (`mercadopago`)
- Connection status: `pending`, `active`, `refresh_required`, `error`, or
  `disconnected`
- Mercado Pago seller/user id and non-sensitive display metadata
- Encrypted access token and refresh token, IV/nonce, and encryption key version
- Access-token expiry and refresh timestamps
- Random `webhookRoutingKey`
- Connected/disconnected actor and timestamps
- Last health check and sanitized error

Indexes:

- organization + provider
- provider account id
- webhook routing key
- connection status

Enforce one active connection per organization/provider in mutations.

### Add `paymentProviderOAuthStates`

Store only a hash of the random OAuth state:

- State hash, organization, provider, initiating administrator
- Allowlisted return destination
- Expiry, consumed timestamp, creation timestamp

Indexes: state hash and expiry. States are single-use and expire after ten
minutes.

### Add `memberRecurringAgreements`

Store:

- Organization, provider connection, parent subscription, payer user
- Provider preapproval id and MAT external reference
- Agreement status and latest payment status/detail
- Amount, currency, family-member count snapshot, and billing anchor
- Current period start/end and next charge timestamp
- First failure timestamp and fixed `graceUntil`
- Pending next-cycle amount and effective timestamp
- Latest authorized-payment id
- Cancellation request and provider cancellation timestamps
- Created/updated timestamps

Indexes:

- organization
- subscription
- provider preapproval id
- external reference
- status + next charge
- grace deadline

Only the family parent subscription can own an agreement.

### Add `memberPaymentCheckoutSessions`

Use this for idempotent recurring setup and one-time checkout creation:

- Organization, user, plan, optional subscription/agreement
- Kind: `recurring_setup` or `advance_purchase`
- Months, amount, currency, payment method
- Provider preference/preapproval id and external reference
- Persisted provider idempotency key
- Status: `created`, `opened`, `processing`, `approved`, `failed`, `expired`,
  or `cancelled`
- Expiry and timestamps

Indexes: user/status, external reference, provider resource id, and idempotency
key.

### Add `memberPaymentTransactions`

Record every provider charge attempt:

- Organization, connection, payer, subscription/agreement/session
- Optional `planPaymentId`
- Kind: `recurring` or `advance`
- Provider transaction id and authorized-payment id
- Status: `pending`, `approved`, `rejected`, `cancelled`, `refunded`,
  `charged_back`, or `unknown`
- Gross ARS, provider fee if supplied, platform fee snapshot, and net if known
- Provider status detail and payment timestamps
- Sanitized reconciliation metadata and timestamps

Indexes: provider transaction id, authorized-payment id, agreement, session,
organization/date, and status.

Never store card data or an unsanitized provider payload.

### Add `memberPaymentProviderOperations`

Use an outbox for durable external side effects:

- Operation: `update_amount`, `pause`, `resume`, `cancel`, or `resync`
- Target agreement/connection
- Idempotency key and sanitized input
- `executeAfter`
- Status, attempt count, last error, completion timestamp

All family, price, bonification, and cancellation mutations enqueue an
operation transactionally. A scheduled action performs the provider call and
records the result. This prevents a local mutation from being half-complete
when a network request fails.

### Add `paymentProviderWebhookEvents`

Use a new ledger for member payments; do not reuse the SaaS billing webhook
ledger:

- Provider, connection, provider event/request id, topic/action
- Resource type and id
- Payload hash, processing status, attempt count, sanitized error
- Received/processed timestamps

Deduplicate on a connection-scoped event key. Do not persist full webhook
payloads containing payer information.

### Add `platformCommissionLedger`

For each approved transaction, snapshot:

- Organization, MAT billing plan, transaction
- Gross ARS and fee basis
- `platformFeeBps` and calculated fee ARS
- Collection mode
- Status: `not_applicable`, `accrued`, `collected`, `waived`, or `failed`
- Provider fee id or organization-billing settlement reference
- Timestamps

A later gym plan change must not retroactively modify an existing ledger row.

### Extend `planPayments`

Add payment methods:

- `mercadopago_recurring`
- `mercadopago_checkout`

Add optional links and snapshots:

- `providerTransactionId`
- `checkoutSessionId`
- `advancePaymentGroupId`
- Gross, provider fee, MAT fee, and gym net amounts

Preserve all legacy validators and interpretations for rows without these
fields.

## 6. Security requirements

These are release blockers:

1. Use OAuth authorization code flow for each gym seller account.
2. Generate OAuth state with cryptographically secure randomness; store only
   its hash; validate expiry, one-time use, organization, actor, and return URL.
3. Encrypt access and refresh tokens with an environment-owned key. Tokens may
   only be read by internal backend functions and must never be returned to a
   client or written to logs.
4. Use `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, a fixed OAuth
   callback URL, `MEMBER_PAYMENTS_ENCRYPTION_KEY`, and a key-version variable.
5. Refresh tokens before expiry and retry once after an authentication failure.
   Prevent concurrent refreshes from overwriting newer credentials.
6. Give each connection a random webhook routing key and put it in that
   seller's notification URL. This selects the correct gym token without
   exposing an organization id.
7. Verify Mercado Pago's webhook signature and age before fetching or mutating
   anything.
8. Fetch the authoritative resource using the selected gym's token:
   - `subscription_preapproval` -> `/preapproval/{id}`
   - `subscription_authorized_payment` -> `/authorized_payments/{id}`
   - one-time `payment` -> `/v1/payments/{id}`
9. Verify fetched seller/account, external reference, organization,
   subscription, amount, and currency against local snapshots.
10. Use persisted idempotency keys for provider POST operations and idempotent
    internal finalization.
11. Never accept an amount, fee, organization id, payer id, or access decision
    from mobile.
12. Redact authorization headers, tokens, payer email, and raw payloads from
    logs and error messages.
13. Block account disconnection while live agreements exist. Disabling Mercado
    Pago prevents new checkouts but does not destroy credentials required to
    manage existing agreements.
14. Keep the existing `/mercadopago-webhook` and global SaaS token dedicated to
    organization-to-MAT billing. Add separate member-payment callback and
    webhook routes.

## 7. Implementation steps

### Step 0 — Establish the implementation baseline

Tasks:

- Preserve unrelated working-tree changes.
- Record the current build/lint results before editing.
- Add a backend test setup using Vitest and `convex-test`, compatible with the
  installed Convex version.
- Add pure provider fixtures and a fake Mercado Pago transport. Automated tests
  must never call the live API.
- Add a runtime kill switch `MEMBER_MP_PAYMENTS_ENABLED`, default `false`.
- Document sandbox and production environment variables without committing
  values.

Exit criteria:

- Baseline failures, if any, are documented separately from feature failures.
- Backend tests can run with one sample test.
- The kill switch is off by default.

### Step 1 — Extract and test billing-domain calculations

Tasks:

- Move duplicated cycle/date calculations from
  `memberPlanSubscriptions.ts` and `planPayments.ts` into a shared pure module.
- Add pure functions for:
  - Join-date billing cycles, including anchors on the 29th–31st
  - Family/bonification effective amount
  - Advance-payment coverage for 3, 6, and 12 anchored cycles
  - Grace deadline based on the original due/failure time
  - Cancellation access-end date
  - Basis-point commission rounding
- Preserve current calendar behavior.
- Fix advance-period generation so join-date plans use anchored cycles rather
  than calendar-month boundaries.

Exit criteria:

- Unit tests cover month-end, leap year, timezone, family, discount, grace, and
  rounding cases.
- Existing transfer calculations have no unintended snapshot changes.

### Step 2 — Add schema, defaults, and entitlement policy

Tasks:

- Implement all schema additions from section 5.
- Update `organizationSettings.get/update` with validation and legacy defaults.
- Update `appBillingPlans` seed/upsert logic and entitlement response.
- Seed LITE as Mercado Pago disabled.
- Seed PRO as configurable but with zero commission until the business value is
  approved.
- Add super-admin mutation(s) for policy changes.
- Add dry-run/backfill migrations only where optional-read defaults are
  insufficient.
- Include all new organization-owned tables in organization deletion cleanup.
- Run Convex code generation.

Exit criteria:

- Existing data validates without a destructive migration.
- Old organizations still see transfer enabled and Mercado Pago disabled.
- No client can query secrets.
- Schema/code generation and type checking pass.

### Step 3 — Implement Mercado Pago connection OAuth

Create dedicated member-payment modules rather than adding this to
`organizationBilling.ts`. Suggested files:

- `memberPayments.ts` — public queries/mutations and internal state writes
- `memberPaymentsNode.ts` — encrypted credentials and external API actions
- `memberPaymentDomain.ts` — pure calculations/state transition helpers
- `memberPaymentWebhooks.ts` — member webhook HTTP handler

Tasks:

- Add admin-only `beginMercadoPagoConnection`.
- Create and store a hashed, expiring OAuth state.
- Add a separate public OAuth callback route in `http.ts`.
- Exchange the callback code server-side and encrypt both tokens.
- Fetch seller identity and store only safe display fields.
- Redirect back to an allowlisted web settings result page.
- Add refresh, reconnect, health-check, disable, and guarded disconnect flows.
- Ensure a seller account cannot silently connect to multiple MAT gyms unless
  MAT explicitly permits it later.

Exit criteria:

- Success, denial, expired state, replayed state, wrong state, refresh failure,
  reconnect, and cross-organization tests pass.
- Tokens do not appear in logs, client responses, or query results.
- Two sandbox gyms can connect different seller accounts.

### Step 4 — Build the provider client and durable operation worker

Tasks:

- Implement a small typed Mercado Pago adapter for preapprovals, authorized
  payments, one-time preferences/payments, updates, pause/resume, cancel, and
  resource fetch.
- Centralize authentication refresh, timeouts, error sanitization, and retry
  rules.
- Send a persisted idempotency key on creation calls.
- Implement the provider-operation outbox worker with bounded exponential
  retry and terminal-error handling.
- Do not retry validation, permission, or known permanent provider errors.

Exit criteria:

- Fake-transport tests cover success, timeout after provider success, 401 then
  refresh, rate limit, permanent 4xx, 5xx, and duplicate execution.
- A lost action response cannot create a second agreement or checkout.

### Step 5 — Implement member-payment webhooks and reconciliation

Tasks:

- Add a separate member Mercado Pago notification URL containing the random
  connection routing key.
- Verify signature and timestamp before processing.
- Classify subscription topics correctly; do not map every topic containing
  `payment` to `/v1/payments`.
- Persist a processing ledger row before resource work.
- Fetch the correct resource with the gym connection token.
- Resolve local objects by provider id and external reference, then verify all
  ownership and amount invariants.
- Apply transitions through one idempotent internal mutation.
- Add a reconciliation action for stuck checkout sessions, due agreements,
  missing webhooks, and events left in `processing`.
- Add scheduled, paginated jobs for token refresh, reconciliation, provider
  operations, grace expiry, and scheduled cancellation.

Exit criteria:

- Duplicate, delayed, out-of-order, invalid-signature, wrong-seller,
  wrong-amount, unknown-resource, and replay tests pass.
- Webhook response is fast and safe to retry.
- Reconciliation repairs a deliberately missed webhook.

### Step 6 — Implement recurring checkout and first activation

Tasks:

- Add a query returning the payment methods currently available to the member,
  with human-readable reasons when a method is unavailable.
- Eligibility must require:
  - Runtime kill switch enabled
  - MAT billing-plan entitlement enabled
  - Gym Mercado Pago setting enabled
  - Active provider connection
  - Active membership plan with `join_date`
  - No interest tiers
  - Member is the payer/parent for a family group
- Add `startRecurringCheckout({ planId })`.
- Calculate amount from plan price, active family count, and current
  bonification entirely on the server.
- Create a pending local subscription/agreement/session before the API call.
- Create a no-associated-plan Mercado Pago preapproval using the gym token,
  connection-specific notification URL, external reference, and mobile return
  URL.
- Return only the checkout URL and local session id to mobile.
- Treat browser return as `processing`.
- On verified first approved payment:
  - Create/update the current `planPayments` row as approved
  - Create the transaction and commission snapshot
  - Activate the parent and all family child subscriptions
  - Reassign future fixed class slots using the existing helper
- Make repeated taps and finalization idempotent.

Exit criteria:

- Authorization without payment grants no access.
- First approval grants access once and records one payment.
- Closing checkout leaves a resumable/expirable pending session.
- A member cannot create two live recurring agreements.

### Step 7 — Implement renewal, grace, suspension, and recovery

Tasks:

- On each approved renewal, upsert exactly one `planPayments` row for the
  anchored billing cycle and create/update its provider transaction.
- On first failed attempt, set `firstFailureAt` and a fixed `graceUntil`.
- Keep the local subscription `active` during grace while exposing `retrying`
  billing state to clients.
- Do not let later retry notifications move `graceUntil` forward.
- At grace expiry, suspend the whole family group.
- On a later approved retry, reactivate the whole family group and restore
  future fixed-slot assignments.
- Exclude Mercado Pago recurring subscriptions from the legacy
  `autoSuspendUnpaid` path; the provider-aware grace worker owns them.
- Define refund/chargeback policy:
  - First/current-cycle reversal removes verified coverage and suspends unless
    another approved payment covers it.
  - Historical reversal creates an admin alert and ledger adjustment without
    silently rewriting later paid periods.

Exit criteria:

- Automated tests cover provider retry sequences and exact grace boundaries.
- The existing hourly suspension cron cannot race and suspend a retrying
  provider-managed member early.
- Recovery restores server access and mobile access.

### Step 8 — Implement advance payments and transfer grouping

Tasks:

- Offer only the plan's configured 3/6/12-month discount options.
- Calculate discounted total and anchored coverage on the server.
- For Mercado Pago, create a one-time checkout preference with the gym token.
- If the resolved fee mode is provider-supported `marketplace_split`, send the
  snapshotted platform fee. Otherwise accrue it for monthly gym invoicing.
- After an approved payment, create one approved `planPayments` row per covered
  cycle, linked by `advancePaymentGroupId` and the same provider transaction.
- For bank transfer, link the generated rows into one advance group so one
  proof/review approves or declines the complete purchase rather than charging
  each month independently.
- Make group upload/review/finalization atomic and idempotent.
- An advance purchase must not create a recurring agreement.

Exit criteria:

- 3, 6, and 12-month cases work for calendar and join-date plans.
- One provider payment or one transfer proof produces the correct coverage and
  no duplicate periods.
- Failed or abandoned checkout grants no new paid coverage.

### Step 9 — Integrate family and bonification changes

Tasks:

- Hook family association/removal mutations into the provider-operation
  outbox.
- Recalculate the next-cycle amount for the active family payer.
- Show pending amount/effective date in admin and member queries.
- Hook bonification create/edit/revoke mutations into the same mechanism.
- Partial bonification schedules an amount update for the next cycle.
- Full bonification schedules pause and keeps local access active; existing
  bonification payment generation remains consistent.
- Revoking full bonification schedules the correct amount and resume at the
  next cycle.
- If Mercado Pago sandbox behavior cannot preserve the intended next charge
  when resuming, implement the documented fallback: cancel the old agreement
  and request a new authorization at the next cycle. Never silently charge
  immediately.

Exit criteria:

- Family add/remove, partial/full bonification, edit, revoke, and provider
  failure tests pass.
- No mid-cycle debit is produced by a price or family change.
- Only the family payer can manage the agreement.

### Step 10 — Implement cancellation and payment-method changes

Tasks:

- Replace direct local cancellation for provider-managed subscriptions with an
  action that cancels future provider debits and schedules local access end.
- Compute and display `accessEndsAt` before confirmation.
- Keep the family group active until that timestamp, then cancel it atomically.
- A pending checkout can be cancelled immediately.
- Keep legacy direct cancellation for manual subscriptions where appropriate.
- Support switching from transfer to recurring by starting a new agreement for
  the next uncovered cycle.
- Support switching from recurring to transfer by cancelling future debits and
  keeping current coverage; transfer becomes due next cycle.
- Do not attempt to mutate an existing Mercado Pago payer/card. If the provider
  requires new authorization, create a replacement checkout.

Exit criteria:

- No post-cancellation renewal is created.
- Access ends on the disclosed date, not when the mobile button is tapped.
- Method changes do not overlap or leave an unpaid gap.

### Step 11 — Build gym admin UI in web

Update at least:

- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/dashboard/payments/page.tsx`
- `apps/web/components/features/payments/dialogs/plan-form-dialog.tsx`
- Payment/member detail dialogs and payment lists

Tasks:

- Add a Member Payments settings section with method toggles, grace days,
  Mercado Pago connection health, connect/reconnect, disable, guarded
  disconnect, and test/resync actions.
- Clearly identify the connected seller account.
- Explain that disabling prevents new checkouts but does not cancel existing
  debits.
- In the plan form, show recurring eligibility and disable it for calendar
  billing or late-fee plans.
- Extend payment tables/details with method, agreement state, retry/grace,
  provider gross/fee, MAT fee, gym net, family coverage, and external ids safe
  for support.
- Add operational actions: resync, retry queued operation, resend checkout,
  pause/resume where valid, and cancel.
- Keep all mutations permission-checked for the active organization.

Exit criteria:

- Admins can configure the whole feature without environment-level access.
- Trainers/employees/members cannot connect accounts or change payment policy.
- UI explains every disabled action and risky transition.

### Step 12 — Build the complete member flow in mobile

Update at least:

- `apps/mobile/components/features/plan/plan-selector.tsx`
- `apps/mobile/components/features/plan/plan-content.tsx`
- `apps/mobile/components/features/plan/payment-status-card.tsx`
- `apps/mobile/components/features/plan/payment-history-content.tsx`
- `apps/mobile/components/features/plan/proof-upload-form.tsx`
- `apps/mobile/hooks/use-subscription-gate.ts`
- `apps/mobile/app/+native-intent.tsx`
- `apps/mobile/app.json`

Tasks:

- Replace direct `activate` behavior with an explicit method/term selection and
  the corresponding backend checkout action.
- If both methods are enabled, let the member choose. If one is enabled, go
  directly to it.
- Show automatic debit only for eligible join-date plans.
- For an admin-created family plan, show the configured family and let only its
  payer start payment.
- Open Mercado Pago with `expo-web-browser` and return to a dedicated
  `/payments/return` route.
- Add Universal/App Link handling for `https://matgestion.app/payments/return`
  and a custom-scheme fallback.
- The return screen queries the backend until it reaches a terminal or
  actionable state; it never marks payment approved.
- Add states and actions for pending authorization, processing first payment,
  active auto-debit, retry/grace, suspended, bonification pause, scheduled
  cancellation, failed/abandoned checkout, retry, resync, and change method.
- Present a unified history for transfer, recurring, and one-time payments.
- Only show proof upload for transfer payments.
- Remove any copy telling members to manage gym dues through the App Store.
- Update the subscription gate so `pending_payment` is blocked and grace-period
  `active` remains allowed. Server checks remain authoritative.

Exit criteria:

- Tested on real iOS and Android builds, not only Expo web or a simulator.
- Cold-start, warm-start, app-not-installed fallback, checkout cancellation,
  lost network, duplicate tap, and delayed webhook paths are usable.
- No mobile path can activate itself from URL parameters.

### Step 13 — Implement commission settlement

Tasks:

- Resolve and snapshot the gym's current MAT payment policy at transaction
  creation/approval.
- For documented one-time split support, populate the provider fee only when
  `feeCollectionMode` is `marketplace_split` and the account is approved for it.
- For recurring payments, default to `monthly_gym_invoice` unless Mercado Pago
  explicitly enables and documents subscription splitting for MAT.
- Accrue one immutable commission ledger entry per approved transaction.
- Add an idempotent monthly settlement job that aggregates accrued fees by gym
  and links them to the existing organization billing system without mixing
  member payment records with SaaS payment records.
- ULTRA or any zero-fee policy creates `not_applicable` ledger rows or skips
  monetary settlement while retaining auditability.
- Handle refunds/chargebacks with compensating ledger entries, never destructive
  edits to collected history.

Exit criteria:

- PRO/fee and ULTRA/no-fee scenarios pass with policy changes between cycles.
- Re-running settlement cannot double-charge a gym.
- Gross, provider fee, MAT fee, and gym net reconcile for every approved test
  transaction.

### Step 14 — Notifications, observability, and support operations

Tasks:

- Add member push notifications for checkout incomplete, payment approved,
  payment rejected/retrying, grace deadline, suspension, recovery, amount
  change, and scheduled cancellation.
- Add admin alerts for broken connections, permanent provider-operation
  failures, unexpected amount/seller, refunds/chargebacks, and reconciliation
  mismatches.
- Add structured logs with correlation ids but no secrets/PII.
- Add metrics for checkout conversion, approval latency, webhook age/failures,
  retry recovery, suspended members, token refresh health, provider operations,
  gross volume, and commission accrual/collection.
- Add safe admin resync and replay tools. Replays must still pass idempotency and
  ownership checks.
- Write a support runbook for reconnecting a gym, missed webhooks, stuck first
  payment, rejected renewal, cancellation disputes, and commission mismatch.

Exit criteria:

- A support operator can diagnose every non-happy state without database edits.
- Alerts identify the gym and internal correlation id without revealing tokens
  or payment credentials.

### Step 15 — End-to-end QA and staged rollout

Use at least two Mercado Pago seller test accounts and multiple member payers.

Required scenario matrix:

- Gym A and Gym B isolation
- OAuth success, denial, replay, expiry, refresh, and reconnect
- Transfer-only, Mercado-Pago-only, and both-method gyms
- Join-date recurring eligibility and calendar/late-fee rejection
- First authorization without payment and first approved payment
- Approved renewal
- Rejected renewal, every retry, grace expiry, suspension, and recovery
- Duplicate and out-of-order webhooks
- Missed webhook repaired by reconciliation
- Family payer with member add/remove
- Partial and full bonification lifecycle
- 3, 6, and 12-month transfer and Mercado Pago advance purchases
- Voluntary cancellation and method switching
- Refund and chargeback
- PRO commission and future ULTRA zero commission
- Token expiry during webhook processing
- Mobile deep link on iOS/Android, cold/warm app, and browser fallback
- Regression of existing bank-transfer proof approval
- Regression of existing gym-to-MAT Mercado Pago billing

Rollout order:

1. Deploy schema and code with every Mercado Pago member-payment gate off.
2. Enable internally with test sellers.
3. Enable for one pilot gym with commission collection set to `none`.
4. Observe at least one initial charge, renewal, failure/retry, advance payment,
   family change, and cancellation.
5. Enable commission ledger in observation-only mode.
6. Enable the approved collection mode for the pilot.
7. Expand gym by gym with an immediate runtime kill switch available.

Exit criteria:

- Every scenario has recorded evidence and expected database transitions.
- No unresolved high-severity security, double-charge, access, or reconciliation
  defect remains.
- Pilot reconciliation matches Mercado Pago reports and MAT ledgers.

## 8. Verification commands

Run the relevant checks after every step and all checks before rollout:

```bash
pnpm convex:codegen
pnpm --filter @repo/convex test
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build
pnpm build
```

If the repository has pre-existing failures, record the exact baseline and
prove that the feature introduces no additional failures. Do not hide or
silence new errors.

## 9. Definition of done

The feature is fully developed only when all of the following are true:

- Separate gyms can safely connect separate Mercado Pago accounts.
- No token or provider secret is accessible to a client or log.
- The first approved provider payment—not the browser return or preapproval
  authorization—activates access.
- Renewals, fixed grace, suspension, retry recovery, cancellation, refunds, and
  reconciliation are idempotent.
- Join-date recurrence, family pricing, bonifications, and advance payments
  produce correct coverage.
- Bank transfer continues to work and advance transfer uses one grouped review.
- Web administrators can configure and support the integration.
- Members can complete and manage the entire payment flow in mobile on iOS and
  Android.
- PRO commission and future ULTRA zero commission are data-driven.
- One-time direct split is used only when supported and approved; recurring
  commission has a working monthly-invoice fallback.
- Existing organization-to-MAT Mercado Pago billing is unchanged and passes
  regression tests.
- Automated tests, builds, sandbox E2E tests, pilot reconciliation, monitoring,
  runbook, and rollback controls are complete.

## 10. Implementation-agent operating rules

An AI agent following this plan should:

1. Work through one numbered step at a time and keep this document's status
   updated with completed checkboxes or a short dated progress log.
2. Inspect current implementations before editing and preserve unrelated user
   changes.
3. Keep provider calls behind a testable adapter and never call production from
   automated tests.
4. Prefer additive, backward-compatible schema changes, followed by verified
   migrations and only then cleanup.
5. Never couple member payments to `organizationBillingSubscriptions` or the
   existing global Mercado Pago credential.
6. Stop rollout—not development—when commission percentage, legal approval, or
   marketplace capability is pending. Keep the fee at zero or ledger-only.
7. Do not proceed past a failing step exit criterion. Diagnose and fix it first.
8. Report at each checkpoint: files changed, behavior delivered, tests run,
   remaining risks, and the next step.
