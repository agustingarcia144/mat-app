import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks";
import { httpJoinPreview } from "./joinGym";
import { mercadoPagoWebhook } from "./mercadoPagoWebhook";

const http = httpRouter();

// Unified Clerk webhook endpoint
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

http.route({
  path: "/mercadopago-webhook",
  method: "POST",
  handler: mercadoPagoWebhook,
});

// Public join preview for web fallback (GET /join/<token>)
http.route({
  pathPrefix: "/join/",
  method: "GET",
  handler: httpJoinPreview,
});

export default http;
