/**
 * Member-facing checkout: what a member may pay with, and the local state that
 * has to exist before Mercado Pago is ever called.
 *
 * Two rules shape this module:
 *
 * 1. Every amount is computed here, on the server, from the plan price, the
 *    active family size and the current bonification. Nothing about money is
 *    accepted from the mobile app.
 * 2. The local subscription, agreement and checkout session are written before
 *    the provider call, so a lost response is recoverable by external
 *    reference instead of producing a second agreement.
 */

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireAuth,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import {
  computeAdvanceTotalArs,
  computeCancellationAccessEndsAt,
  computeCommissionArs,
  computeEffectiveCycleAmountArs,
  getAdvanceBillingCycles,
  getPaymentTimezone,
} from "./billingDomain";
import {
  buildExternalReference,
  evaluatePaymentMethods,
  isConnectionUsable,
  isLiveAgreementStatus,
  type PaymentMethodOption,
} from "./memberPaymentDomain";
import { isMemberMercadoPagoEnabled } from "./memberPaymentsEnv";
import { getMemberPaymentSettings } from "./organizationSettings";
import { getOrganizationMemberPaymentPolicy } from "./appBillingPlans";
import { internal } from "./_generated/api";
import { enqueueProviderOperation } from "./memberPayments";
import { randomHex } from "./memberPaymentsCrypto";

/** A checkout link is only good for a short window. */
export const CHECKOUT_SESSION_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

type BillingContext = {
  billingSubscription: Doc<"memberPlanSubscriptions"> | null;
  isFamilyChild: boolean;
  coveredMemberCount: number;
  bonification: Doc<"planBonifications"> | null;
};

/**
 * The subscription that is actually billed for this member, how many active
 * members it covers, and any bonification in force.
 *
 * A family child never pays: billing resolves to the parent subscription.
 */
async function resolveBillingContext(
  ctx: { db: any },
  subscription: Doc<"memberPlanSubscriptions"> | null,
): Promise<BillingContext> {
  if (!subscription) {
    return {
      billingSubscription: null,
      isFamilyChild: false,
      coveredMemberCount: 1,
      bonification: null,
    };
  }

  const billingSubscription = subscription.familyParentSubscriptionId
    ? await ctx.db.get(subscription.familyParentSubscriptionId)
    : subscription;

  if (!billingSubscription) {
    throw new Error("Suscripción principal no encontrada");
  }

  const children = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_family_parent", (q: any) =>
      q.eq("familyParentSubscriptionId", billingSubscription._id),
    )
    .collect();

  const group = [billingSubscription, ...children].filter(
    (item: any) => item.status !== "cancelled",
  );

  // Only members who are still active in the gym are charged for.
  const activeMemberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", billingSubscription.organizationId),
    )
    .filter((q: any) =>
      q.and(q.eq(q.field("role"), "member"), q.eq(q.field("status"), "active")),
    )
    .collect();
  const activeUserIds = new Set<string>(
    activeMemberships.map((membership: any) => String(membership.userId)),
  );

  const covered = group.filter((item: any) => activeUserIds.has(item.userId));

  const bonification = await ctx.db
    .query("planBonifications")
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("subscriptionId", billingSubscription._id).eq("status", "active"),
    )
    .first();

  return {
    billingSubscription,
    isFamilyChild: Boolean(subscription.familyParentSubscriptionId),
    coveredMemberCount: Math.max(1, covered.length),
    bonification: bonification ?? null,
  };
}

async function findLiveAgreement(
  ctx: { db: any },
  subscriptionId: Id<"memberPlanSubscriptions">,
) {
  const agreements = await ctx.db
    .query("memberRecurringAgreements")
    .withIndex("by_subscription", (q: any) =>
      q.eq("subscriptionId", subscriptionId),
    )
    .collect();

  return (
    agreements.find((agreement: any) => isLiveAgreementStatus(agreement.status)) ??
    null
  );
}

