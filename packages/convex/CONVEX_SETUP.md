# Convex Setup Guide

This project uses Convex as the backend for web and mobile apps.
Clerk is used for authentication only.

## Initial setup

1. Install and login:

```bash
npm install -g convex
npx convex login
```

2. Start Convex:

```bash
pnpm --filter @repo/convex dev
```

3. Configure app env vars:

- Web: `NEXT_PUBLIC_CONVEX_URL`
- Mobile: `EXPO_PUBLIC_CONVEX_URL`
- Convex (push notifications): `EXPO_ACCESS_TOKEN` (optional but recommended for Expo Push API)
- Convex (staff invitation emails via Resend):
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL` (example: `Mat App <no-reply@tu-dominio.com>`)
  - `INVITATION_APP_URL` (example: `https://app.tu-dominio.com`)
  - `INVITATION_TTL_HOURS` (optional, default: `72`)
  - `RESEND_REPLY_TO` (optional)
- Convex (Mercado Pago checkout):
  - `MERCADOPAGO_CHECKOUT_ENABLED`
  - `MERCADOPAGO_ACCESS_TOKEN`
  - `MERCADOPAGO_ENV` (`sandbox` or `production`)
  - `MERCADOPAGO_LITE_PRICE_ARS`
  - `MERCADOPAGO_PUBLIC_APP_URL`
  - `MERCADOPAGO_WEBHOOK_URL`
  - `MERCADOPAGO_WEBHOOK_SECRET`
  - `MERCADOPAGO_SANDBOX_PAYER_USERNAME` (optional, sandbox only; use the Mercado Pago test buyer username shown in the test accounts table)
  - `MERCADOPAGO_SANDBOX_PAYER_EMAIL` (optional, sandbox only; overrides the payer email directly if Mercado Pago exposes one)

## Data model ownership

- Convex owns organizations, memberships, invitations, and active organization context.
- Clerk webhooks sync only user data into Convex.

## Useful commands

```bash
pnpm --filter @repo/convex codegen
pnpm --filter @repo/convex dev
```
