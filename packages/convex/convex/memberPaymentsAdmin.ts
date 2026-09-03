/**
 * Admin-facing reads and operational tools for member payments.
 *
 * Everything here is scoped to the caller's active organization and returns
 * only support-safe data: seller nickname, provider resource ids, amounts and
 * states. No token, no ciphertext, no payer contact details.
 */

import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import {
  isLiveAgreementStatus,
  toSafeConnection,
  type SafeConnection,
} from "./memberPaymentDomain";
import { isMemberMercadoPagoEnabled } from "./memberPaymentsEnv";
import {
  getMemberPaymentSettings,
  type MemberPaymentSettings,
} from "./organizationSettings";
import {
  getOrganizationMemberPaymentPolicy,
  type MemberPaymentPolicy,
} from "./appBillingPlans";
import { enqueueProviderOperation } from "./memberPayments";

async function resolveUserName(ctx: { db: any }, userId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q: any) => q.eq("externalId", userId))
    .first();
  return user?.fullName ?? user?.email ?? userId;
}

export type MemberPaymentsOverview = {
  connection: SafeConnection | null;
  settings: MemberPaymentSettings;
  policy: MemberPaymentPolicy;
  /** False when the deployment-level kill switch is off. */
  runtimeEnabled: boolean;
  counts: {
    activeAgreements: number;
    retryingAgreements: number;
    scheduledCancellations: number;
    pausedAgreements: number;
    failedOperations: number;
    transactionsNeedingAttention: number;
  };
};

/**
 * Everything the settings screen needs to explain the current state, including
 * why an action is unavailable.
 */
export const getOverview = query({
  args: {},
  handler: async (ctx): Promise<MemberPaymentsOverview | null> => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;
    await requireAdmin(ctx, orgCtx.organizationId);

    const [connection, settings, policyResult] = await Promise.all([
      ctx.db
        .query("organizationPaymentProviderConnections")
        .withIndex("by_organization_provider", (q) =>
          q
            .eq("organizationId", orgCtx.organizationId)
            .eq("provider", "mercadopago"),
        )
        .first(),
      getMemberPaymentSettings(ctx, orgCtx.organizationId),
      getOrganizationMemberPaymentPolicy(ctx, orgCtx.organizationId),
    ]);

    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    const operations = await ctx.db
      .query("memberPaymentProviderOperations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    const transactions = await ctx.db
      .query("memberPaymentTransactions")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    return {
      connection: connection ? toSafeConnection(connection) : null,
      settings,
      policy: policyResult.policy,
      runtimeEnabled: isMemberMercadoPagoEnabled(),
      counts: {
        activeAgreements: agreements.filter((a) => a.status === "active")
          .length,
        retryingAgreements: agreements.filter((a) => a.status === "retrying")
          .length,
        scheduledCancellations: agreements.filter(
          (a) => a.status === "cancellation_scheduled",
        ).length,
        pausedAgreements: agreements.filter(
          (a) => a.status === "paused_bonification",
        ).length,
        failedOperations: operations.filter(
          (operation) => operation.status === "permanently_failed",
        ).length,
        transactionsNeedingAttention: transactions.filter(
          (transaction) => transaction.requiresAttention === true,
        ).length,
      },
    };
  },
});

/**
 * Members currently on automatic debit, with the state a support conversation
 * actually needs: what they pay, when the next charge is, and whether anything
 * is wrong.
 */
export const listAgreements = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return [];
    await requireAdminOrTrainer(ctx, orgCtx.organizationId);

    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    const sorted = agreements
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, args.limit ?? 100);

    return await Promise.all(
      sorted.map(async (agreement) => {
        const subscription = await ctx.db.get(agreement.subscriptionId);
        const planDoc = subscription
          ? await ctx.db.get(subscription.planId)
          : null;

        return {
          _id: agreement._id,
          status: agreement.status,
          isLive: isLiveAgreementStatus(agreement.status),
          memberName: await resolveUserName(ctx, agreement.payerUserId),
          planName: planDoc?.name ?? "Plan eliminado",
          amountArs: agreement.amountArs,
          pendingAmountArs: agreement.pendingAmountArs ?? null,
          pendingAmountEffectiveAt: agreement.pendingAmountEffectiveAt ?? null,
          familyMemberCount: agreement.familyMemberCount,
          currentPeriodStart: agreement.currentPeriodStart ?? null,
          currentPeriodEnd: agreement.currentPeriodEnd ?? null,
          nextChargeAt: agreement.nextChargeAt ?? null,
          firstFailureAt: agreement.firstFailureAt ?? null,
          graceUntil: agreement.graceUntil ?? null,
          lastPaymentStatus: agreement.lastPaymentStatus ?? null,
          accessEndsAt: subscription?.accessEndsAt ?? null,
          subscriptionStatus: subscription?.status ?? null,
          // Safe to show support: it identifies the resource, not the payer.
          providerPreapprovalId: agreement.providerPreapprovalId ?? null,
          externalReference: agreement.externalReference,
        };
      }),
    );
  },
});