async function getConnection(
  ctx: { db: any },
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationPaymentProviderConnections")
    .withIndex("by_organization_provider", (q: any) =>
      q.eq("organizationId", organizationId).eq("provider", "mercadopago"),
    )
    .first();
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export type AvailableMethodsResult = {
  planId: Id<"membershipPlans">;
  planName: string;
  billingMode: "calendar" | "join_date";
  /** Amount for one cycle, family size and bonification already applied. */
  monthlyAmountArs: number;
  coveredMemberCount: number;
  hasBonification: boolean;
  isFamilyChild: boolean;
  advanceOptions: Array<{
    months: number;
    discountPercentage: number;
    totalArs: number;
  }>;
  methods: PaymentMethodOption[];
};

/**
 * What the current member can pay with for a given plan, with a reason for
 * every method they cannot use.
 */
export const getAvailablePaymentMethods = query({
  args: { planId: v.id("membershipPlans") },
  handler: async (ctx, args): Promise<AvailableMethodsResult | null> => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;
    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined ||
      !plan.isActive
    ) {
      return null;
    }

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    const context = await resolveBillingContext(ctx, subscription);
    const [settings, policyResult, connection] = await Promise.all([
      getMemberPaymentSettings(ctx, membership.organizationId),
      getOrganizationMemberPaymentPolicy(ctx, membership.organizationId),
      getConnection(ctx, membership.organizationId),
    ]);

    const liveAgreement = context.billingSubscription
      ? await findLiveAgreement(ctx, context.billingSubscription._id)
      : null;

    const monthlyAmountArs = computeEffectiveCycleAmountArs({
      planPriceArs: plan.priceArs,
      memberCount: context.coveredMemberCount,
      bonification: context.bonification,
    });

    // Priced with the same function the checkout charges with: rounding per
    // member and then multiplying differs from rounding the family total, and
    // a quote that does not match the charge is worse than no quote.
    const advanceOptions = (plan.advancePaymentDiscounts ?? []).map((tier) => ({
      months: tier.months,
      discountPercentage: tier.discountPercentage,
      totalArs: computeAdvanceTotalArs({
        planPriceArs: plan.priceArs,
        memberCount: context.coveredMemberCount,
        months: tier.months,
        discountPercentage: tier.discountPercentage,
        bonification: context.bonification,
      }).totalArs,
    }));

    return {
      planId: plan._id,
      planName: plan.name,
      billingMode: plan.billingMode ?? "calendar",
      monthlyAmountArs,
      coveredMemberCount: context.coveredMemberCount,
      hasBonification: Boolean(context.bonification),
      isFamilyChild: context.isFamilyChild,
      advanceOptions,
      methods: evaluatePaymentMethods({
        killSwitchEnabled: isMemberMercadoPagoEnabled(),
        mercadoPagoEntitled: policyResult.policy.mercadoPagoEnabled,
        bankTransferEnabled: settings.bankTransferEnabled,
        mercadoPagoRecurringEnabled: settings.mercadoPagoRecurringEnabled,
        mercadoPagoOneTimeEnabled: settings.mercadoPagoOneTimeEnabled,
        connectionUsable: isConnectionUsable(connection),
        planBillingMode: plan.billingMode ?? "calendar",
        planHasInterestTiers: (plan.interestTiers ?? []).length > 0,
        planHasAdvanceDiscounts: advanceOptions.length > 0,
        isFamilyChild: context.isFamilyChild,
        hasLiveRecurringAgreement: liveAgreement !== null,
      }),
    };
  },
});

/**
 * State of one checkout session, for the mobile return screen to poll.
 *
 * The return screen is navigation only: it reports what the backend has
 * verified and never decides that a payment succeeded.
 */
