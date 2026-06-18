import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  requireActiveOrgContext,
  requireAdmin,
  tryActiveOrgContext,
} from "./permissions";

const unsafeInternal = internal as any;
const MP_API_BASE = "https://api.mercadopago.com";
const DEFAULT_GRACE_DAYS = 3;
const ALLOWED_LITE_MODULES = [
  "dashboard",
  "members",
  "exercises",
  "planifications",
];
const ALLOWED_LITE_DASHBOARD_CARDS = ["members", "planifications"];
const ALL_MODULES = [
  "dashboard",
  "members",
  "exercises",
  "planifications",
  "classes",
  "payments",
  "finance",
  "metrics",
  "users",
  "settings",
];
const ALL_DASHBOARD_CARDS = [
  "members",
  "planifications",
  "payments",
  "classes",
];
const manualBillingSourceV = v.optional(
  v.union(v.literal("manual"), v.literal("legacy")),
);
const manualBillingPlanKeyV = v.optional(
  v.union(v.literal("pro"), v.literal("lite")),
);

type BillingStatus =
  | "active"
  | "inactive"
  | "grace_period"
  | "pending"
  | "trial";

function isMercadoPagoCheckoutEnabled() {
  return process.env.MERCADOPAGO_CHECKOUT_ENABLED === "true";
}

function isMercadoPagoSandbox() {
  return process.env.MERCADOPAGO_ENV === "sandbox";
}

function getMercadoPagoPayerEmail(checkoutPayerEmail: string) {
  if (!isMercadoPagoSandbox()) {
    return checkoutPayerEmail;
  }

  const sandboxPayer = (
    process.env.MERCADOPAGO_SANDBOX_PAYER_EMAIL ??
    process.env.MERCADOPAGO_SANDBOX_PAYER_USERNAME
  )?.trim();
  // In sandbox the TEST access token only accepts a MercadoPago test-user email.
  // Falling back to the real signed-in email here makes /preapproval respond with
  // an opaque `500 Internal server error`, so fail loudly with an actionable message.
  if (!sandboxPayer) {
    throw new Error(
      "MercadoPago sandbox requires MERCADOPAGO_SANDBOX_PAYER_EMAIL (a test-user email such as test_user_123@testuser.com). Configure it, or set MERCADOPAGO_ENV to production to charge real customers.",
    );
  }

  return sandboxPayer.includes("@")
    ? sandboxPayer
    : `${sandboxPayer}@testuser.com`;
}

async function requireSuperAdmin(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q: any) =>
      q.eq("externalId", identity.subject),
    )
    .first();

  if (user?.isSuperAdmin !== true) {
    throw new Error("Unauthorized: Super admin role required");
  }

  return identity;
}

function getLitePriceArsFromEnv() {
  const raw = process.env.MERCADOPAGO_LITE_PRICE_ARS;
  const price = raw ? Number(raw) : NaN;
  if (!Number.isFinite(price) || price < 1) {
    throw new Error("Missing or invalid MERCADOPAGO_LITE_PRICE_ARS");
  }
  return Math.round(price);
}

function getProPriceArsFromEnv() {
  const raw = process.env.MERCADOPAGO_PRO_PRICE_ARS;
  const price = raw ? Number(raw) : NaN;
  if (!Number.isFinite(price) || price < 1) {
    throw new Error("Missing or invalid MERCADOPAGO_PRO_PRICE_ARS");
  }
  return Math.round(price);
}

function getGraceMs() {
  const raw = process.env.MERCADOPAGO_BILLING_GRACE_DAYS;
  const days = raw ? Number(raw) : DEFAULT_GRACE_DAYS;
  return Math.max(0, days) * 24 * 60 * 60 * 1000;
}

