# Clerk Webhook Setup

Clerk is used for authentication and user profile sync only.

## Required events

Configure a single Clerk webhook endpoint:

- URL: `https://<your-deployment>.convex.site/clerk-webhook`
- Events:
  - `user.created`
  - `user.updated`
  - `user.deleted`

No organization events are required.

## Convex environment variables

Set:

- `CLERK_WEBHOOK_SIGNING_SECRET` — required for the webhook endpoint.
- `CLERK_SECRET_KEY` — same Clerk secret key used for Backend API calls (e.g. migrations). Required for **in-app account deletion**, which purges Convex data and then `DELETE`s the user via Clerk.

Example:

```bash
npx convex env set CLERK_WEBHOOK_SIGNING_SECRET "your-secret-here"
npx convex env set CLERK_SECRET_KEY "sk_live_..."
```

## Validation checklist

- Webhook endpoint responds `200` for user events.
- `users` table is updated on create/update/delete.
- Convex logs show no webhook verification failures.
