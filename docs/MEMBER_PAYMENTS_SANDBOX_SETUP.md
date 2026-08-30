# Member Payments — Sandbox Setup (localhost)

End-to-end setup for testing member → gym Mercado Pago payments against your
**dev Convex deployment** and a local web app. No staging site is required.

Everything below targets the dev deployment. Do not run any of it with
`--prod` until the sandbox matrix in the implementation plan passes.

---

## 0. Why a separate Mercado Pago application

You already have credentials behind the LITE/PRO SaaS billing
(`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`). Those act on
**MAT's own seller account** — MAT charging gyms.

Member payments are a different relationship: gyms authorize MAT to charge
**their** members into **their** account, through OAuth. That needs an
application with a Client ID, a Client Secret and a registered redirect URI.

Technically one application could serve both. Use two anyway:

- **The webhook signing secret is per application.** Sharing it means rotating
  the member-payments secret silently breaks SaaS billing notifications, and
  vice versa.
- **Blast radius.** If member-payment credentials have to be revoked, gyms
  paying MAT should not stop working.
- The implementation plan requires the two integrations to stay logically
  separate, and this is where that separation actually has to exist.

So: **create a new application.** Leave the LITE/PRO one alone.

---

## 1. Create the application

Mercado Pago developer panel → *Tus integraciones* → **Crear aplicación**.

- **Name**: something unambiguous, e.g. `MAT — Cobros a socios`.
- **Solution**: online payments.
- **Integration model**: the one that includes **Suscripciones** (preapprovals)
  and **Checkout Pro** (one-time preferences). MAT uses both — recurring debit
  and 3/6/12-month advance purchases.

> The panel's exact wording changes between revisions. What matters is the end
> state, not the menu path: the application must expose **Client ID / App ID**,
> **Client Secret**, and a **Redirect URI** field. If you cannot find a redirect
> URI field, the application is not set up for OAuth and gyms will not be able
> to authorize it.

Note down:

| Value | Goes into |
| --- | --- |
| App ID / Client ID | `MERCADOPAGO_CLIENT_ID` |
| Client Secret | `MERCADOPAGO_CLIENT_SECRET` |

### Why these come from *Credenciales de producción*

There is no test Client Secret. *Credenciales de prueba* contains only a Public
Key and an Access Token — those are for charging your **own** account in
simulated mode, which is not what OAuth does.

`client_id` and `client_secret` identify the **application**, and an
application has exactly one identity. What makes a connection a sandbox one is
**who authorizes it**: a seller *test user* returns a `TEST-` access token,
and every charge made with it is simulated.

That means the same credentials could connect a real gym's real account if
someone signed in with the wrong Mercado Pago login. `MEMBER_PAYMENTS_MP_ENV=sandbox`
guards against exactly that: the connection is refused with
`live_account_on_sandbox` and nothing is stored. A sandbox deployment never
holds real credentials.

---

## 2. Register the OAuth redirect URI

In the application settings, set the redirect URI to **exactly**:

```
https://acoustic-swordfish-801.convex.site/member-payments/oauth/callback
```

Mercado Pago rejects any mismatch — including a trailing slash. This is a
public HTTPS endpoint served by your dev Convex deployment, which is why no
tunnel or staging deploy is needed.

---

## 3. Configure webhooks

In the application → *Webhooks* / *Notificaciones*:

- **URL**: `https://acoustic-swordfish-801.convex.site/member-payments/webhook/app-level`
- **Events**: `subscription_preapproval`, `subscription_authorized_payment`,
  and `payment`.
- Copy the **clave secreta** → `MEMBER_PAYMENTS_WEBHOOK_SECRET`.

### Why the URL ends in `app-level`

MAT sets a `notification_url` on **each** preapproval and preference it
creates, and that per-resource URL carries a random per-gym routing key —
that is how an incoming notification selects which gym's token to fetch the
resource with, without putting an organization id in a URL Mercado Pago
stores. The per-resource URL overrides this app-level one.

The app-level entry exists only because Mercado Pago requires a configured
webhook before it will show you the signing secret. Notifications that do
arrive on it carry an unrecognised routing key, and MAT answers `200` and
ignores them — acknowledged so Mercado Pago stops retrying, applied to
nothing.

---

## 4. Create sandbox test users

You need **three**, because a Mercado Pago test user cannot pay itself:

- Two **sellers** — Gym A and Gym B. Two are needed for the cross-gym
  isolation checks (a notification for Gym A must never touch Gym B).
- At least one **payer** — the member.

Create them from the panel's test-accounts section, or with MAT's own access
token:

```bash
curl -X POST https://api.mercadopago.com/users/test_user -H "Authorization: Bearer $MERCADOPAGO_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"site_id":"MLA"}'
```

Save each response — the password is shown **once**.

---

## 5. Set the Convex environment

Generate an encryption key. This encrypts each gym's access and refresh tokens
at rest; it is not a Mercado Pago value:

```bash
openssl rand -base64 32
```

Then, from the repo root:

```bash
cd packages/convex && npx convex env set MEMBER_PAYMENTS_ENCRYPTION_KEY '<paste-the-key>' && npx convex env set MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION v1 && npx convex env set MERCADOPAGO_CLIENT_ID '<app-id>' && npx convex env set MERCADOPAGO_CLIENT_SECRET '<client-secret>' && npx convex env set MEMBER_PAYMENTS_WEBHOOK_SECRET '<clave-secreta>' && npx convex env set MEMBER_PAYMENTS_OAUTH_REDIRECT_URL 'https://acoustic-swordfish-801.convex.site/member-payments/oauth/callback' && npx convex env set MEMBER_PAYMENTS_WEBHOOK_BASE_URL 'https://acoustic-swordfish-801.convex.site' && npx convex env set MEMBER_PAYMENTS_WEB_APP_URL 'http://localhost:3000' && npx convex env set MEMBER_PAYMENTS_MOBILE_RETURN_URL 'https://matgestion.app/payments/return' && npx convex env set MEMBER_PAYMENTS_MP_ENV sandbox
```