function getPublicMercadoPagoReturnBaseUrl() {
  const raw = process.env.MERCADOPAGO_PUBLIC_APP_URL;
  if (!raw) {
    throw new Error("Missing MERCADOPAGO_PUBLIC_APP_URL");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MERCADOPAGO_PUBLIC_APP_URL must be a valid URL");
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (url.protocol !== "https:" || isLocalhost) {
    throw new Error(
      "MERCADOPAGO_PUBLIC_APP_URL must be a public HTTPS URL. MercadoPago rejects localhost return URLs.",
    );
  }

  return url.origin;
}

function nowWithinGrace(subscription: any, now = Date.now()) {
  return (
    subscription?.entitlementStatus === "grace_period" &&
    typeof subscription.graceUntil === "number" &&
    subscription.graceUntil > now
  );
}

function nowWithinTrial(subscription: any, now = Date.now()) {
  return (
    subscription?.entitlementStatus === "trial" &&
    typeof subscription.trialEndsAt === "number" &&
    subscription.trialEndsAt > now
  );
}

function toBillingStatus(subscription: any | null): BillingStatus {
  if (!subscription) return "inactive";
  if (subscription.entitlementStatus === "active") return "active";
  if (nowWithinTrial(subscription)) return "trial";
  if (nowWithinGrace(subscription)) return "grace_period";
  if (subscription.status === "pending") return "pending";
  return "inactive";
}

function parseDateMs(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function mapMercadoPagoStatus(resource: any, existing: any | null) {
  const rawStatus = String(resource?.status ?? "").toLowerCase();
  const paymentStatus = String(
    resource?.last_payment_status ?? resource?.status_detail ?? "",
  ).toLowerCase();
  const now = Date.now();

  if (rawStatus === "authorized") {
    return {
      status: "authorized" as const,
      entitlementStatus: "active" as const,
      lastPaymentStatus: "approved" as const,
      graceUntil: undefined,
    };
  }

  if (rawStatus === "pending") {
    return {
      status: "pending" as const,
      entitlementStatus: "inactive" as const,
      lastPaymentStatus: "pending" as const,
      graceUntil: undefined,
    };
  }

  if (rawStatus === "paused") {
    return {
      status: "paused" as const,
      entitlementStatus: "inactive" as const,
      lastPaymentStatus: "unknown" as const,
      graceUntil: undefined,
    };
  }

  if (rawStatus === "cancelled" || rawStatus === "cancelled_process") {
    return {
      status: "cancelled" as const,
      entitlementStatus: "inactive" as const,
      lastPaymentStatus: "unknown" as const,
      graceUntil: undefined,
    };
  }

  if (paymentStatus.includes("reject") || paymentStatus.includes("fail")) {
    const hadAccess =
      existing?.entitlementStatus === "active" || nowWithinGrace(existing, now);
    return {
      status: "payment_failed" as const,
      entitlementStatus: hadAccess
        ? ("grace_period" as const)
        : ("inactive" as const),
      lastPaymentStatus: "rejected" as const,
      graceUntil: hadAccess ? now + getGraceMs() : undefined,
    };
  }

  return {
    status: "payment_failed" as const,
    entitlementStatus:
      existing?.entitlementStatus === "active"
        ? ("grace_period" as const)
        : ("inactive" as const),
    lastPaymentStatus: "unknown" as const,
    graceUntil:
      existing?.entitlementStatus === "active" ? now + getGraceMs() : undefined,
  };
}

// Payment resources (`/v1/payments/:id`) report a different status vocabulary
// than preapprovals — e.g. an authorized subscription charge is `approved`, not
// `authorized`. Map those so an approved subscription payment activates access.
function mapMercadoPagoPaymentStatus(resource: any, existing: any | null) {
  const status = String(resource?.status ?? "").toLowerCase();
  const now = Date.now();

  if (status === "approved") {
    return {
      status: "authorized" as const,
      entitlementStatus: "active" as const,
      lastPaymentStatus: "approved" as const,
      graceUntil: undefined,
    };
  }

  if (status === "pending" || status === "in_process" || status === "authorized") {
    return {
      status: "pending" as const,
      // Don't revoke access an active subscription already has while a renewal
      // charge is still being processed.
      entitlementStatus:
        existing?.entitlementStatus === "active"
          ? ("active" as const)
          : ("inactive" as const),
      lastPaymentStatus: "pending" as const,
      graceUntil: undefined,
    };
  }

  if (
    status === "rejected" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "charged_back"
  ) {
    const hadAccess =
      existing?.entitlementStatus === "active" || nowWithinGrace(existing, now);
    return {
      status: "payment_failed" as const,
      entitlementStatus: hadAccess
        ? ("grace_period" as const)
        : ("inactive" as const),
      lastPaymentStatus: "rejected" as const,
      graceUntil: hadAccess ? now + getGraceMs() : undefined,
    };
  }

  // Unknown payment status: leave the subscription as-is rather than downgrade.
  return {
    status: (existing?.status ?? "pending") as
      | "pending"
      | "authorized"
      | "paused"
      | "cancelled"
      | "expired"
      | "payment_failed",
    entitlementStatus: (existing?.entitlementStatus ?? "inactive") as
      | "active"
      | "inactive"
      | "grace_period"
      | "trial",
    lastPaymentStatus: "unknown" as const,
    graceUntil: existing?.graceUntil,
  };
}

export const getCurrentEntitlement = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return {
        billingStatus: "inactive" as const,
        planKey: null,
        referencePriceUsd: 10,
        priceArs: null,
        modules: [],
        dashboardCards: [],
        graceUntil: undefined,
        trialEndsAt: undefined,
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", orgCtx.identity.subject),
      )
      .first();

    if (currentUser?.isSuperAdmin === true) {
      const plan = await ctx.db
        .query("appBillingPlans")
        .withIndex("by_key", (q: any) => q.eq("key", "lite"))
        .first();
      return {
        billingStatus: "active" as const,
        planKey: plan?.key ?? "super_admin",
        referencePriceUsd: plan?.referencePriceUsd ?? 10,
        priceArs: plan?.priceArs ?? null,
        modules: ALL_MODULES,
        dashboardCards: ALL_DASHBOARD_CARDS,
        graceUntil: undefined,
        trialEndsAt: undefined,
      };
    }

    const subscription = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .order("desc")
      .first();

    const plan = subscription
      ? await ctx.db.get(subscription.billingPlanId)
      : await ctx.db
          .query("appBillingPlans")
          .withIndex("by_key", (q) => q.eq("key", "lite"))
          .first();

    const status = toBillingStatus(subscription);
    const grantsPlanModules = status === "active" || status === "grace_period";

    return {
      billingStatus: status,
      planKey: plan?.key ?? null,
      referencePriceUsd: plan?.referencePriceUsd ?? 10,
      priceArs: plan?.priceArs ?? null,
      modules: grantsPlanModules
        ? (plan?.entitlements.modules ?? [])
        : status === "trial"
          ? ALL_MODULES
          : [],
      dashboardCards: grantsPlanModules
        ? (plan?.entitlements.dashboardCards ?? [])
        : status === "trial"
          ? ALL_DASHBOARD_CARDS
          : [],
      graceUntil: subscription?.graceUntil,
      trialEndsAt: subscription?.trialEndsAt,
    };
  },
});