/** Provider charges for the organization, newest first. */
export const listTransactions = query({
  args: {
    limit: v.optional(v.number()),
    onlyNeedingAttention: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return [];
    await requireAdminOrTrainer(ctx, orgCtx.organizationId);

    const transactions = await ctx.db
      .query("memberPaymentTransactions")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    const filtered = (
      args.onlyNeedingAttention
        ? transactions.filter(
            (transaction) => transaction.requiresAttention === true,
          )
        : transactions
    )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, args.limit ?? 100);

    return await Promise.all(
      filtered.map(async (transaction) => {
        const payment = transaction.planPaymentId
          ? await ctx.db.get(transaction.planPaymentId)
          : null;

        return {
          _id: transaction._id,
          kind: transaction.kind,
          status: transaction.status,
          statusDetail: transaction.statusDetail ?? null,
          memberName: await resolveUserName(ctx, transaction.payerUserId),
          billingPeriod: payment?.billingPeriod ?? null,
          grossAmountArs: transaction.grossAmountArs,
          providerFeeArs: transaction.providerFeeArs ?? null,
          platformFeeArs: transaction.platformFeeArs ?? null,
          gymNetAmountArs: transaction.gymNetAmountArs ?? null,
          requiresAttention: transaction.requiresAttention === true,
          attentionReason: transaction.attentionReason ?? null,
          providerTransactionId: transaction.providerTransactionId,
          providerApprovedAt: transaction.providerApprovedAt ?? null,
          createdAt: transaction.createdAt,
        };
      }),
    );
  },
});

/** Queued and failed provider operations, so an admin can see and retry them. */
export const listProviderOperations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return [];
    await requireAdmin(ctx, orgCtx.organizationId);

    const operations = await ctx.db
      .query("memberPaymentProviderOperations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .collect();

    return await Promise.all(
      operations
        .filter((operation) => operation.status !== "succeeded")
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, args.limit ?? 50)
        .map(async (operation) => {
          const agreement = operation.agreementId
            ? await ctx.db.get(operation.agreementId)
            : null;

          return {
            _id: operation._id,
            operation: operation.operation,
            status: operation.status,
            attempts: operation.attempts,
            lastError: operation.lastError ?? null,
            executeAfter: operation.executeAfter,
            memberName: agreement
              ? await resolveUserName(ctx, agreement.payerUserId)
              : "—",
            amountArs: operation.input?.amountArs ?? null,
          };
        }),
    );
  },
});

/**
 * Ask Mercado Pago what it currently believes about one agreement, and apply
 * the answer. The safe first move for almost any support question.
 */
export const resyncAgreement = mutation({
  args: { agreementId: v.id("memberRecurringAgreements") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement || agreement.organizationId !== membership.organizationId) {
      throw new Error("Débito automático no encontrado");
    }

    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "resync",
    });

    return { queued: true };
  },
});

/**
 * Stop a member's automatic debit from the admin side without ending their
 * plan: the coverage they paid for stands, and the next cycle falls due by
 * transfer.
 *
 * Pausing and resuming are deliberately not exposed here. Those states belong
 * to the bonification lifecycle, and a manual pause would leave an agreement
 * paused with no bonification to explain it — which the next family or price
 * change would silently undo.
 */
export const cancelAgreement = mutation({
  args: { agreementId: v.id("memberRecurringAgreements") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement || agreement.organizationId !== membership.organizationId) {
      throw new Error("Débito automático no encontrado");
    }
    if (!isLiveAgreementStatus(agreement.status)) {
      throw new Error("Este débito automático ya no está activo");
    }

    const now = Date.now();
    await ctx.db.patch(agreement._id, {
      status: "cancellation_scheduled",
      cancellationRequestedAt: now,
      pendingAmountArs: undefined,
      pendingAmountEffectiveAt: undefined,
      updatedAt: now,
    });

    const subscription = await ctx.db.get(agreement.subscriptionId);
    if (subscription && subscription.status !== "cancelled") {
      await ctx.db.patch(subscription._id, {
        paymentMode: "manual",
        updatedAt: now,
      });
    }

    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "cancel",
      input: { reason: "cancelled_by_staff" },
    });

    return { queued: true };
  },
});

/**
 * Operational metrics for one gym's member payments.
 *
 * Chosen so a support conversation can start from numbers rather than
 * guesses: how many members finish checkout, how long approvals take, whether
 * webhooks are landing, whether failed cards recover, and what the gym is
 * actually receiving.
 */
/**
 * MercadoPago member-payment funnel and health. Shared by the admin console
 * and Mati (`ai.runReport`). Callers are responsible for authorization.
 */
