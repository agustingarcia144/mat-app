# Clerk Webhook Setup Guide

This guide explains how to set up Clerk webhooks to sync user, organization, and membership data to Convex.

## Overview

The webhook implementation syncs the following data from Clerk to Convex:

- **Users**: App-specific user data (birthday, etc.)
- **Organizations**: Gym data (name, slug, address, phone, email, logo)
- **Organization Memberships**: User-gym relationships with roles (owner, trainer, member)

## Prerequisites

1. A Clerk account with organizations enabled
2. Convex deployment URL
3. Clerk webhook signing secret

## Setup Steps

### 1. Install Dependencies

The `svix` package is already added to `package.json`. Install it:

```bash
cd packages/convex
pnpm install
```

### 2. Configure Environment Variables

Add the Clerk webhook signing secret to your Convex environment variables:

1. Go to your [Convex Dashboard](https://dashboard.convex.dev)
2. Navigate to your project settings
3. Add environment variable:
   - **Name**: `CLERK_WEBHOOK_SIGNING_SECRET`
   - **Value**: Your Clerk webhook signing secret (from step 3 below)

Alternatively, you can set it via CLI:

```bash
npx convex env set CLERK_WEBHOOK_SIGNING_SECRET "your-secret-here"
```

### 3. Set Up Webhook in Clerk Dashboard

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Webhooks** in the sidebar
3. Click **Add Endpoint**

#### Configure the Webhook:

- **Endpoint URL**: `https://<your-deployment>.convex.site/clerk-webhook`
  - Replace `<your-deployment>` with your actual Convex deployment name
  - Example: `https://happy-animal-123.convex.site/clerk-webhook`
- **Subscribe to events**:
  - ✅ `user.created`
  - ✅ `user.updated`
  - ✅ `user.deleted`
  - ✅ `organization.created`
  - ✅ `organization.updated`
  - ✅ `organization.deleted`
  - ✅ `organizationMembership.created`
  - ✅ `organizationMembership.updated`
  - ✅ `organizationMembership.deleted`
- Click **Create**
- Copy the **Signing Secret** and add it to Convex environment variables (step 2)

### 4. Deploy Convex Functions

Make sure your Convex functions are deployed:

```bash
cd packages/convex
pnpm convex:dev  # For development
# or
pnpm convex:deploy  # For production
```

### 5. Test the Webhooks

1. In the Clerk Dashboard, go to your webhook endpoint settings
2. Click the **Testing** tab
3. Select an event type (e.g., `user.created`)
4. Click **Send Example**
5. Check the **Message Attempts** section to verify the webhook was successful
6. Verify in Convex Dashboard that the data was created/updated

## Webhook Endpoint

A single unified endpoint handles all Clerk events:

- `POST /clerk-webhook` - Handles all user, organization, and membership events

## Data Mapping

### Users

- `externalId` ← Clerk user `id`
- `birthday` ← Clerk `public_metadata.birthday` (if set)

### Organizations

- `externalId` ← Clerk organization `id`
- `name` ← Clerk organization `name`
- `slug` ← Clerk organization `slug` (or auto-generated from name)
- `address` ← Clerk `public_metadata.address`
- `phone` ← Clerk `public_metadata.phone`
- `email` ← Clerk `public_metadata.email`
- `logoUrl` ← Clerk `image_url` or `logo_url`

### Organization Memberships

- `organizationId` ← References Convex organization (found by Clerk org ID)
- `userId` ← Clerk user ID
- `role` ← Mapped from Clerk role:
  - `org:admin` → `owner`
  - Roles containing "trainer", "instructor", or "teacher" → `trainer`
  - Default → `member`
- `status` ← Always `active` (can be customized)
- `joinedAt` ← Clerk `created_at`
- `lastActiveAt` ← Clerk `updated_at`

## Role Mapping

Clerk roles are mapped to our system as follows:

- **Owner**: `org:admin` or any role containing "admin"
- **Trainer**: Any role containing "trainer", "instructor", or "teacher"
- **Member**: Default for all other roles

**Note**: A user can have multiple roles in the same organization (e.g., owner + member, trainer + member). Each role creates a separate membership record.

## Troubleshooting

### Webhook Verification Fails

- Ensure `CLERK_WEBHOOK_SIGNING_SECRET` is set correctly in Convex
- Verify the signing secret matches the one in Clerk Dashboard
- Check that the webhook endpoint URL is correct

### Data Not Syncing

- Check Convex function logs in the Dashboard
- Verify webhook events are being received (check Clerk Dashboard → Webhooks → Message Attempts)
- Ensure the organization exists before syncing memberships (organizations are synced first)

### Organization Not Found When Syncing Membership

This can happen if:
- The organization webhook hasn't processed yet (eventual consistency)
- The organization was deleted
- The organization ID doesn't match

The membership sync will log a warning and skip the membership if the organization doesn't exist.

## Development

For local development, you can use ngrok to tunnel webhooks to your local Convex dev server:

1. Install ngrok: `npm install -g ngrok`
2. Start Convex dev: `pnpm convex:dev`
3. Start ngrok tunnel: `ngrok http 3000` (or your Convex dev port)
4. Use the ngrok URL in Clerk webhook configuration

## Production

For production:
1. Deploy Convex: `pnpm convex:deploy`
2. Use your production Convex deployment URL in Clerk webhook endpoints
3. Ensure `CLERK_WEBHOOK_SIGNING_SECRET` is set in production Convex environment

## References

- [Clerk Webhook Documentation](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Convex HTTP Actions](https://docs.convex.dev/functions/http-actions)
- [Convex Environment Variables](https://docs.convex.dev/production/environment-variables)
