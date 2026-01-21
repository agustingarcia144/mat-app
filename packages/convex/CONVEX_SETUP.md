# Convex Setup Guide

This project uses [Convex](https://www.convex.dev/) as the backend API for both the web and mobile applications.

## Initial Setup

1. **Install Convex CLI** (if not already installed):
   ```bash
   npm install -g convex
   ```

2. **Login to Convex**:
   ```bash
   npx convex login
   ```

3. **Initialize and start Convex development server**:
   ```bash
   pnpm convex:dev
   ```
   
   This will:
   - Create a new Convex project (if you don't have one)
   - Start the development server
   - Generate TypeScript types in `convex/_generated/`
   - Provide you with a deployment URL

4. **Set environment variables**:
   
   After running `convex dev`, you'll get a deployment URL. Add it to:
   
   - **Web app**: Create `apps/web/.env.local` with:
     ```
     NEXT_PUBLIC_CONVEX_URL=https://your-deployment-url.convex.cloud
     ```
   
   - **Mobile app**: Create `apps/mobile/.env.local` with:
     ```
     EXPO_PUBLIC_CONVEX_URL=https://your-deployment-url.convex.cloud
     ```

## Project Structure

- `packages/convex/` - Backend functions (queries, mutations, actions)
  - `schema.ts` - Database schema definitions
  - `example.ts` - Example query and mutation functions
  - `_generated/` - Auto-generated TypeScript types (gitignored)
  - `package.json` - Convex package configuration

## Usage

### In Web App (Next.js)

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.getExample);
  const createExample = useMutation(api.example.createExample);
  
  // Use data and mutations...
}
```

### In Mobile App (React Native/Expo)

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.getExample);
  const createExample = useMutation(api.example.createExample);
  
  // Use data and mutations...
}
```

## Available Scripts

- `pnpm convex:dev` - Start Convex development server
- `pnpm convex:deploy` - Deploy to production
- `pnpm convex:codegen` - Generate TypeScript types

## Documentation

- [Convex Documentation](https://docs.convex.dev/)
- [Convex React Client](https://docs.convex.dev/client/react)
- [Convex React Native Guide](https://docs.convex.dev/quickstart/react-native)


- CLERK ORGS DOCS
There isn’t a step‑by‑step “organizations with Clerk + Convex” guide in the sources, but there are a few clear principles:

1. **Clerk is the source of truth; Convex stores a synced copy**

   Convex doesn’t automatically expose Clerk’s organizations; all Clerk data (including orgs) lives in Clerk and can be **synced into your Convex database**. [[Clerk org data](https://discord.com/channels/1019350475847499849/1404101113443258558)]

   The same pattern is already documented for users: Clerk sends webhooks to a Convex HTTP endpoint, and Convex mutations upsert/delete user records in a `users` table. [[Webhook impl](https://docs.convex.dev/auth/database-auth#webhook-endpoint-implementation); [Webhook setup](https://docs.convex.dev/auth/database-auth#set-up-webhooks)]

2. **Mirror that pattern for organizations**

   The docs only show user webhooks, but you can apply the same idea to organizations:

   - In Clerk, configure a single webhook endpoint for **all events** (users, organizations, and memberships):
     - `user.created`, `user.updated`, `user.deleted`
     - `organization.created`, `organization.updated`, `organization.deleted`
     - `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
   - Point it at a single Convex HTTP route: `https://<deployment>.convex.site/clerk-webhook`
   - In Convex, add a unified `http.route` handler that switches on all event types and calls the appropriate internal mutations.

   The unified webhook handler looks like:

   ```ts
   http.route({
     path: "/clerk-webhook",
     method: "POST",
     handler: httpAction(async (ctx, request) => {
       const event = await validateRequest(request);
       if (!event) {
         return new Response("Error occured", { status: 400 });
       }
       switch (event.type) {
         case "user.created":
         case "user.updated":
           await ctx.runMutation(internal.users.upsertFromClerk, {
             data: event.data,
           });
           break;
         case "user.deleted": {
           const clerkUserId = event.data.id!;
           await ctx.runMutation(internal.users.deleteFromClerk, { clerkUserId });
           break;
         }
         case "organization.created":
         case "organization.updated":
           await ctx.runMutation(internal.organizations.upsertFromClerk, {
             data: event.data,
           });
           break;
         case "organization.deleted": {
           const clerkOrgId = event.data.id!;
           await ctx.runMutation(internal.organizations.deleteFromClerk, { clerkOrgId });
           break;
         }
         case "organizationMembership.created":
         case "organizationMembership.updated":
           await ctx.runMutation(internal.organizationMemberships.upsertFromClerk, {
             data: event.data,
           });
           break;
         case "organizationMembership.deleted": {
           const clerkOrgId = event.data.organization_id;
           const clerkUserId = event.data.public_user_data?.user_id || event.data.user_id;
           await ctx.runMutation(internal.organizationMemberships.deleteFromClerk, {
             clerkOrgId,
             clerkUserId,
           });
           break;
         }
         default:
           console.log("Ignored Clerk webhook event", event.type);
       }
       return new Response(null, { status: 200 });
     }),
   });
   ```
   [[Webhook impl](https://docs.convex.dev/auth/database-auth#webhook-endpoint-implementation)]

   This unified approach uses a single endpoint and signing secret, making setup simpler than managing multiple webhook endpoints.

3. **Design Convex tables for orgs and memberships**

   The sources don’t prescribe a schema for organizations, but they *do* show the pattern of storing Clerk IDs in Convex (for users, `externalId` is the Clerk ID). [[Users table](https://docs.convex.dev/auth/database-auth#set-up-webhooks)]

   You can follow that pattern:

   - `organizations` table:
     - `externalId`: Clerk organization ID
     - other org metadata you care about (name, slug, etc.)
   - `organizationMemberships` table:
     - `organizationId`: reference to `organizations` document
     - `userId`: reference to your `users` document (which already stores Clerk user ID)
     - role / permissions fields

   Then, in your webhook‑triggered mutations, you:

   - Upsert an org by `externalId` when you receive `organization.created` / `organization.updated`.
   - Delete it (and maybe cascade memberships) on `organization.deleted`.
   - Upsert/delete membership rows on membership events.

4. **Use Convex for authorization logic**

   Convex staff recommend keeping team/org logic in your own DB so you can do transactional checks and authorization inside Convex functions, instead of calling Clerk from within a transaction. [[Authz discussion](https://discord.com/channels/1019350475847499849/1098990952208670840)]

   Once orgs and memberships are synced into Convex:

   - Your queries/mutations can look up the caller’s `ctx.auth.getUserIdentity().subject` (Clerk user ID), join to your `users` table, then to `organizationMemberships` to enforce org‑level permissions.
   - This is the same pattern as “storing users in Convex DB” but extended to orgs.

---

Because the sources only show concrete code for **user** webhooks, not org webhooks, you’ll need to adapt that example to Clerk’s organization event payloads and event types. The high‑level pattern—**Clerk webhooks → Convex HTTP routes → internal mutations → Convex tables keyed by Clerk IDs**—is what’s documented and recommended.
