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

type BillingStatus = "active" | "inactive" | "grace_period" | "pending";

function isMercadoPagoCheckoutEnabled() {
  return process.env.MERCADOPAGO_CHECKOUT_ENABLED === "true";
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
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";
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

function toBillingStatus(subscription: any | null): BillingStatus {
  if (!subscription) return "inactive";
  if (subscription.entitlementStatus === "active") return "active";
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
        .withIndex("by_key", (q) => q.eq("key", "lite"))
        .first();
      return {
        billingStatus: "active" as const,
        planKey: plan?.key ?? "super_admin",
        referencePriceUsd: plan?.referencePriceUsd ?? 10,
        priceArs: plan?.priceArs ?? null,
        modules: ALL_MODULES,
        dashboardCards: ALL_DASHBOARD_CARDS,
        graceUntil: undefined,
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

    return {
      billingStatus: toBillingStatus(subscription),
      planKey: plan?.key ?? null,
      referencePriceUsd: plan?.referencePriceUsd ?? 10,
      priceArs: plan?.priceArs ?? null,
      modules:
        toBillingStatus(subscription) === "active" ||
        toBillingStatus(subscription) === "grace_period"
          ? (plan?.entitlements.modules ?? [])
          : [],
      dashboardCards:
        toBillingStatus(subscription) === "active" ||
        toBillingStatus(subscription) === "grace_period"
          ? (plan?.entitlements.dashboardCards ?? [])
          : [],
      graceUntil: subscription?.graceUntil,
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
  args: {},
  handler: async (ctx): Promise<{ initPoint: string }> => {
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

    const planId = await ctx.runMutation(
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
        payer_email: checkout.payerEmail,
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
      throw new Error(
        `MercadoPago checkout failed: ${response.status} ${JSON.stringify(payload)}`,
      );
    }

    const preapprovalId = payload?.id;
    const initPoint =
      process.env.MERCADOPAGO_ENV === "sandbox"
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

    if (existing?.status === "pending") {
      return {
        subscriptionId: existing._id,
        externalReference: existing.externalReference,
        payerEmail,
        plan,
      };
    }

    const externalReference = `org:${membership.organizationId}:billing:${now}`;
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
    source: v.optional(v.union(v.literal("manual"), v.literal("legacy"))),
  },
  handler: async (ctx, args) => {
    const identity = await requireSuperAdmin(ctx);
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const plan = args.billingPlanId
      ? await ctx.db.get(args.billingPlanId)
      : await ctx.db
          .query("appBillingPlans")
          .withIndex("by_key", (q) => q.eq("key", "lite"))
          .first();

    if (!plan || !plan.isActive) {
      throw new Error("Active billing plan not found");
    }

    const now = Date.now();
    const source = args.source ?? "manual";
    const existing = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
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
        createdBy: identity.subject,
        createdAt: now,
        updatedAt: now,
      },
    );

    return { subscriptionId, updated: false };
  },
});

export const suspendOrganizationBillingManually = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const subscription = await ctx.db
      .query("organizationBillingSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
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
  },
});

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
  },
  handler: async (ctx, args) => {
    const resource = args.resource;
    const preapprovalId =
      resource?.id ?? resource?.preapproval_id ?? resource?.preapproval?.id;
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

    const mapped = mapMercadoPagoStatus(resource, subscription);
    await ctx.db.patch(subscription._id, {
      source: subscription.source ?? "mercadopago",
      mercadoPagoPreapprovalId: preapprovalId
        ? String(preapprovalId)
        : subscription.mercadoPagoPreapprovalId,
      status: mapped.status,
      entitlementStatus: mapped.entitlementStatus,
      currentPeriodStart:
        parseDateMs(resource?.summarized?.last_charged_date) ??
        parseDateMs(resource?.last_charged_date) ??
        subscription.currentPeriodStart,
      currentPeriodEnd:
        parseDateMs(resource?.next_payment_date) ??
        subscription.currentPeriodEnd,
      lastPaymentStatus: mapped.lastPaymentStatus,
      lastPaymentId:
        resource?.last_payment_id != null
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