export const getMyCheckoutSession = query({
  args: { sessionId: v.id("memberPaymentCheckoutSessions") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== identity.subject) return null;

    const agreement = session.agreementId
      ? await ctx.db.get(session.agreementId)
      : null;
    const subscription = session.subscriptionId
      ? await ctx.db.get(session.subscriptionId)
      : null;

    return {
      _id: session._id,
      status: session.status,
      kind: session.kind,
      amountArs: session.amountArs,
      months: session.months,
      checkoutUrl: session.checkoutUrl,
      expiresAt: session.expiresAt,
      failureReason: session.failureReason,
      agreementStatus: agreement?.status ?? null,
      lastPaymentStatus: agreement?.lastPaymentStatus ?? null,
      // The only field that means the member actually has access.
      subscriptionStatus: subscription?.status ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal reads for the checkout action
// ---------------------------------------------------------------------------

export const getRecurringCheckoutContextInternal = internalQuery({
  args: { planId: v.id("membershipPlans") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      return { ok: false as const, reason: "Sólo los socios pueden pagar un plan." };
    }

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined ||
      !plan.isActive
    ) {
      return { ok: false as const, reason: "Plan no encontrado." };
    }

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    const context = await resolveBillingContext(ctx, subscription);
    const [settings, policyResult, connection] = await Promise.all([
      getMemberPaymentSettings(ctx, membership.organizationId),
      getOrganizationMemberPaymentPolicy(ctx, membership.organizationId),
      getConnection(ctx, membership.organizationId),
    ]);

    const liveAgreement = context.billingSubscription
      ? await findLiveAgreement(ctx, context.billingSubscription._id)
      : null;

    const methods = evaluatePaymentMethods({
      killSwitchEnabled: isMemberMercadoPagoEnabled(),
      mercadoPagoEntitled: policyResult.policy.mercadoPagoEnabled,
      bankTransferEnabled: settings.bankTransferEnabled,
      mercadoPagoRecurringEnabled: settings.mercadoPagoRecurringEnabled,
      mercadoPagoOneTimeEnabled: settings.mercadoPagoOneTimeEnabled,
      connectionUsable: isConnectionUsable(connection),
      planBillingMode: plan.billingMode ?? "calendar",
      planHasInterestTiers: (plan.interestTiers ?? []).length > 0,
      planHasAdvanceDiscounts: (plan.advancePaymentDiscounts ?? []).length > 0,
      isFamilyChild: context.isFamilyChild,
      hasLiveRecurringAgreement: liveAgreement !== null,
    });

    const recurring = methods.find(
      (method) => method.method === "mercadopago_recurring",
    )!;

    // A repeated tap on a checkout that is still open resumes it instead of
    // creating a second agreement.
    const resumableSession =
      liveAgreement && liveAgreement.status === "pending_authorization"
        ? await findResumableSession(ctx, identity.subject, liveAgreement._id)
        : null;

    // Only resume a checkout for the plan the member actually asked about;
    // otherwise tapping a different plan would hand back the old plan's link.
    if (resumableSession && resumableSession.planId === plan._id) {
      return {
        ok: true as const,
        resume: {
          sessionId: resumableSession._id,
          checkoutUrl: resumableSession.checkoutUrl!,
        },
      };
    }

    if (!recurring.available) {
      return {
        ok: false as const,
        reason: recurring.reason ?? "El débito automático no está disponible.",
      };
    }

    // A member already paying by transfer may switch to automatic debit. What
    // they must not do is end up with two live agreements, which the
    // eligibility check above already rules out.
    const existing = context.billingSubscription;

    // Switching mid-cycle must not charge for a month the member already paid
    // for, so the first debit is deferred to the first uncovered cycle.
    const startAt = existing
      ? await findFirstUnpaidCycleStart(ctx, {
          subscription: existing,
          plan,
          organizationId: membership.organizationId,
        })
      : undefined;

    return {
      ok: true as const,
      create: {
        organizationId: membership.organizationId,
        userId: identity.subject,
        planId: plan._id,
        planName: plan.name,
        connectionId: connection!._id,
        subscriptionId: existing?._id,
        amountArs: computeEffectiveCycleAmountArs({
          planPriceArs: plan.priceArs,
          memberCount: context.coveredMemberCount,
          bonification: context.bonification,
        }),
        coveredMemberCount: context.coveredMemberCount,
        startAt,
      },
    };
  },
});

/**
 * The start of the first billing cycle the member has not already paid for.
 *
 * Returns undefined when the current cycle is unpaid — the debit should start
 * straight away. Returning a future date is what keeps a member who switches
 * from transfer mid-month from paying for that month twice.
 */
async function findFirstUnpaidCycleStart(
  ctx: { db: any },
  params: {
    subscription: Doc<"memberPlanSubscriptions">;
    plan: Doc<"membershipPlans">;
    organizationId: Id<"organizations">;
  },
): Promise<number | undefined> {
  const organization = await ctx.db.get(params.organizationId);
  const timezone = getPaymentTimezone(organization?.timezone);
  const now = Date.now();
  const anchorAt = params.subscription.billingAnchorAt ?? params.subscription.activatedAt;

  const cycles = getAdvanceBillingCycles(
    params.plan,
    anchorAt,
    now,
    MAX_SWITCH_LOOKAHEAD_CYCLES,
    timezone,
  );

  for (const cycle of cycles) {
    const payment = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q: any) =>
        q
          .eq("subscriptionId", params.subscription._id)
          .eq("billingPeriod", cycle.billingPeriod),
      )
      .first();

    if (payment?.status !== "approved") {
      return cycle.cycleStartAt > now ? cycle.cycleStartAt : undefined;
    }
  }

  return undefined;
}

