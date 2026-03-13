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

## Convex environment variable

Set:

- `CLERK_WEBHOOK_SIGNING_SECRET`

Example:

```bash
npx convex env set CLERK_WEBHOOK_SIGNING_SECRET "your-secret-here"
```

## Validation checklist

- Webhook endpoint responds `200` for user events.
- `users` table is updated on create/update/delete.
- Convex logs show no webhook verification failures.