export const getCurrentBilling = query({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireActiveOrgContext(ctx);
    const subscription = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .order("desc")
      .first();
    const plan = subscription
      ? await ctx.db.get(subscription.billingPlanId)
      : await ctx.db
          .query("appBillingPlans")
          .withIndex("by_key", (q) => q.eq("key", "lite"))
          .first();

    return {
      subscription,
      plan,
      billingStatus: toBillingStatus(subscription),
    };
  },
});

export const createCheckout = action({
  args: {
    planKey: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
  },
  handler: async (ctx, args): Promise<{ initPoint: string }> => {
    if (!isMercadoPagoCheckoutEnabled()) {
      throw new Error("MercadoPago checkout is not enabled");
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN");
    }

    const publicAppUrl = getPublicMercadoPagoReturnBaseUrl();

    const webhookUrl = process.env.MERCADOPAGO_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("Missing MERCADOPAGO_WEBHOOK_URL");
    }

    const planKey = args.planKey ?? "lite";
    const planId =
      planKey === "pro"
        ? await ctx.runMutation(
            unsafeInternal.appBillingPlans.ensureProPlanInternal,
            { priceArs: getProPriceArsFromEnv() },
          )
        : await ctx.runMutation(
            unsafeInternal.appBillingPlans.ensureLitePlanInternal,
            { priceArs: getLitePriceArsFromEnv() },
          );

    const checkout = await ctx.runMutation(
      unsafeInternal.organizationBilling.prepareCheckoutInternal,
      { billingPlanId: planId },
    );

    const response = await fetch(`${MP_API_BASE}/preapproval`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: `MAT - ${checkout.plan.name}`,
        external_reference: checkout.externalReference,
        payer_email: getMercadoPagoPayerEmail(checkout.payerEmail),
        auto_recurring: {
          frequency: checkout.plan.frequency,
          frequency_type: checkout.plan.frequencyType,
          transaction_amount: checkout.plan.priceArs,
          currency_id: "ARS",
        },
        back_url: `${publicAppUrl}/dashboard/billing?mp_status=return`,
        notification_url: webhookUrl,
        status: "pending",
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // Log full context server-side (no secrets) so opaque MercadoPago 5xx
      // responses can be diagnosed from the Convex logs.
      console.error("MercadoPago createCheckout failed", {
        status: response.status,
        response: payload,
        planKey,
        sandbox: isMercadoPagoSandbox(),
        payerEmail: getMercadoPagoPayerEmail(checkout.payerEmail),
        externalReference: checkout.externalReference,
      });
      const hint =
        response.status >= 500
          ? " MercadoPago rejected the request — verify the access token matches MERCADOPAGO_ENV (TEST token ⇄ sandbox) and that the payer email is not the seller's own MercadoPago account."
          : "";
      throw new Error(
        `MercadoPago checkout failed: ${response.status} ${JSON.stringify(payload)}.${hint}`,
      );
    }

    const preapprovalId = payload?.id;
    const initPoint = isMercadoPagoSandbox()
      ? payload?.sandbox_init_point || payload?.init_point
      : payload?.init_point || payload?.sandbox_init_point;

    if (!preapprovalId || !initPoint) {
      throw new Error("MercadoPago checkout response missing init point");
    }

    await ctx.runMutation(
      unsafeInternal.organizationBilling.markCheckoutCreatedInternal,
      {
        subscriptionId: checkout.subscriptionId,
        mercadoPagoPreapprovalId: String(preapprovalId),
      },
    );

    return { initPoint: String(initPoint) };
  },
});