const MAX_SWITCH_LOOKAHEAD_CYCLES = 24;

/**
 * A checkout the member can go back to instead of starting a second one.
 *
 * Indexed by user and status so a repeated tap costs one small lookup rather
 * than a scan of every session in the gym.
 */
async function findResumableSession(
  ctx: { db: any },
  userId: string,
  agreementId: Id<"memberRecurringAgreements">,
) {
  const now = Date.now();

  for (const status of ["created", "opened", "processing"] as const) {
    const sessions = await ctx.db
      .query("memberPaymentCheckoutSessions")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", userId).eq("status", status),
      )
      .collect();

    const match = sessions.find(
      (session: any) =>
        session.agreementId === agreementId &&
        session.checkoutUrl &&
        session.expiresAt > now,
    );
    if (match) return match;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Checkout session lifecycle
// ---------------------------------------------------------------------------

/**
 * Create the local rows a recurring checkout needs, before any provider call.
 *
 * The subscription starts at `pending_payment`: choosing a plan grants no
 * access, and neither will the member authorizing the debit. Only an approved
 * first payment does.
 */
export const createRecurringCheckoutSessionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    planId: v.id("membershipPlans"),
    connectionId: v.id("organizationPaymentProviderConnections"),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    amountArs: v.number(),
    coveredMemberCount: v.number(),
    startAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const subscriptionId =
      args.subscriptionId ??
      (await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: args.organizationId,
        userId: args.userId,
        planId: args.planId,
        status: "pending_payment",
        activatedAt: now,
        paymentMode: "mercadopago_recurring",
        createdAt: now,
        updatedAt: now,
      }));

    if (args.subscriptionId) {
      await ctx.db.patch(args.subscriptionId, {
        planId: args.planId,
        paymentMode: "mercadopago_recurring",
        updatedAt: now,
      });
    }

    const nonce = randomHex(8);
    const externalReference = buildExternalReference({
      kind: "sub",
      organizationId: String(args.organizationId),
      localId: String(subscriptionId),
      nonce,
    });

    const agreementId = await ctx.db.insert("memberRecurringAgreements", {
      organizationId: args.organizationId,
      connectionId: args.connectionId,
      subscriptionId,
      payerUserId: args.userId,
      externalReference,
      status: "pending_authorization",
      amountArs: args.amountArs,
      currency: "ARS",
      familyMemberCount: args.coveredMemberCount,
      // A deferred first debit anchors the cycles on that date, not on today.
      billingAnchorAt: args.startAt ?? now,
      createdAt: now,
      updatedAt: now,
    });

    const sessionId = await ctx.db.insert("memberPaymentCheckoutSessions", {
      organizationId: args.organizationId,
      userId: args.userId,
      planId: args.planId,
      subscriptionId,
      agreementId,
      kind: "recurring_setup",
      months: 1,
      amountArs: args.amountArs,
      currency: "ARS",
      paymentMethod: "mercadopago_recurring",
      externalReference,
      // Persisted before the provider call so a retry reuses the same key.
      idempotencyKey: `checkout:${nonce}`,
      status: "created",
      expiresAt: now + CHECKOUT_SESSION_TTL_MS,
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId, agreementId, subscriptionId, externalReference,
      idempotencyKey: `checkout:${nonce}` };
  },
});

export const attachCheckoutResourcesInternal = internalMutation({
  args: {
    sessionId: v.id("memberPaymentCheckoutSessions"),
    // Absent for an advance purchase, which never creates an agreement.
    agreementId: v.optional(v.id("memberRecurringAgreements")),
    providerPreapprovalId: v.optional(v.string()),
    providerPreferenceId: v.optional(v.string()),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      providerPreapprovalId: args.providerPreapprovalId,
      providerPreferenceId: args.providerPreferenceId,
      checkoutUrl: args.checkoutUrl,
      status: "opened",
      openedAt: now,
      updatedAt: now,
    });

    if (args.agreementId && args.providerPreapprovalId) {
      await ctx.db.patch(args.agreementId, {
        providerPreapprovalId: args.providerPreapprovalId,
        updatedAt: now,
      });
    }
  },
});

