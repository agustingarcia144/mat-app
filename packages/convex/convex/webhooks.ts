import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

/**
 * Clerk webhook handler for users
 * Handles: user.created, user.updated, user.deleted
 */
export const clerkUsersWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!webhookSecret) {
    console.error("Missing CLERK_WEBHOOK_SIGNING_SECRET environment variable");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Get the headers
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await request.text();

  // Verify the webhook
  const wh = new Webhook(webhookSecret);
  let evt: any;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as any;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }

  // Handle the event
  const eventType = evt.type;

  try {
    switch (eventType) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: evt.data,
        });
        break;

      case "user.deleted": {
        const clerkUserId = evt.data.id;
        if (clerkUserId) {
          await ctx.runMutation(internal.users.deleteFromClerk, {
            clerkUserId,
          });
        }
        break;
      }

      default:
        console.log("Ignored Clerk webhook event:", eventType);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Error processing webhook", { status: 500 });
  }
});

/**
 * Clerk webhook handler for organizations
 * Handles: organization.created, organization.updated, organization.deleted
 */
export const clerkOrganizationsWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!webhookSecret) {
    console.error("Missing CLERK_WEBHOOK_SIGNING_SECRET environment variable");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Get the headers
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await request.text();

  // Verify the webhook
  const wh = new Webhook(webhookSecret);
  let evt: any;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as any;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }

  // Handle the event
  const eventType = evt.type;

  try {
    switch (eventType) {
      case "organization.created":
      case "organization.updated":
        await ctx.runMutation(internal.organizations.upsertFromClerk, {
          data: evt.data,
        });
        break;

      case "organization.deleted": {
        const clerkOrgId = evt.data.id;
        if (clerkOrgId) {
          await ctx.runMutation(internal.organizations.deleteFromClerk, {
            clerkOrgId,
          });
        }
        break;
      }

      default:
        console.log("Ignored Clerk webhook event:", eventType);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Error processing webhook", { status: 500 });
  }
});

/**
 * Clerk webhook handler for organization memberships
 * Handles: organizationMembership.created, organizationMembership.updated, organizationMembership.deleted
 */
export const clerkOrganizationMembershipsWebhook = httpAction(
  async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    if (!webhookSecret) {
      console.error(
        "Missing CLERK_WEBHOOK_SIGNING_SECRET environment variable"
      );
      return new Response("Webhook secret not configured", { status: 500 });
    }

    // Get the headers
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    // Get the body
    const payload = await request.text();

    // Verify the webhook
    const wh = new Webhook(webhookSecret);
    let evt: any;

    try {
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as any;
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return new Response("Error verifying webhook", { status: 400 });
    }

    // Handle the event
    const eventType = evt.type;

    try {
      switch (eventType) {
        case "organizationMembership.created":
        case "organizationMembership.updated":
          await ctx.runMutation(
            internal.organizationMemberships.upsertFromClerk,
            {
              data: evt.data,
            }
          );
          break;

        case "organizationMembership.deleted": {
          const clerkOrgId = evt.data.organization_id;
          const clerkUserId =
            evt.data.public_user_data?.user_id || evt.data.user_id;
          if (clerkOrgId && clerkUserId) {
            await ctx.runMutation(
              internal.organizationMemberships.deleteFromClerk,
              {
                clerkOrgId,
                clerkUserId,
              }
            );
          }
          break;
        }

        default:
          console.log("Ignored Clerk webhook event:", eventType);
      }

      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }
);