export const cancelCurrentSubscription = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const subscription = await ctx.runQuery(
      unsafeInternal.organizationBilling
        .getCurrentSubscriptionForCancelInternal,
      {},
    );

    if (subscription?.mercadoPagoPreapprovalId) {
      if (!isMercadoPagoCheckoutEnabled()) {
        throw new Error("MercadoPago checkout is not enabled");
      }

      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN");
      }

      const response = await fetch(
        `${MP_API_BASE}/preapproval/${encodeURIComponent(
          subscription.mercadoPagoPreapprovalId,
        )}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "cancelled" }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          `MercadoPago cancellation failed: ${response.status} ${JSON.stringify(
            payload,
          )}`,
        );
      }
    }

    if (subscription) {
      await ctx.runMutation(
        unsafeInternal.organizationBilling.cancelSubscriptionInternal,
        { subscriptionId: subscription._id },
      );
    }

    return { ok: true };
  },
});

export const getCurrentSubscriptionForCancelInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireActiveOrgContext(ctx);
    await requireAdmin(ctx, membership.organizationId);
    return await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .order("desc")
      .first();
  },
});

// Force a re-pull of the current org's preapproval from MercadoPago and sync it.
// Recovers a paid subscription whose activating webhook was missed or deduped
// (the preapproval is the authoritative source for `authorized` → active).
export const resyncCurrentSubscription = action({
  args: {},
  handler: async (ctx): Promise<{ synced: boolean }> => {
    if (!isMercadoPagoCheckoutEnabled()) {
      throw new Error("MercadoPago checkout is not enabled");
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN");
    }

    const subscription = await ctx.runQuery(
      unsafeInternal.organizationBilling
        .getCurrentSubscriptionForCancelInternal,
      {},
    );
    if (!subscription?.mercadoPagoPreapprovalId) {
      throw new Error("No hay una suscripción de MercadoPago para sincronizar");
    }

    const response = await fetch(
      `${MP_API_BASE}/preapproval/${encodeURIComponent(
        subscription.mercadoPagoPreapprovalId,
      )}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const resource = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `MercadoPago resync failed: ${response.status} ${JSON.stringify(resource)}`,
      );
    }

    const result = await ctx.runMutation(
      unsafeInternal.organizationBilling.syncFromMercadoPagoInternal,
      { resource, resourceType: "preapproval" },
    );

    return { synced: Boolean(result?.synced) };
  },
});