export const failCheckoutSessionInternal = internalMutation({
  args: {
    sessionId: v.id("memberPaymentCheckoutSessions"),
    agreementId: v.optional(v.id("memberRecurringAgreements")),
    // Already sanitized by the caller.
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status === "approved") return;

    await ctx.db.patch(args.sessionId, {
      status: "failed",
      failureReason: args.reason,
      updatedAt: now,
    });

    if (args.agreementId) {
      const agreement = await ctx.db.get(args.agreementId);
      // Only a never-authorized agreement is abandoned here; anything further
      // along has provider state that must be cancelled, not discarded.
      if (agreement && agreement.status === "pending_authorization") {
        await ctx.db.patch(args.agreementId, {
          status: "failed",
          updatedAt: now,
        });
      }
    }
  },
});

/** The member closed the Mercado Pago page without paying. */
export const cancelMyCheckoutSession = mutation({
  args: { sessionId: v.id("memberPaymentCheckoutSessions") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== identity.subject) {
      throw new Error("Checkout no encontrado");
    }
    if (session.status === "approved") {
      throw new Error("Este pago ya fue aprobado");
    }

    const now = Date.now();
    await ctx.db.patch(session._id, { status: "cancelled", updatedAt: now });

    if (session.agreementId) {
      const agreement = await ctx.db.get(session.agreementId);
      if (agreement && agreement.status === "pending_authorization") {
        await ctx.db.patch(agreement._id, { status: "cancelled", updatedAt: now });
      }
    }

    // A subscription that never had an approved payment leaves nothing behind.
    if (session.subscriptionId) {
      const subscription = await ctx.db.get(session.subscriptionId);
      if (subscription && subscription.status === "pending_payment") {
        await ctx.db.patch(subscription._id, {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
      }
    }

    return { cancelled: true };
  },
});

/**
 * Mark that the member came back from the Mercado Pago page.
 *
 * A browser return is never proof of payment: this only moves the session to
 * `processing` so the return screen can poll while the webhook or
 * reconciliation establishes what actually happened.
 */
export const markCheckoutReturned = mutation({
  args: { sessionId: v.id("memberPaymentCheckoutSessions") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== identity.subject) {
      throw new Error("Checkout no encontrado");
    }

    if (session.status === "created" || session.status === "opened") {
      await ctx.db.patch(session._id, {
        status: "processing",
        updatedAt: Date.now(),
      });
    }

    return { status: "processing" as const };
  },
});

// ---------------------------------------------------------------------------
// Recurring state for the member's plan screen
// ---------------------------------------------------------------------------

export type RecurringBillingState =
  | "none"
  | "pending_authorization"
  | "pending_first_payment"
  | "active"
  | "retrying"
  | "grace_expired"
  | "paused_bonification"
  | "cancellation_scheduled"
  | "cancelled"
  | "failed";

/**
 * The member's automatic-debit state.
 *
 * Kept separate from the subscription status on purpose: during grace the
 * subscription stays `active` (the member still trains) while the billing
 * state is `retrying` (their card failed and they need to fix it). Collapsing
 * the two would either lock out a member who is still inside grace, or hide a
 * payment problem from them until the day access disappears.
 */