Confirm they landed:

```bash
cd packages/convex && npx convex env list
```

**Do not enable the kill switch yet** — step 7.

---

## 6. Turn on member payments for the PRO plan

Your existing `appBillingPlans` PRO row predates this feature, so it has no
`memberPayments` policy. An absent policy means **disabled**: without this
step every gym sees "tu plan de MAT no incluye cobros a socios" no matter what
else you configure.

Convex dashboard → *Functions* → run `appBillingPlans:ensureMemberPaymentPolicyInternal`:

```json
{ "planKey": "pro", "mercadoPagoEnabled": true, "platformFeeBps": 0, "feeCollectionMode": "none" }
```

Commission stays at **zero** until MAT settles the commercial percentage and
its tax treatment. The ledger still records every charge, so switching it on
later is a configuration change, not a code change.

> Use this rather than `ensureProPlanInternal`: that one also rewrites the
> plan's price, and called without a price it would set PRO to $1.

Leave LITE alone — LITE gyms are not entitled to member Mercado Pago.

---

## 7. Enable the feature

```bash
cd packages/convex && npx convex env set MEMBER_MP_PAYMENTS_ENABLED true
```

Until this line runs, the feature is invisible: members see only bank
transfer, and no checkout can be created. It is also your fastest rollback —
setting it to `false` stops new checkouts immediately without touching data or
cancelling anything that already exists.

---

## 8. Connect a gym

1. `pnpm --filter web dev`, sign in as an **admin** of your test gym.
2. *Configuración* → **Cobros a socios**.
3. **Conectar cuenta** → authorize as your **Gym A seller test user**.
4. You return to `/dashboard/settings?mp=success`, and the card should name the
   connected seller account.
5. **Probar conexión** should report success.
6. Enable **Débito automático** and **Pago adelantado**.

Repeat with Gym B and its own seller, in a different gym. Two gyms, two seller
accounts — that is the isolation the rest of the testing depends on.

---

## 9. First smoke test

1. The plan the member will use must be **billed from the join date** and have
   **no interest tiers** — automatic debit is refused otherwise, and the plan
   form says so.
2. In mobile, as the member: choose the plan → **Débito automático** →
   authorize in Mercado Pago as the **payer test user**.
3. Expected: back in the app on the return screen, briefly "verificando", then
   the plan active.
4. Confirm in web → *Pagos* → *Mercado Pago*: one agreement `Activo`, one
   charge with gross / Mercado Pago fee / MAT fee / gym net.

If it stalls at "esperando el primer cobro", that is a real state, not a bug:
Mercado Pago has the authorization but the money has not moved. Use
**Resincronizar**.

Then work outward: a failed renewal (Mercado Pago's rejection test cards), the
grace window, recovery, an advance purchase, a family change, a cancellation.

---

## Troubleshooting

**The callback returns `?mp=error&reason=live_account_on_sandbox`.** You
authorized with a real Mercado Pago account instead of a seller test user. Sign
out of Mercado Pago and retry with the test user's credentials.

**The callback returns `?mp=error&reason=…`.** The reason is a short code, on
purpose — provider messages can echo tokens and payer emails into a URL the
browser logs. Look up the code in the deployment logs, filtered on
`"scope":"member_payments"`.

- `invalid_state` — the attempt expired (states live ten minutes), was reused,
  or the callback was replayed. Start again.
- `exchange_failed` — client id/secret wrong, or the redirect URI does not
  match the registered one byte for byte.
- `missing_refresh_token` — the application is not requesting `offline_access`.
- `seller_already_connected` — that seller account is already linked to another
  gym. Use your second seller test user.

**Webhooks return 401 and Mercado Pago keeps retrying.** The signature did not
verify. Check `MEMBER_PAYMENTS_WEBHOOK_SECRET` matches the *new* application's
secret, not the SaaS one.

> **Verify this early.** MAT verifies notifications against a single
> application-level secret, on the understanding that notifications for
> OAuth-connected sellers are signed with the application's secret rather than
> each seller's own. That is the documented behaviour, but it is worth
> confirming with one real notification rather than trusting it. If every
> connected-seller notification 401s while the secret is definitely correct,
> the assumption is wrong and the secret needs to become per-connection — tell
> me and it is a contained change.

**Nothing happens after the member pays.** Check *Pagos* → *Mercado Pago* for a
recorded charge. If there is none, reconciliation runs every 15 minutes and
asks Mercado Pago directly; **Resincronizar** does it now.

**A member has no Mercado Pago option at all.** In order: the kill switch
(step 7), the PRO policy (step 6), the gym's toggles (step 8), an active
connection, and finally the plan's own billing mode. The app states the
specific reason next to each disabled option rather than hiding it.

---

## What still needs a real build and the real domain

- **Cold-start deep-link return** — the member kills the app mid-checkout.
  Android app-link verification needs `assetlinks.json` and iOS needs
  `apple-app-site-association`, both served from `matgestion.app`.
  The normal return works in dev without this, because `openAuthSessionAsync`
  watches the in-app browser for the redirect and closes it itself.
- **Real iOS and Android builds** — step 12's exit criterion. Expo web and the
  simulator do not exercise the link handling that matters.

Everything else on this page works from localhost.