export const cancelSubscriptionInternal = internalMutation({
  args: {
    subscriptionId: v.id("organizationBillingSubscriptions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      status: "cancelled",
      entitlementStatus: "inactive",
      updatedAt: Date.now(),
    });
  },
});

export const prepareCheckoutInternal = internalMutation({
  args: {
    billingPlanId: v.id("appBillingPlans"),
  },
  handler: async (ctx, args) => {
    const { identity, membership } = await requireActiveOrgContext(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const plan = await ctx.db.get(args.billingPlanId);
    if (!plan || !plan.isActive) {
      throw new Error("Billing plan not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
    const payerEmail = user?.email;
    if (!payerEmail) {
      throw new Error(
        "Current user email is required for MercadoPago checkout",
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .order("desc")
      .first();

    if (existing?.entitlementStatus === "active") {
      throw new Error("Organization already has active billing");
    }

    // Reuse an in-flight MercadoPago checkout as-is to avoid duplicate preapprovals.
    if (existing && existing.source === "mercadopago" && existing.status === "pending") {
      if (existing.billingPlanId !== args.billingPlanId) {
        await ctx.db.patch(existing._id, {
          billingPlanId: args.billingPlanId,
          updatedAt: now,
        });
      }
      return {
        subscriptionId: existing._id,
        externalReference: existing.externalReference,
        payerEmail,
        plan,
      };
    }

    const externalReference = `org:${membership.organizationId}:billing:${now}`;

    // Convert an existing row (e.g. a trial) into a pending MercadoPago checkout,
    // preserving trial access (entitlementStatus + trialEndsAt) until the webhook
    // authorizes the payment.
    if (existing) {
      await ctx.db.patch(existing._id, {
        billingPlanId: args.billingPlanId,
        source: "mercadopago",
        mercadoPagoPayerEmail: payerEmail,
        externalReference,
        status: "pending",
        lastPaymentStatus: "pending",
        updatedAt: now,
      });
      return {
        subscriptionId: existing._id,
        externalReference,
        payerEmail,
        plan,
      };
    }

    const subscriptionId = await ctx.db.insert(
      "organizationBillingSubscriptions",
      {
        organizationId: membership.organizationId,
        billingPlanId: args.billingPlanId,
        source: "mercadopago",
        mercadoPagoPayerEmail: payerEmail,
        externalReference,
        status: "pending",
        entitlementStatus: "inactive",
        lastPaymentStatus: "pending",
        createdBy: identity.subject,
        createdAt: now,
        updatedAt: now,
      },
    );

    return {
      subscriptionId,
      externalReference,
      payerEmail,
      plan,
    };
  },
});

export const activateOrganizationManually = mutation({
  args: {
    organizationId: v.id("organizations"),
    billingPlanId: v.optional(v.id("appBillingPlans")),
    planKey: manualBillingPlanKeyV,
    source: manualBillingSourceV,
  },
  handler: async (ctx, args) => {
    const identity = await requireSuperAdmin(ctx);
    return await activateOrganizationAccess(ctx, args, identity.subject);
  },
});

export const activateOrganizationManuallyInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    billingPlanId: v.optional(v.id("appBillingPlans")),
    planKey: manualBillingPlanKeyV,
    litePriceArs: v.optional(v.number()),
    proPriceArs: v.optional(v.number()),
    source: manualBillingSourceV,
  },
  handler: async (ctx, args) => {
    return await activateOrganizationAccess(ctx, args, "convex-dashboard");
  },
});

async function activateOrganizationAccess(
  ctx: any,
  args: {
    organizationId: any;
    billingPlanId?: any;
    planKey?: "pro" | "lite";
    litePriceArs?: number;
    proPriceArs?: number;
    source?: "manual" | "legacy";
  },
  createdBy: string,
) {
  const organization = await ctx.db.get(args.organizationId);
  if (!organization) {
    throw new Error("Organization not found");
  }

  const source = args.source ?? "manual";
  const planKey = args.planKey ?? "pro";
  let plan = args.billingPlanId ? await ctx.db.get(args.billingPlanId) : null;

  if (!plan && planKey === "pro") {
    const planId = await ctx.runMutation(
      unsafeInternal.appBillingPlans.ensureProPlanInternal,
      { priceArs: args.proPriceArs },
    );
    plan = await ctx.db.get(planId);
  }

  if (!plan && planKey === "lite") {
    plan = await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q: any) => q.eq("key", "lite"))
      .first();

    if ((!plan || !plan.isActive) && args.litePriceArs !== undefined) {
      const planId = await ctx.runMutation(
        unsafeInternal.appBillingPlans.ensureLitePlanInternal,
        { priceArs: args.litePriceArs },
      );
      plan = await ctx.db.get(planId);
    }
  }

  if (!plan || !plan.isActive) {
    throw new Error(
      "Active billing plan not found. Pass a valid billingPlanId or planKey.",
    );
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("organizationBillingSubscriptions")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", args.organizationId),
    )
    .order("desc")
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      billingPlanId: plan._id,
      source,
      status: "authorized",
      entitlementStatus: "active",
      lastPaymentStatus: "approved",
      graceUntil: undefined,
      updatedAt: now,
    });
    return { subscriptionId: existing._id, updated: true };
  }

  const subscriptionId = await ctx.db.insert(
    "organizationBillingSubscriptions",
    {
      organizationId: args.organizationId,
      billingPlanId: plan._id,
      source,
      externalReference: `${source}:${args.organizationId}:${now}`,
      status: "authorized",
      entitlementStatus: "active",
      lastPaymentStatus: "approved",
      createdBy,
      createdAt: now,
      updatedAt: now,
    },
  );

  return { subscriptionId, updated: false };
}