export const getMyRecurringState = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;
    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return null;

    const context = await resolveBillingContext(ctx, subscription);
    const billingSubscription = context.billingSubscription!;

    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", billingSubscription._id),
      )
      .collect();

    const agreement =
      agreements.find((item) => isLiveAgreementStatus(item.status)) ??
      agreements.sort((a, b) => b.createdAt - a.createdAt)[0] ??
      null;

    const now = Date.now();
    let billingState: RecurringBillingState = agreement
      ? agreement.status
      : "none";

    // A retrying agreement whose grace window has already closed is reported
    // as such even if the hourly worker has not run yet, so the member is
    // never told they still have time when they do not.
    if (
      agreement?.status === "retrying" &&
      agreement.graceUntil !== undefined &&
      agreement.graceUntil <= now
    ) {
      billingState = "grace_expired";
    }

    return {
      subscriptionStatus: subscription.status,
      isFamilyChild: context.isFamilyChild,
      isPayer: billingSubscription.userId === identity.subject,
      billingState,
      amountArs: agreement?.amountArs ?? null,
      pendingAmountArs: agreement?.pendingAmountArs ?? null,
      pendingAmountEffectiveAt: agreement?.pendingAmountEffectiveAt ?? null,
      currentPeriodStart: agreement?.currentPeriodStart ?? null,
      currentPeriodEnd: agreement?.currentPeriodEnd ?? null,
      nextChargeAt: agreement?.nextChargeAt ?? null,
      // Present only while a failed renewal is still inside its grace window.
      graceUntil:
        agreement?.status === "retrying" ? (agreement.graceUntil ?? null) : null,
      lastPaymentStatus: agreement?.lastPaymentStatus ?? null,
      accessEndsAt: subscription.accessEndsAt ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Advance purchases
// ---------------------------------------------------------------------------

/**
 * Everything an advance checkout needs, resolved and priced on the server.
 *
 * The months on offer come from the plan's own configured discount tiers, so a
 * member cannot invent a term or a discount by passing one in.
 */
export const getAdvanceCheckoutContextInternal = internalQuery({
  args: { planId: v.id("membershipPlans"), months: v.number() },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      return { ok: false as const, reason: "Sólo los socios pueden pagar un plan." };
    }

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== membership.organizationId ||
      plan.deletedAt !== undefined ||
      !plan.isActive
    ) {
      return { ok: false as const, reason: "Plan no encontrado." };
    }

    const tier = (plan.advancePaymentDiscounts ?? []).find(
      (option) => option.months === args.months,
    );
    if (!tier) {
      return {
        ok: false as const,
        reason: `Este plan no tiene un pago adelantado de ${args.months} meses.`,
      };
    }

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    const context = await resolveBillingContext(ctx, subscription);
    const [settings, policyResult, connection] = await Promise.all([
      getMemberPaymentSettings(ctx, membership.organizationId),
      getOrganizationMemberPaymentPolicy(ctx, membership.organizationId),
      getConnection(ctx, membership.organizationId),
    ]);

    const liveAgreement = context.billingSubscription
      ? await findLiveAgreement(ctx, context.billingSubscription._id)
      : null;

    const advance = evaluatePaymentMethods({
      killSwitchEnabled: isMemberMercadoPagoEnabled(),
      mercadoPagoEntitled: policyResult.policy.mercadoPagoEnabled,
      bankTransferEnabled: settings.bankTransferEnabled,
      mercadoPagoRecurringEnabled: settings.mercadoPagoRecurringEnabled,
      mercadoPagoOneTimeEnabled: settings.mercadoPagoOneTimeEnabled,
      connectionUsable: isConnectionUsable(connection),
      planBillingMode: plan.billingMode ?? "calendar",
      planHasInterestTiers: (plan.interestTiers ?? []).length > 0,
      planHasAdvanceDiscounts: true,
      isFamilyChild: context.isFamilyChild,
      hasLiveRecurringAgreement: liveAgreement !== null,
    }).find((method) => method.method === "mercadopago_checkout")!;

    if (!advance.available) {
      return {
        ok: false as const,
        reason: advance.reason ?? "El pago adelantado no está disponible.",
      };
    }

    const { totalArs } = computeAdvanceTotalArs({
      planPriceArs: plan.priceArs,
      memberCount: context.coveredMemberCount,
      months: args.months,
      discountPercentage: tier.discountPercentage,
      bonification: context.bonification,
    });

    if (totalArs <= 0) {
      return {
        ok: false as const,
        reason: "Tu plan está bonificado: no hay nada que pagar.",
      };
    }

    // The split fee is only sent when Mercado Pago actually supports it for
    // this flow and MAT's policy says so; otherwise the commission is accrued
    // and invoiced to the gym monthly.
    const marketplaceFeeArs =
      policyResult.policy.feeCollectionMode === "marketplace_split"
        ? computeCommissionArs(totalArs, policyResult.policy.platformFeeBps)
        : undefined;

    return {
      ok: true as const,
      create: {
        organizationId: membership.organizationId,
        userId: identity.subject,
        planId: plan._id,
        planName: plan.name,
        connectionId: connection!._id,
        subscriptionId: context.billingSubscription?._id,
        months: args.months,
        amountArs: totalArs,
        marketplaceFeeArs,
      },
    };
  },
});

