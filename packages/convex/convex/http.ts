import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks";

const http = httpRouter();

// Unified Clerk webhook endpoint
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
