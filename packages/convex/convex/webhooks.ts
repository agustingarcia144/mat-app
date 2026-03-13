import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const MAX_WEBHOOK_AGE_MS = 10 * 60 * 1000;
const unsafeInternal = internal as any;

function extractObjectId(data: any): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  return (
    data.id ||
    data.organization_id ||
    data.user_id ||
    data.public_user_data?.user_id ||
    data.object?.id
  );
}

/**
 * Clerk webhook handler.
 * Organizations and memberships are now managed in Convex, so only user events
 * are processed here.
 */
export const clerkWebhook = httpAction(async (ctx, request) => {
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

  const parsedTimestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(parsedTimestampSeconds)) {
    return new Response("Invalid svix timestamp", { status: 400 });
  }

  // Fast idempotency check before any heavy processing.
  const existingEvent = await ctx.runQuery(unsafeInternal.webhookEvents.getBySvixId, {
    svixId,
  });
  if (existingEvent?.status === "processed") {
    return new Response(null, { status: 200 });
  }

  const eventAgeMs = Math.abs(Date.now() - parsedTimestampSeconds * 1000);
  if (eventAgeMs > MAX_WEBHOOK_AGE_MS) {
    return new Response("Stale webhook timestamp", { status: 400 });
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
  const objectId = extractObjectId(evt.data);

  const processingState = await ctx.runMutation(
    unsafeInternal.webhookEvents.beginProcessing,
    {
      svixId,
      svixTimestamp: parsedTimestampSeconds * 1000,
      eventType,
      objectId,
    }
  );

  if (processingState.alreadyProcessed) {
    return new Response(null, { status: 200 });
  }

  try {
    switch (eventType) {
      // User events
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

    await ctx.runMutation(unsafeInternal.webhookEvents.markProcessed, {
      svixId,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    await ctx.runMutation(unsafeInternal.webhookEvents.markFailed, {
      svixId,
      error:
        error instanceof Error ? error.message : "Unknown webhook processing error",
    });
    return new Response("Error processing webhook", { status: 500 });
  }
});