/**
 * Local rows for an advance purchase, written before the provider call.
 *
 * Deliberately creates no recurring agreement: an advance purchase is a
 * one-time payment, and giving it an agreement would leave a debit running
 * after the months it bought ran out.
 */
export const createAdvanceCheckoutSessionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    planId: v.id("membershipPlans"),
    connectionId: v.id("organizationPaymentProviderConnections"),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    months: v.number(),
    amountArs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const subscriptionId =
      args.subscriptionId ??
      (await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: args.organizationId,
        userId: args.userId,
        planId: args.planId,
        status: "pending_payment",
        activatedAt: now,
        paymentMode: "mercadopago_one_time",
        createdAt: now,
        updatedAt: now,
      }));

    const nonce = randomHex(8);
    const externalReference = buildExternalReference({
      kind: "adv",
      organizationId: String(args.organizationId),
      localId: String(subscriptionId),
      nonce,
    });

    const sessionId = await ctx.db.insert("memberPaymentCheckoutSessions", {
      organizationId: args.organizationId,
      userId: args.userId,
      planId: args.planId,
      subscriptionId,
      kind: "advance_purchase",
      months: args.months,
      amountArs: args.amountArs,
      currency: "ARS",
      paymentMethod: "mercadopago_checkout",
      externalReference,
      idempotencyKey: `advance:${nonce}`,
      status: "created",
      expiresAt: now + CHECKOUT_SESSION_TTL_MS,
      createdAt: now,
      updatedAt: now,
    });

    return {
      sessionId,
      subscriptionId,
      externalReference,
      idempotencyKey: `advance:${nonce}`,
    };
  },
});

// ---------------------------------------------------------------------------
// Cancellation and payment-method changes
// ---------------------------------------------------------------------------

/**
 * What cancelling would actually cost the member, before they confirm.
 *
 * Members cancel expecting to keep what they already paid for. Showing the
 * exact date access ends — rather than letting them find out afterwards — is
 * the difference between a cancellation and a surprise.
 */
export const previewCancellation = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;
    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();
    if (!subscription) return null;

    const context = await resolveBillingContext(ctx, subscription);
    const billingSubscription = context.billingSubscription!;

    if (context.isFamilyChild) {
      return {
        canCancel: false as const,
        reason: "El pago de tu grupo familiar lo maneja el titular.",
        accessEndsAt: null,
        isProviderManaged: false,
        familyMemberCount: context.coveredMemberCount,
      };
    }

    const agreement = await findLiveAgreement(ctx, billingSubscription._id);
    const settings = await getMemberPaymentSettings(ctx, membership.organizationId);

    // A checkout the member never completed leaves nothing to wind down.
    if (agreement?.status === "pending_authorization") {
      return {
        canCancel: true as const,
        reason: null,
        accessEndsAt: null,
        immediate: true as const,
        isProviderManaged: true,
        familyMemberCount: context.coveredMemberCount,
      };
    }

    if (!agreement) {
      return {
        canCancel: true as const,
        reason: null,
        accessEndsAt: null,
        immediate: true as const,
        isProviderManaged: false,
        familyMemberCount: context.coveredMemberCount,
      };
    }

    const coverageEndsAt = agreement.currentPeriodEnd ?? Date.now();
    return {
      canCancel: true as const,
      reason: null,
      immediate: false as const,
      isProviderManaged: true,
      // Paid coverage plus the gym's grace period.
      accessEndsAt: computeCancellationAccessEndsAt(
        coverageEndsAt,
        settings.gracePeriodDays,
      ),
      coverageEndsAt,
      gracePeriodDays: settings.gracePeriodDays,
      familyMemberCount: context.coveredMemberCount,
    };
  },
});

/**
 * Stop a member's automatic debit.
 *
 * Future debits stop now; access runs to the date the preview disclosed. The
 * family group stays active until then and is cancelled as one, so a member's
 * relatives are not locked out the moment the payer taps a button.
 */