export const suspendOrganizationBillingManually = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await suspendOrganizationAccess(ctx, args.organizationId);
  },
});

export const suspendOrganizationBillingManuallyInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    return await suspendOrganizationAccess(ctx, args.organizationId);
  },
});

async function suspendOrganizationAccess(ctx: any, organizationId: any) {
  const subscription = await ctx.db
    .query("organizationBillingSubscriptions")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .first();

  if (!subscription) {
    throw new Error("Organization has no billing subscription");
  }

  await ctx.db.patch(subscription._id, {
    status: "cancelled",
    entitlementStatus: "inactive",
    graceUntil: undefined,
    updatedAt: Date.now(),
  });

  return { subscriptionId: subscription._id };
}

export const markCheckoutCreatedInternal = internalMutation({
  args: {
    subscriptionId: v.id("organizationBillingSubscriptions"),
    mercadoPagoPreapprovalId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      source: "mercadopago",
      mercadoPagoPreapprovalId: args.mercadoPagoPreapprovalId,
      updatedAt: Date.now(),
    });
  },
});

export const beginWebhookProcessingInternal = internalMutation({
  args: {
    eventId: v.string(),
    requestId: v.string(),
    type: v.string(),
    action: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    resourceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mercadoPagoWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing?.status === "processed" || existing?.status === "ignored") {
      return { alreadyProcessed: true };
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        status: "processing",
        receivedAt: now,
        error: undefined,
      });
      return { alreadyProcessed: false };
    }

    await ctx.db.insert("mercadoPagoWebhookEvents", {
      ...args,
      status: "processing",
      receivedAt: now,
    });

    return { alreadyProcessed: false };
  },
});

