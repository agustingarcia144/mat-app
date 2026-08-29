import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks";
import { httpJoinPreview } from "./joinGym";
import { mercadoPagoWebhook } from "./mercadoPagoWebhook";
import {
  mercadoPagoMemberWebhook,
  mercadoPagoOAuthCallback,
} from "./memberPaymentsHttp";
import {
  appleDeleteRegistration,
  appleGetLatestPass,
  appleListDevicePasses,
  appleLog,
  appleRegisterDevice,
} from "./walletHttp";

const http = httpRouter();

// Unified Clerk webhook endpoint
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

// Apple Wallet pass-update web service. Authentication follows Apple's
// ApplePass bearer protocol and uses a server-derived per-pass token.
http.route({
  pathPrefix: "/wallet/apple/v1/devices/",
  method: "POST",
  handler: appleRegisterDevice,
});
http.route({
  pathPrefix: "/wallet/apple/v1/devices/",
  method: "DELETE",
  handler: appleDeleteRegistration,
});
http.route({
  pathPrefix: "/wallet/apple/v1/devices/",
  method: "GET",
  handler: appleListDevicePasses,
});
http.route({
  pathPrefix: "/wallet/apple/v1/passes/",
  method: "GET",
  handler: appleGetLatestPass,
});
http.route({
  path: "/wallet/apple/v1/log",
  method: "POST",
  handler: appleLog,
});

// Organization -> MAT SaaS billing. Uses MAT's own global seller credential;
// member payments must never be routed here.
http.route({
  path: "/mercadopago-webhook",
  method: "POST",
  handler: mercadoPagoWebhook,
});

// Member -> gym payments: per-gym MercadoPago OAuth connection callback.
http.route({
  path: "/member-payments/oauth/callback",
  method: "GET",
  handler: mercadoPagoOAuthCallback,
});

// Member payment notifications. The path carries a per-connection random
// routing key that selects the gym whose token fetches the resource.
http.route({
  pathPrefix: "/member-payments/webhook/",
  method: "POST",
  handler: mercadoPagoMemberWebhook,
});

// Public join preview for web fallback (GET /join/<token>)
http.route({
  pathPrefix: "/join/",
  method: "GET",
  handler: httpJoinPreview,
});

export default http;