export const cancelRecurringSubscription = mutation({
  args: {},
  handler: async (ctx): Promise<{ accessEndsAt: number | null }> => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();
    if (!subscription) throw new Error("No tenés un plan activo");

    const context = await resolveBillingContext(ctx, subscription);
    if (context.isFamilyChild) {
      throw new Error("El pago de tu grupo familiar lo maneja el titular.");
    }
    const billingSubscription = context.billingSubscription!;

    const agreement = await findLiveAgreement(ctx, billingSubscription._id);
    if (!agreement) {
      throw new Error(
        "No tenés un débito automático activo. Cancelá tu plan desde la pantalla de plan.",
      );
    }
    if (agreement.status === "cancellation_scheduled") {
      return { accessEndsAt: billingSubscription.accessEndsAt ?? null };
    }

    const now = Date.now();

    // Nothing was ever charged, so there is no coverage to honour.
    if (agreement.status === "pending_authorization") {
      await ctx.db.patch(agreement._id, {
        status: "cancelled",
        cancellationRequestedAt: now,
        updatedAt: now,
      });
      if (billingSubscription.status === "pending_payment") {
        await ctx.db.patch(billingSubscription._id, {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
      }
      return { accessEndsAt: null };
    }

    const settings = await getMemberPaymentSettings(ctx, membership.organizationId);
    const accessEndsAt = computeCancellationAccessEndsAt(
      agreement.currentPeriodEnd ?? now,
      settings.gracePeriodDays,
    );

    await ctx.db.patch(agreement._id, {
      status: "cancellation_scheduled",
      cancellationRequestedAt: now,
      // Any scheduled amount change is moot once the member is leaving.
      pendingAmountArs: undefined,
      pendingAmountEffectiveAt: undefined,
      updatedAt: now,
    });

    await ctx.db.patch(billingSubscription._id, {
      accessEndsAt,
      cancellationRequestedAt: now,
      updatedAt: now,
    });

    // Stop future debits immediately, through the outbox so a provider outage
    // cannot leave the local state and Mercado Pago disagreeing.
    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "cancel",
      input: { effectiveAt: accessEndsAt, reason: "member_cancelled" },
    });

    // Written confirmation of the date, so the member has it outside the modal
    // they just dismissed.
    await ctx.scheduler.runAfter(
      0,
      internal.memberPaymentNotifications.notifyCancellationScheduled,
      {
        userId: billingSubscription.userId,
        subscriptionId: billingSubscription._id,
        accessEndsAt,
      },
    );

    return { accessEndsAt };
  },
});

/**
 * Move from automatic debit to bank transfer.
 *
 * Future debits stop, the coverage already paid for is kept, and the next
 * cycle becomes payable by transfer. Access is never interrupted, so this is
 * also how a member replaces an expired card: switch off the old agreement,
 * then authorize a new one.
 */
export const switchToBankTransfer = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();
    if (!subscription) throw new Error("No tenés un plan activo");

    const context = await resolveBillingContext(ctx, subscription);
    if (context.isFamilyChild) {
      throw new Error("El pago de tu grupo familiar lo maneja el titular.");
    }
    const billingSubscription = context.billingSubscription!;

    const settings = await getMemberPaymentSettings(ctx, membership.organizationId);
    if (!settings.bankTransferEnabled) {
      throw new Error("Tu gimnasio no acepta transferencias por la app.");
    }

    const agreement = await findLiveAgreement(ctx, billingSubscription._id);
    if (!agreement) {
      throw new Error("No tenés un débito automático activo.");
    }

    const now = Date.now();

    await ctx.db.patch(agreement._id, {
      status: "cancellation_scheduled",
      cancellationRequestedAt: now,
      pendingAmountArs: undefined,
      pendingAmountEffectiveAt: undefined,
      updatedAt: now,
    });

    // No accessEndsAt: the member is not leaving, only changing how they pay.
    // The coverage they bought stands and the next cycle falls due by transfer.
    await ctx.db.patch(billingSubscription._id, {
      paymentMode: "manual",
      updatedAt: now,
    });

    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "cancel",
      input: { reason: "switched_to_transfer" },
    });

    return {
      coveredUntil: agreement.currentPeriodEnd ?? null,
    };
  },
});