export async function computeMemberPaymentMetrics(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  args: { sinceDays?: number },
) {
  const since = Date.now() - (args.sinceDays ?? 30) * 24 * 60 * 60 * 1000;

  const [sessions, transactions, agreements, operations, connection, ledger] =
    await Promise.all([
      ctx.db
        .query("memberPaymentCheckoutSessions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("memberPaymentTransactions")
        .withIndex("by_organization_created", (q) =>
          q.eq("organizationId", organizationId).gte("createdAt", since),
        )
        .collect(),
      ctx.db
        .query("memberRecurringAgreements")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("memberPaymentProviderOperations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      ctx.db
        .query("organizationPaymentProviderConnections")
        .withIndex("by_organization_provider", (q) =>
          q.eq("organizationId", organizationId).eq("provider", "mercadopago"),
        )
        .first(),
      ctx.db
        .query("platformCommissionLedger")
        .withIndex("by_organization_created", (q) =>
          q.eq("organizationId", organizationId).gte("createdAt", since),
        )
        .collect(),
    ]);

  const recentSessions = sessions.filter(
    (session) => session.createdAt >= since,
  );
  const startedCheckouts = recentSessions.filter(
    (session) => session.status !== "created",
  ).length;
  const approvedCheckouts = recentSessions.filter(
    (session) => session.status === "approved",
  ).length;

  const approved = transactions.filter(
    (transaction) => transaction.status === "approved",
  );
  // Time from MAT creating the charge record to the provider approving it.
  const latencies = approved
    .map((transaction) =>
      transaction.providerApprovedAt
        ? transaction.providerApprovedAt - transaction.createdAt
        : null,
    )
    .filter((value): value is number => value !== null && value >= 0)
    .sort((a, b) => a - b);

  const webhookEvents = connection
    ? await ctx.db
        .query("paymentProviderWebhookEvents")
        .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
        .collect()
    : [];
  const recentWebhooks = webhookEvents.filter(
    (event) => event.receivedAt >= since,
  );

  const suspendedMembers = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization_status", (q) =>
      q.eq("organizationId", organizationId).eq("status", "suspended"),
    )
    .collect();

  return {
    sinceDays: args.sinceDays ?? 30,
    checkout: {
      started: startedCheckouts,
      approved: approvedCheckouts,
      abandoned: recentSessions.filter(
        (session) =>
          session.status === "expired" || session.status === "cancelled",
      ).length,
      // Null rather than a fabricated 0%: no attempts means no rate.
      conversionRate:
        startedCheckouts > 0 ? approvedCheckouts / startedCheckouts : null,
    },
    payments: {
      approved: approved.length,
      rejected: transactions.filter(
        (transaction) => transaction.status === "rejected",
      ).length,
      reversed: transactions.filter(
        (transaction) =>
          transaction.status === "refunded" ||
          transaction.status === "charged_back",
      ).length,
      needingAttention: transactions.filter(
        (transaction) => transaction.requiresAttention === true,
      ).length,
      grossVolumeArs: approved.reduce(
        (total, transaction) => total + transaction.grossAmountArs,
        0,
      ),
      gymNetArs: approved.reduce(
        (total, transaction) => total + (transaction.gymNetAmountArs ?? 0),
        0,
      ),
      medianApprovalLatencyMs:
        latencies.length > 0
          ? latencies[Math.floor(latencies.length / 2)]!
          : null,
    },
    webhooks: {
      received: recentWebhooks.length,
      failed: recentWebhooks.filter((event) => event.status === "failed")
        .length,
      stuck: recentWebhooks.filter((event) => event.status === "processing")
        .length,
      oldestUnprocessedAgeMs: recentWebhooks
        .filter((event) => event.status === "processing")
        .reduce<
          number | null
        >((oldest, event) => Math.max(oldest ?? 0, Date.now() - event.receivedAt), null),
    },
    agreements: {
      active: agreements.filter((a) => a.status === "active").length,
      retrying: agreements.filter((a) => a.status === "retrying").length,
      paused: agreements.filter((a) => a.status === "paused_bonification")
        .length,
      cancellationScheduled: agreements.filter(
        (a) => a.status === "cancellation_scheduled",
      ).length,
      failed: agreements.filter((a) => a.status === "failed").length,
      // Members whose card failed and who then paid: the number that says
      // whether the grace window is doing its job.
      recoveredAfterFailure: agreements.filter(
        (a) => a.status === "active" && a.firstFailureAt === undefined,
      ).length,
    },
    operations: {
      queued: operations.filter((o) => o.status === "queued").length,
      running: operations.filter((o) => o.status === "running").length,
      permanentlyFailed: operations.filter(
        (o) => o.status === "permanently_failed",
      ).length,
    },
    connection: {
      status: connection?.status ?? "disconnected",
      lastHealthCheckAt: connection?.lastHealthCheckAt ?? null,
      lastRefreshedAt: connection?.lastRefreshedAt ?? null,
      accessTokenExpiresAt: connection?.accessTokenExpiresAt ?? null,
    },
    commission: {
      accruedArs: ledger
        .filter((entry) => entry.status === "accrued")
        .reduce((total, entry) => total + entry.feeAmountArs, 0),
      collectedArs: ledger
        .filter((entry) => entry.status === "collected")
        .reduce((total, entry) => total + entry.feeAmountArs, 0),
    },
    suspendedMembers: suspendedMembers.length,
  };
}

export const getMetrics = query({
  args: { sinceDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;
    const organizationId = orgCtx.organizationId;
    await requireAdmin(ctx, organizationId);
    return await computeMemberPaymentMetrics(ctx, organizationId, args);
  },
});
