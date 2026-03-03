import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks";
import { httpJoinPreview } from "./joinGym";

const http = httpRouter();

// Unified Clerk webhook endpoint
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

// Public join preview for web fallback (GET /join/<token>)
http.route({
  pathPrefix: "/join/",
  method: "GET",
  handler: httpJoinPreview,
});

export default http;
