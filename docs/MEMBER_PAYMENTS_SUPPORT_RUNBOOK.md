# Member Payments — Support Runbook

How to diagnose and fix member → gym Mercado Pago payments **without editing
the database**. Every situation below has a supported action; if you find one
that does not, that is a gap worth reporting rather than a reason to open the
Convex dashboard and patch a row.

## Before anything else

1. **Web → Pagos → Mercado Pago** shows every debit, its state, the provider
   resource id, and any charge flagged for attention.
2. **Web → Configuración → Cobros a socios** shows the gym's connection health
   and which seller account receives the money.
3. Logs are structured JSON with `"scope":"member_payments"`. Filter by
   `organizationId` or by `providerResourceId` to follow one charge end to end.
   They never contain tokens, payloads or payer contact details.

Two things are always true and worth repeating to a worried gym owner:

- A member gets access **only** when a payment is approved. Not when they pick
  a plan, not when they authorize the debit, not when the browser comes back.
- MAT never edits a member's payment history to fix a problem. Reversals are
  compensating entries; coverage is added, not rewritten.

---

## Reconnecting a gym

**Symptom.** Connection shows *Requiere reconexión* or *Con error*; members
cannot start new checkouts; admins got a "Revisá tu conexión" alert.

1. Configuración → Cobros a socios → **Probar conexión**. This refreshes the
   token once and retries before reporting a problem.
2. Still failing → **Reconectar**. The admin re-authorizes through Mercado
   Pago. The gym keeps its existing webhook routing key, so notifications
   Mercado Pago already has stored keep resolving, and existing debits continue.
3. Existing agreements are unaffected by a reconnect. Nothing needs replaying.

**Do not** tell an admin to disconnect to fix this. Disconnect clears the
credentials, and those credentials are what lets MAT stop existing debits.
Disconnect is blocked while live debits exist for exactly that reason.

---

## A payment Mercado Pago took but MAT does not show

**Symptom.** The member was charged; the app still says pending.

1. Pagos → Mercado Pago → find the member → **Resincronizar**. This asks
   Mercado Pago what it currently believes and applies the answer, including
   the most recent charge.
2. If nothing changes within a few minutes, check the metrics: a rising
   `webhooks.stuck` or `webhooks.failed` means notifications are arriving but
   not completing. Reconciliation retries these automatically every 15 minutes.
3. Reconciliation also repairs a notification that never arrived at all — it
   asks the provider directly rather than waiting.

Resync and reconciliation both go through the same idempotency and ownership
checks as a live webhook. Replaying is safe; it cannot double-credit a member
or credit the wrong gym.

---

## A first payment that never completes

**Symptom.** Member says they paid; agreement sits at *Esperando primer cobro*.

- **Authorized but not charged** is a real state, not a bug. Mercado Pago has
  the member's authorization; the money has not moved. The member has no
  access, correctly.
- **Resincronizar** pulls the latest charge attempt. If Mercado Pago rejected
  it, the member needs to fix their card and start a new checkout.
- An abandoned checkout expires on its own and the member is notified. They can
  simply start again.

---

## A rejected renewal

**Symptom.** Member's card failed.

- They keep access until the gym's grace deadline. The deadline is anchored to
  the **first** failed attempt and never moves, however many times Mercado Pago
  retries.
- The member is notified on the first failure, again a day before the deadline,
  and again if they are suspended.
- If a retry succeeds, access is restored automatically for the whole family
  group, including their recurring class bookings.
- If the member wants to pay another way instead, they can switch to transfer
  from the app: debits stop, the coverage they already paid for stands, and the
  next cycle becomes payable by transfer.

The hourly transfer-oriented suspension job never touches these members. If a
provider-managed member is suspended early, that is a bug — report it.

---

## Cancellation disputes

**Symptom.** "I cancelled and you charged me" / "I cancelled and lost access
immediately".

- Cancelling stops future debits **immediately** and keeps access until the
  disclosed date (paid coverage + grace). The member is shown that date before
  confirming and again in a notification afterwards.
- Pagos → Mercado Pago shows the agreement with *Baja programada* and the exact
  access-end date. That is what was promised.
- If a charge landed **after** cancellation, it is recorded and flagged
  `charge_after_cancellation`. It buys nothing and grants nothing. Refund it in
  Mercado Pago; MAT's compensating ledger entry follows automatically once the
  refund notification arrives.

---

## Refunds and chargebacks

- A reversal of the period the member is **currently inside** removes that
  coverage and suspends them — unless another approved payment (a transfer, an
  advance purchase) still covers it.
- A reversal of a period that has **already closed** is deliberately not
  rewritten. Later months may have been paid separately, and reopening closed
  history would corrupt the record. It is flagged for a human instead.
- MAT's commission is always reversed with a compensating negative ledger
  entry. The original accrual is never edited.

---

## A stuck operation

**Symptom.** A price change, pause, resume or cancellation has not reached
Mercado Pago. Admins got "Una operación con Mercado Pago falló".

1. Pagos → Mercado Pago → *Operaciones pendientes*. Each shows the member, the
   operation, the attempt count and the sanitized provider error.
2. Fix the underlying cause (usually a broken connection), then **Reintentar**.
   The operation is requeued with a fresh idempotency key.
3. Transient failures retry on their own with exponential backoff. Only
   validation, permission and not-found errors are parked immediately — those
   will never succeed on a repeat.

---

## Commission mismatch

**Symptom.** MAT's invoice does not match what the gym expects.

- Every approved charge writes one immutable ledger entry with the rate that
  was in force **at that moment**. Changing a gym's plan later never moves
  historical entries.
- Settlement runs daily over the previous, closed month only, and marks entries
  collected with a deterministic reference. Re-running it is a no-op — a gym
  cannot be invoiced twice for the same month.
- Refunds appear as negative entries in the month they were raised, so a
  settlement is a net figure.
- One-time checkout fees taken as a marketplace split are recorded as already
  `collected` and never appear on an invoice as well. Recurring charges always
  fall back to monthly invoicing, because Mercado Pago has no documented split
  on subscription charges.

Reconcile with: Configuración metrics (`commission.accruedArs` /
`commission.collectedArs`) and the super-admin settlement report.

---

## Things support must never do

- Edit `planPayments`, `memberPaymentTransactions` or `platformCommissionLedger`
  directly. Use resync, retry or a refund in Mercado Pago.
- Ask an admin to disconnect Mercado Pago to "reset" anything.
- Grant access manually to a member whose charge is flagged for a mismatched
  amount. Find out why the amount differed first.
