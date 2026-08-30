# Member Payments — Environment Variables

Configuration reference for the member → gym Mercado Pago integration
(`docs/MEMBER_PAYMENTS_MERCADO_PAGO_IMPLEMENTATION_PLAN.md`).

**No values are committed to this repository.** Set them with
`npx convex env set <NAME> <value>` against the target deployment, or through
the Convex dashboard. Sandbox and production use different Mercado Pago
applications and therefore different values for every variable below.

## Separation from SaaS billing

The organization → MAT billing integration keeps its own variables
(`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`,
`MERCADOPAGO_WEBHOOK_URL`, `MERCADOPAGO_PUBLIC_APP_URL`,
`MERCADOPAGO_LITE_PRICE_ARS`, `MERCADOPAGO_PRO_PRICE_ARS`,
`MERCADOPAGO_CHECKOUT_ENABLED`, `MERCADOPAGO_ENV`). Those are MAT's own seller
credentials and must never be used to charge a gym's members. Everything in the
table below is new and prefixed `MEMBER_PAYMENTS_*` or belongs to the Mercado
Pago OAuth application.

## Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEMBER_MP_PAYMENTS_ENABLED` | no (defaults off) | Runtime kill switch. Only the exact string `true` enables member Mercado Pago payments. Anything else — unset included — disables new checkouts immediately. |
| `MERCADOPAGO_CLIENT_ID` | yes | Client id of the Mercado Pago **application** gyms authorize through OAuth. |
| `MERCADOPAGO_CLIENT_SECRET` | yes | Client secret for the same application. Server-side only; never returned to a client. |
| `MEMBER_PAYMENTS_OAUTH_REDIRECT_URL` | yes | Fixed OAuth callback, e.g. `https://<deployment>.convex.site/member-payments/oauth/callback`. Must match the redirect URI registered on the Mercado Pago application byte for byte. |
| `MEMBER_PAYMENTS_ENCRYPTION_KEY` | yes | Base64 key used to encrypt each gym's access and refresh tokens at rest. Rotate by adding a new key version, never by overwriting in place. |
| `MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION` | yes | Version label stored on every encrypted row so a rotation can decrypt old rows. |
| `MEMBER_PAYMENTS_WEBHOOK_BASE_URL` | yes | HTTPS origin of the Convex deployment, e.g. `https://<deployment>.convex.site`. Each connection's notification URL is this origin plus its random routing key. |
| `MEMBER_PAYMENTS_WEBHOOK_SECRET` | yes | Webhook signing secret of the Mercado Pago **application**. Notifications from every connected seller are signed with it, so one secret covers all gyms — unlike the access token, which is per gym. Distinct from the SaaS `MERCADOPAGO_WEBHOOK_SECRET`. |
| `MEMBER_PAYMENTS_WEB_APP_URL` | yes | Allowlisted origin the OAuth callback may redirect back to (the web dashboard). |
| `MEMBER_PAYMENTS_MOBILE_RETURN_URL` | yes | Universal link members return to after checkout, e.g. `https://matgestion.app/payments/return`. |
| `MEMBER_PAYMENTS_MP_ENV` | no | Set to `sandbox` on any non-production deployment. OAuth has no separate test credentials, so the same application could connect a real gym's real account; with this set, a connection whose token reports `live_mode: true` is refused and nothing is stored. |

## Sandbox checklist

1. Create a Mercado Pago application with **Suscripciones** and **Checkout Pro**
   enabled, and register `MEMBER_PAYMENTS_OAUTH_REDIRECT_URL` as its redirect URI.
2. Create at least two seller test users (Gym A and Gym B) and at least one
   payer test user, so cross-gym isolation can be verified.
3. Set every variable above on the dev deployment with `MEMBER_PAYMENTS_MP_ENV=sandbox`
   and `MEMBER_MP_PAYMENTS_ENABLED=false`.
4. Turn the kill switch on only for the deployment being tested.

## Production checklist

1. Same variables, production application credentials, `MEMBER_PAYMENTS_MP_ENV=production`.
2. Deploy with `MEMBER_MP_PAYMENTS_ENABLED=false`; enable per the staged rollout
   in section 15 of the implementation plan.
3. Commission collection stays at `feeCollectionMode: "none"` / `platformFeeBps: 0`
   until MAT confirms the commercial and tax treatment.

## Setup

See `docs/MEMBER_PAYMENTS_SANDBOX_SETUP.md` for the step-by-step sandbox
configuration against a dev Convex deployment.

## Support

See `docs/MEMBER_PAYMENTS_SUPPORT_RUNBOOK.md` for diagnosing and fixing
non-happy states without database edits.

## Automated tests

Tests never read these variables and never call Mercado Pago. Provider calls go
through the `MercadoPagoTransport` seam in `packages/convex/convex/mercadoPagoTransport.ts`;
tests inject `FakeMercadoPago` from `mercadoPago.fake.ts`. The kill switch is
asserted off by default in `memberPaymentsSetup.test.ts`.
