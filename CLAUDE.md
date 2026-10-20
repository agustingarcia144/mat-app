# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Turborepo monorepo for **Mat Gestion** — a gym management platform with a Next.js web app, React Native/Expo mobile app, shared business logic, and a Convex backend.

**Apps:**

- `apps/web` — Next.js 16 web application (React 19, TailwindCSS 4, Radix UI)
- `apps/mobile` — Expo ~54 / React Native 0.81 mobile app (iOS & Android)

**Packages:**

- `packages/core` — Shared types, Zod schemas, and utilities (`@repo/core`)
- `packages/convex` — Convex backend functions (`@repo/convex`)
- `packages/typescript-config` — Shared TS configs

## Commands

```bash
# Install dependencies
pnpm install

# Run all apps in parallel (web, mobile, convex)
pnpm dev

# Run individual apps
pnpm --filter web dev
pnpm --filter mobile dev
pnpm convex:dev            # alias for pnpm --filter convex dev

# Build
pnpm build
pnpm --filter web build

# Test (Vitest — currently only @repo/core has a suite)
pnpm test
pnpm --filter @repo/core test:watch

# Lint & format
pnpm --filter web lint
pnpm --filter mobile lint
pnpm format                # Prettier across all files

# Mobile
pnpm ios                   # iOS simulator
pnpm android               # Android emulator
pnpm testflight            # Submit to TestFlight via EAS

# Convex
pnpm convex:deploy
pnpm convex:codegen        # Regenerate Convex types after schema changes
```

`@repo/core` must be built before mobile runs (the `postinstall` script handles this automatically).

## Architecture

### Data & Auth

- **Convex** owns all application data: organizations, memberships, classes, planifications, exercises.
- **Clerk** is auth-only. Clerk webhooks (`user.created`, `user.updated`, `user.deleted`) sync user data to Convex via an HTTP endpoint in `packages/convex/convex/`.
- JWT tokens from Clerk are verified by Convex using `CLERK_JWT_ISSUER_DOMAIN`.

### Billing Tiers (LITE / PRO / ULTRA)

Gyms subscribe to MAT on one of three plans. Gating is **entitlement-driven, never a plan-name check**: `packages/convex/convex/appBillingPlans.ts` defines what each plan unlocks and seeds it onto the plan doc (`entitlements.modules`, `dashboardCards`, `memberPayments`, `ai`), and every consumer reads those values.

- Add a feature to a tier by editing the module arrays in `appBillingPlans.ts` — do not add `if (planKey === ...)` branches.
- Server-side gates use `organizationHasModule(ctx, orgId, module)`; the web app uses `getCurrentEntitlement` via `useOrganizationEntitlement`, `billingModule` in `apps/web/lib/dashboard-nav.ts`, and `moduleForPath` in `organization-entitlement-guard.tsx`.
- ULTRA adds a 0% member-payment commission and a larger Mati AI allowance. The 7-day signup trial runs on **PRO**.
- Three modules are **piloted per organization** and belong to no plan: `check_in` (QR check-in + the Apple/Google Wallet credential that carries the member's code), `rewards` (the points programme), and `member_payments` (charging members through MercadoPago). They are listed in `PILOT_ONLY_MODULES` and reach a gym only through a row in `organizationModuleOverrides`, written by a super admin from `/dashboard/platform` → Organizaciones → Módulos. Adding one to a plan array is what graduates it out of the pilot.
- `resolveOrganizationModules(ctx, orgId, planModules)` is the single place overrides are read; `organizationHasModule` and `getCurrentEntitlement` both go through it, so a server gate and the sidebar cannot disagree. Note `reconcilePlanEntitlementsInternal` unions and never removes — retiring a module from a plan needs `pruneRetiredModulesInternal` to clear live plan docs.
- `organizationSettings.get` folds these entitlements into the `rewards`, `walletCard` and `memberPayments` flags it returns. That is what hides the module from the mobile app, which reads the settings and has no entitlement of its own — so gating belongs there, not in the tab bar.
- Commission rates and AI allowances are data: a super admin changes them with `setMemberPaymentPolicy` / a plan-doc patch, without a deploy. Re-seeding preserves those overrides.

### Shared Code (`@repo/core`)

Built via `tsup` with four entry points:

- `@repo/core` — main index
- `@repo/core/types` — TypeScript types (e.g., `Member`, `MembershipData`, `RecurrencePattern`)
- `@repo/core/schemas` — Zod schemas for planifications, exercises, workout days/weeks
- `@repo/core/utils` — helpers (exercise, member, video utilities)

Both `apps/web` and `apps/mobile` import from these entry points.

### Routing

- **Web** uses Next.js App Router (`apps/web/app/`)
- **Mobile** uses Expo Router with typed routes (`apps/mobile/app/`)

### Component Structure (both apps)

Components are organized into `features/`, `shared/`, `ui/`, and `providers/` directories.

### Join Flow (Deep Linking)

QR-based gym join uses HMAC-signed tokens with org ID + expiry. The backend verifies the token before approving membership. See `docs/DEFERRED_DEEP_LINKING_ARCHITECTURE.md` for the full trust model and `packages/convex/convex/joinGym.ts` for implementation.

### pnpm Isolated Linker

`.npmrc` uses `node-linker=isolated` to prevent React version conflicts between web (19.2.3) and mobile (19.1.0). Do not change this.

## Environment Variables

Required (tracked in `turbo.json` globalEnv):

- `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` — Convex endpoints
- `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk auth
- `CLERK_WEBHOOK_SIGNING_SECRET` — Webhook validation

Convex-only:

- `JOIN_LINK_SECRET` — HMAC secret for join tokens
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `INVITATION_APP_URL` — Email invitations
- `MERCADOPAGO_LITE_PRICE_ARS`, `MERCADOPAGO_PRO_PRICE_ARS`, `MERCADOPAGO_ULTRA_PRICE_ARS` — Monthly SaaS price per plan, read when seeding the plan doc at checkout

## Key Files

| Path                                    | Purpose                             |
| --------------------------------------- | ----------------------------------- |
| `packages/convex/convex/auth.config.ts` | Clerk JWT setup for Convex          |
| `packages/convex/convex/joinGym.ts`     | Secure QR join token logic          |
| `packages/convex/convex/permissions.ts` | Role-based access checks            |
| `packages/core/tsup.config.ts`          | Multi-entry library build config    |
| `scripts/generate-join-token.mjs`       | Dev utility to generate join tokens |
