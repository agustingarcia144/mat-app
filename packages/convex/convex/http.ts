import { httpRouter } from "convex/server";
import { clerkUsersWebhook } from "./webhooks";
import { clerkOrganizationsWebhook } from "./webhooks";
import { clerkOrganizationMembershipsWebhook } from "./webhooks";

const http = httpRouter();

// Clerk webhook endpoints
http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: clerkUsersWebhook,
});

http.route({
  path: "/clerk-organizations-webhook",
  method: "POST",
  handler: clerkOrganizationsWebhook,
});

http.route({
  path: "/clerk-organization-memberships-webhook",
  method: "POST",
  handler: clerkOrganizationMembershipsWebhook,
});

export default http;