export const markWebhookProcessedInternal = internalMutation({
  args: {
    eventId: v.string(),
    status: v.union(v.literal("processed"), v.literal("ignored")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mercadoPagoWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (!existing) return;
    await ctx.db.patch(existing._id, {
      status: args.status,
      processedAt: Date.now(),
      error: undefined,
    });
  },
});

export const markWebhookFailedInternal = internalMutation({
  args: {
    eventId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mercadoPagoWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (!existing) return;
    await ctx.db.patch(existing._id, {
      status: "failed",
      processedAt: Date.now(),
      error: args.error,
    });
  },
});

export const syncFromMercadoPagoInternal = internalMutation({
  args: {
    resource: v.any(),
    resourceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resource = args.resource;
    const isPayment =
      args.resourceType === "payment" ||
      resource?.operation_type === "recurring_payment";

    // For a preapproval, `resource.id` is the preapproval id. For a payment,
    // `resource.id` is the PAYMENT id — the preapproval is only referenced
    // indirectly, so never treat a payment id as a preapproval id.
    const preapprovalId = isPayment
      ? (resource?.metadata?.preapproval_id ?? resource?.preapproval_id)
      : (resource?.id ?? resource?.preapproval_id ?? resource?.preapproval?.id);
    const externalReference =
      resource?.external_reference ?? resource?.metadata?.external_reference;

    let subscription = null;
    if (preapprovalId) {
      subscription = await ctx.db
        .query("organizationBillingSubscriptions")
        .withIndex("by_mercadoPagoPreapprovalId", (q) =>
          q.eq("mercadoPagoPreapprovalId", String(preapprovalId)),
        )
        .first();
    }

    if (!subscription && externalReference) {
      subscription = await ctx.db
        .query("organizationBillingSubscriptions")
        .withIndex("by_externalReference", (q) =>
          q.eq("externalReference", String(externalReference)),
        )
        .first();
    }

    if (!subscription) {
      return { synced: false };
    }

    const mapped = isPayment
      ? mapMercadoPagoPaymentStatus(resource, subscription)
      : mapMercadoPagoStatus(resource, subscription);
    await ctx.db.patch(subscription._id, {
      source: subscription.source ?? "mercadopago",
      // Only a preapproval resource can set the preapproval id.
      mercadoPagoPreapprovalId:
        !isPayment && preapprovalId
          ? String(preapprovalId)
          : subscription.mercadoPagoPreapprovalId,
      status: mapped.status,
      entitlementStatus: mapped.entitlementStatus,
      currentPeriodStart:
        parseDateMs(resource?.summarized?.last_charged_date) ??
        parseDateMs(resource?.last_charged_date) ??
        parseDateMs(resource?.date_approved) ??
        subscription.currentPeriodStart,
      currentPeriodEnd:
        parseDateMs(resource?.next_payment_date) ??
        subscription.currentPeriodEnd,
      lastPaymentStatus: mapped.lastPaymentStatus,
      lastPaymentId: isPayment
        ? resource?.id != null
          ? String(resource.id)
          : subscription.lastPaymentId
        : resource?.last_payment_id != null
          ? String(resource.last_payment_id)
          : subscription.lastPaymentId,
      lastWebhookAt: Date.now(),
      graceUntil: mapped.graceUntil,
      updatedAt: Date.now(),
    });

    return { synced: true };
  },
});

export function liteAllowsModule(module: string, modules: string[]) {
  return modules.includes(module);
}

export { ALLOWED_LITE_MODULES, ALLOWED_LITE_DASHBOARD_CARDS };
