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

## Data model ownership

- Convex owns organizations, memberships, invitations, and active organization context.
- Clerk webhooks sync only user data into Convex.

## Useful commands

```bash
pnpm --filter @repo/convex codegen
pnpm --filter @repo/convex dev
```
