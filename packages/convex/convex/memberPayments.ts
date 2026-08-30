/**
 * Member -> gym payments: public queries/mutations and internal state writes.
 *
 * Provider calls live in `memberPaymentsActions.ts`; HTTP entry points live in
 * `memberPaymentsHttp.ts`; pure rules live in `memberPaymentDomain.ts`.
 *
 * Nothing here returns a credential. The only functions that read ciphertext
 * are internal and exist so an action can decrypt a token in memory.
 */

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireAdmin,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import { reassignFixedSlotsForUser } from "./fixedClassSlots";
import {
  computeCommissionArs,
  computeEffectiveCycleAmountArs,
  computeGraceUntil,
  computeGymNetArs,
  getAdvanceBillingCycles,
  getBillingCycle,
  getPaymentTimezone,
  splitAmountAcrossCycles,
} from "./billingDomain";
import { getMemberPaymentSettings } from "./organizationSettings";
import { getOrganizationMemberPaymentPolicy } from "./appBillingPlans";
import { logMemberPaymentEvent } from "./memberPaymentNotifications";
import {
  awardMembershipPaymentReward,
  reverseMembershipPaymentReward,
} from "./rewards";
import {
  canApplyTransactionStatus,
  decideOperationOutcome,
  isLiveAgreementStatus,
  mapPreapprovalStatusToAgreement,
  mapProviderPaymentStatus,
  OPERATION_STALE_RUNNING_MS,
  resolveReturnPath,
  toSafeConnection,
  type SafeConnection,
} from "./memberPaymentDomain";

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/**
 * The active organization's MercadoPago connection, in its client-safe form.
 * Admin-only: the seller identity tells an admin whose account receives their
 * members' money, which is not information other roles need.
 */
export const getMercadoPagoConnection = query({
  args: {},
  handler: async (ctx): Promise<SafeConnection | null> => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;
    await requireAdmin(ctx, orgCtx.organizationId);

    const connection = await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_organization_provider", (q) =>
        q
          .eq("organizationId", orgCtx.organizationId)
          .eq("provider", "mercadopago"),
      )
      .first();

    return connection ? toSafeConnection(connection) : null;
  },
});

// ---------------------------------------------------------------------------
// Internal reads (never exposed to a client)
// ---------------------------------------------------------------------------

/**
 * Authorize an action's caller as an admin and return their organization.
 * Actions have no database access, so they call this first.
 */
export const requireAdminOrganization = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ organizationId: Id<"organizations">; userId: string }> => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    return {
      organizationId: membership.organizationId,
      userId: membership.userId,
    };
  },
});

/** Full connection row, ciphertext included. Internal callers only. */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("organizationPaymentProviderConnections") },
  handler: async (ctx, args) => await ctx.db.get(args.connectionId),
});

export const getConnectionByOrganizationInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_organization_provider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", "mercadopago"),
      )
      .first(),
});

export const getConnectionByRoutingKeyInternal = internalQuery({
  args: { webhookRoutingKey: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_webhook_routing_key", (q) =>
        q.eq("webhookRoutingKey", args.webhookRoutingKey),
      )
      .first(),
});

/** Connections whose access token is close enough to expiry to refresh. */
export const listConnectionsForRefreshInternal = internalQuery({
  args: { before: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(args.limit * 4);

    return connections
      .filter(
        (connection) =>
          connection.accessTokenExpiresAt !== undefined &&
          connection.accessTokenExpiresAt <= args.before,
      )
      .slice(0, args.limit)
      .map((connection) => connection._id);
  },
});

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

export const createOAuthStateInternal = internalMutation({
  args: {
    stateHash: v.string(),
    organizationId: v.id("organizations"),
    initiatedBy: v.string(),
    returnPath: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("paymentProviderOAuthStates", {
      stateHash: args.stateHash,
      organizationId: args.organizationId,
      provider: "mercadopago",
      initiatedBy: args.initiatedBy,
      returnPath: resolveReturnPath(args.returnPath),
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

/**
 * Consume an OAuth state exactly once.
 *
 * Returns null for an unknown, already-consumed or expired state. Consumption
 * and validation happen in the same transaction, so a replayed callback cannot
 * win a race against the original.
 */
export const consumeOAuthStateInternal = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("paymentProviderOAuthStates")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .first();

    if (!state) return null;

    const now = Date.now();
    if (state.consumedAt !== undefined || state.expiresAt <= now) {
      return null;
    }

    await ctx.db.patch(state._id, { consumedAt: now });
    return {
      organizationId: state.organizationId,
      initiatedBy: state.initiatedBy,
      returnPath: state.returnPath,
    };
  },
});

/** Housekeeping: drop states that expired without being used. */
export const purgeExpiredOAuthStatesInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const expired = await ctx.db
      .query("paymentProviderOAuthStates")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(args.limit ?? 200);

    for (const state of expired) {
      await ctx.db.delete(state._id);
    }
    return expired.length;
  },
});

// ---------------------------------------------------------------------------
// Connection writes
// ---------------------------------------------------------------------------

export const upsertConnectionInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    connectedBy: v.string(),
    providerAccountId: v.string(),
    providerNickname: v.optional(v.string()),
    providerEmail: v.optional(v.string()),
    providerSiteId: v.optional(v.string()),
    liveMode: v.optional(v.boolean()),
    accessTokenCiphertext: v.string(),
    accessTokenIv: v.string(),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    encryptionKeyVersion: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    webhookRoutingKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // A seller account may back exactly one MAT gym. Silently sharing one
    // account across gyms would make webhook routing and reconciliation
    // ambiguous, so this is refused rather than resolved by guesswork.
    const sameAccount = await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_provider_account", (q) =>
        q
          .eq("provider", "mercadopago")
          .eq("providerAccountId", args.providerAccountId),
      )
      .collect();

    const conflicting = sameAccount.find(
      (connection) =>
        connection.organizationId !== args.organizationId &&
        connection.status !== "disconnected",
    );
    if (conflicting) {
      throw new Error("SELLER_ALREADY_CONNECTED");
    }

    const existing = await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_organization_provider", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("provider", "mercadopago"),
      )
      .first();

    const credentials = {
      providerAccountId: args.providerAccountId,
      providerNickname: args.providerNickname,
      providerEmail: args.providerEmail,
      providerSiteId: args.providerSiteId,
      liveMode: args.liveMode,
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenIv: args.accessTokenIv,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenIv: args.refreshTokenIv,
      encryptionKeyVersion: args.encryptionKeyVersion,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      lastRefreshedAt: now,
      status: "active" as const,
      lastError: undefined,
      connectedBy: args.connectedBy,
      connectedAt: now,
      disconnectedAt: undefined,
      disconnectedBy: undefined,
      updatedAt: now,
    };

    if (existing) {
      // Reconnecting keeps the original routing key so notification URLs
      // Mercado Pago already stores for this seller keep resolving.
      await ctx.db.patch(existing._id, credentials);
      return existing._id;
    }

    return await ctx.db.insert("organizationPaymentProviderConnections", {
      organizationId: args.organizationId,
      provider: "mercadopago",
      webhookRoutingKey: args.webhookRoutingKey,
      createdAt: now,
      ...credentials,
    });
  },
});

/**
 * Store refreshed credentials.
 *
 * `expectedLastRefreshedAt` makes the write conditional: if another refresh
 * landed first, this one is discarded rather than overwriting newer tokens.
 */
export const recordConnectionRefreshInternal = internalMutation({
  args: {
    connectionId: v.id("organizationPaymentProviderConnections"),
    expectedLastRefreshedAt: v.optional(v.number()),
    accessTokenCiphertext: v.string(),
    accessTokenIv: v.string(),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    encryptionKeyVersion: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return { applied: false, reason: "not_found" as const };

    if (connection.lastRefreshedAt !== args.expectedLastRefreshedAt) {
      return { applied: false, reason: "superseded" as const };
    }

    const now = Date.now();
    await ctx.db.patch(args.connectionId, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenIv: args.accessTokenIv,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenIv: args.refreshTokenIv,
      encryptionKeyVersion: args.encryptionKeyVersion,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      lastRefreshedAt: now,
      status: "active",
      lastError: undefined,
      updatedAt: now,
    });

    return { applied: true, reason: "ok" as const };
  },
});

export const recordConnectionStatusInternal = internalMutation({
  args: {
    connectionId: v.id("organizationPaymentProviderConnections"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("refresh_required"),
      v.literal("error"),
      v.literal("disconnected"),
    ),
    // Already sanitized by the caller — must never contain a token or payload.
    lastError: v.optional(v.string()),
    healthChecked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const connection = await ctx.db.get(args.connectionId);

    if (
      connection &&
      connection.status !== args.status &&
      (args.status === "refresh_required" || args.status === "error")
    ) {
      logMemberPaymentEvent({
        event: "connection_unhealthy",
        organizationId: String(connection.organizationId),
        status: args.status,
        reason: args.lastError,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.memberPaymentNotifications.alertAdmins,
        {
          organizationId: connection.organizationId,
          kind: "connection_broken",
          dedupeKey: `${args.connectionId}:${args.status}`,
        },
      );
    }

    await ctx.db.patch(args.connectionId, {
      status: args.status,
      lastError: args.lastError,
      // Only stamp the health check when one actually ran; patching with
      // undefined would clear the previous timestamp.
      ...(args.healthChecked ? { lastHealthCheckAt: now } : {}),
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Disconnect (guarded)
// ---------------------------------------------------------------------------

export const countLiveAgreementsInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    return agreements.filter((agreement) =>
      isLiveAgreementStatus(agreement.status),
    ).length;
  },
});

/**
 * Disconnect a gym's MercadoPago account.
 *
 * Blocked while live agreements exist: the credentials are still needed to
 * cancel or update those debits. Turning MercadoPago off in settings is the
 * way to stop new checkouts without destroying that ability.
 */
export const disconnectMercadoPago = mutation({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const connection = await ctx.db
      .query("organizationPaymentProviderConnections")
      .withIndex("by_organization_provider", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("provider", "mercadopago"),
      )
      .first();

    if (!connection || connection.status === "disconnected") {
      throw new Error("No hay una cuenta de Mercado Pago conectada");
    }

    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();
    const liveAgreements = agreements.filter((agreement) =>
      isLiveAgreementStatus(agreement.status),
    ).length;

    if (liveAgreements > 0) {
      throw new Error(
        `No podés desconectar Mercado Pago: hay ${liveAgreements} débito(s) automático(s) activo(s). Cancelalos primero, o deshabilitá Mercado Pago en la configuración para no aceptar pagos nuevos.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "disconnected",
      // Credentials are cleared: with no live agreements nothing can need them
      // again, and a disconnected gym should not keep an encrypted token.
      accessTokenCiphertext: "",
      accessTokenIv: "",
      refreshTokenCiphertext: "",
      refreshTokenIv: "",
      accessTokenExpiresAt: undefined,
      disconnectedBy: membership.userId,
      disconnectedAt: now,
      lastError: undefined,
      updatedAt: now,
    });

    // Stop new member checkouts too, so a reconnect is an explicit decision.
    const settings = await ctx.db
      .query("organizationSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .first();

    if (settings?.memberPayments) {
      await ctx.db.patch(settings._id, {
        memberPayments: {
          ...settings.memberPayments,
          mercadoPagoRecurringEnabled: false,
          mercadoPagoOneTimeEnabled: false,
          // Never leave a gym with no payment method at all.
          bankTransferEnabled: true,
        },
        updatedAt: now,
      });
    }

    return { disconnected: true };
  },
});

// ---------------------------------------------------------------------------
// Provider-operation outbox
//
// Local mutations enqueue an operation in the same transaction as the state
// change it describes; a scheduled worker performs the provider call. That is
// what stops a family/price/bonification/cancellation edit from being half
// applied when a network request fails.
// ---------------------------------------------------------------------------

export type ProviderOperationName =
  | "update_amount"
  | "pause"
  | "resume"
  | "cancel"
  | "resync";

export type EnqueueOperationParams = {
  organizationId: Id<"organizations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  agreementId?: Id<"memberRecurringAgreements">;
  operation: ProviderOperationName;
  input?: { amountArs?: number; effectiveAt?: number; reason?: string };
  /** Delay before the first attempt. Defaults to immediate. */
  delayMs?: number;
};

/**
 * Enqueue a provider operation. Call this from inside the mutation that makes
 * the corresponding local change, so the two commit together.
 *
 * A still-queued operation of the same kind for the same agreement is updated
 * in place rather than duplicated: repeated family edits before the worker
 * runs should produce one provider call carrying the latest amount, not a
 * queue of stale ones.
 */
export async function enqueueProviderOperation(
  ctx: { db: any; scheduler?: any },
  params: EnqueueOperationParams,
): Promise<Id<"memberPaymentProviderOperations">> {
  const now = Date.now();
  const executeAfter = now + Math.max(0, params.delayMs ?? 0);

  if (params.agreementId) {
    const queued = await ctx.db
      .query("memberPaymentProviderOperations")
      .withIndex("by_agreement", (q: any) =>
        q.eq("agreementId", params.agreementId),
      )
      .collect();

    const supersedable = queued.find(
      (operation: any) =>
        operation.status === "queued" &&
        operation.operation === params.operation,
    );

    if (supersedable) {
      await ctx.db.patch(supersedable._id, {
        input: params.input,
        // The payload changed, so the provider must see a new key.
        idempotencyKey: `${supersedable._id}:${now}`,
        executeAfter: Math.min(supersedable.executeAfter, executeAfter),
        lastError: undefined,
        updatedAt: now,
      });
      await kickWorker(ctx, params.delayMs);
      return supersedable._id;
    }
  }

  const operationId = await ctx.db.insert("memberPaymentProviderOperations", {
    organizationId: params.organizationId,
    connectionId: params.connectionId,
    agreementId: params.agreementId,
    operation: params.operation,
    idempotencyKey: "",
    input: params.input,
    executeAfter,
    status: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  // The row id makes the key unique and stable across retries of this same
  // operation, which is exactly the property the provider needs.
  await ctx.db.patch(operationId, { idempotencyKey: `${operationId}:${now}` });
  await kickWorker(ctx, params.delayMs);
  return operationId;
}

/**
 * Run the worker as soon as this mutation commits, so a member or admin sees
 * the effect in seconds rather than waiting for the next cron tick. The cron
 * still exists to catch retries and anything this kick misses.
 */
async function kickWorker(ctx: { scheduler?: any }, delayMs?: number) {
  if (!ctx.scheduler) return;
  await ctx.scheduler.runAfter(
    Math.max(0, delayMs ?? 0),
    internal.memberPaymentsActions.runProviderOperations,
    { limit: 20 },
  );
}

/** Internal wrapper so an action or a test can enqueue directly. */
export const enqueueProviderOperationInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.id("organizationPaymentProviderConnections"),
    agreementId: v.optional(v.id("memberRecurringAgreements")),
    operation: v.union(
      v.literal("update_amount"),
      v.literal("pause"),
      v.literal("resume"),
      v.literal("cancel"),
      v.literal("resync"),
    ),
    input: v.optional(
      v.object({
        amountArs: v.optional(v.number()),
        effectiveAt: v.optional(v.number()),
        reason: v.optional(v.string()),
      }),
    ),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => await enqueueProviderOperation(ctx, args),
});

/**
 * Atomically claim operations that are due.
 *
 * Claiming flips each row to `running` inside this transaction, so two
 * concurrent workers cannot pick up the same operation. Rows stuck in
 * `running` past the stale threshold — an action that died mid-flight — are
 * reclaimed too.
 */
export const claimDueOperationsInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 20;

    const queued = await ctx.db
      .query("memberPaymentProviderOperations")
      .withIndex("by_status_execute_after", (q) =>
        q.eq("status", "queued").lte("executeAfter", now),
      )
      .take(limit);

    const stale = await ctx.db
      .query("memberPaymentProviderOperations")
      .withIndex("by_status_execute_after", (q) => q.eq("status", "running"))
      .take(limit);

    const claimable = [
      ...queued,
      ...stale.filter(
        (operation) => operation.updatedAt <= now - OPERATION_STALE_RUNNING_MS,
      ),
    ].slice(0, limit);

    const claimed = [];
    for (const operation of claimable) {
      await ctx.db.patch(operation._id, { status: "running", updatedAt: now });
      claimed.push({
        _id: operation._id,
        organizationId: operation.organizationId,
        connectionId: operation.connectionId,
        agreementId: operation.agreementId,
        operation: operation.operation,
        idempotencyKey: operation.idempotencyKey,
        input: operation.input,
        attempts: operation.attempts,
      });
    }

    return claimed;
  },
});

/**
 * Record the outcome of one attempt and apply the operation's local effect.
 *
 * Idempotent: re-running it for an operation that already succeeded changes
 * nothing, so a duplicated worker pass cannot double-apply an amount change.
 */
export const completeOperationInternal = internalMutation({
  args: {
    operationId: v.id("memberPaymentProviderOperations"),
    succeeded: v.boolean(),
    retryable: v.optional(v.boolean()),
    // Already sanitized by the caller.
    error: v.optional(v.string()),
    providerPreapprovalStatus: v.optional(v.string()),
    providerNextChargeAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) return { applied: false as const };

    // A completed operation is terminal; a late duplicate must not reopen it.
    if (
      operation.status === "succeeded" ||
      operation.status === "permanently_failed"
    ) {
      return { applied: false as const };
    }

    const now = Date.now();
    const attempts = operation.attempts + 1;
    const outcome = decideOperationOutcome({
      succeeded: args.succeeded,
      retryable: args.retryable ?? false,
      attempts,
      now,
    });

    await ctx.db.patch(args.operationId, {
      status: outcome.status,
      attempts,
      lastError: args.succeeded ? undefined : args.error,
      executeAfter:
        outcome.status === "queued"
          ? outcome.executeAfter
          : operation.executeAfter,
      completedAt: outcome.status === "succeeded" ? now : undefined,
      updatedAt: now,
    });

    if (args.succeeded && operation.agreementId) {
      await applyOperationEffect(ctx, operation, args, now);
    }

    if (outcome.status === "permanently_failed") {
      logMemberPaymentEvent({
        event: "operation_failed",
        organizationId: String(operation.organizationId),
        operationId: String(operation._id),
        agreementId: operation.agreementId
          ? String(operation.agreementId)
          : undefined,
        reason: args.error,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.memberPaymentNotifications.alertAdmins,
        {
          organizationId: operation.organizationId,
          kind: "operation_failed",
          dedupeKey: String(operation._id),
          correlationId: String(operation._id),
        },
      );
    }

    return { applied: true as const, status: outcome.status, attempts };
  },
});

/**
 * The local state change each successful provider operation implies.
 *
 * Deliberately narrow: it records what the provider confirmed. The richer
 * lifecycle decisions (which family members regain access, when a scheduled
 * cancellation actually ends access) belong to the flows that own them.
 */
async function applyOperationEffect(
  ctx: { db: any },
  operation: {
    agreementId?: Id<"memberRecurringAgreements">;
    operation: ProviderOperationName;
    input?: { amountArs?: number; effectiveAt?: number; reason?: string };
  },
  args: {
    providerPreapprovalStatus?: string;
    providerNextChargeAt?: number;
  },
  now: number,
) {
  if (!operation.agreementId) return;
  const agreement = await ctx.db.get(operation.agreementId);
  if (!agreement) return;

  switch (operation.operation) {
    case "update_amount": {
      const amountArs = operation.input?.amountArs;
      if (amountArs === undefined) return;
      // The provider now bills this from the next charge onwards. `amountArs`
      // deliberately stays on the amount the member is paying for the cycle
      // they are in; it is promoted only when a charge at the new amount is
      // approved, so nothing claims a change took effect before it did.
      await ctx.db.patch(agreement._id, {
        pendingAmountArs: amountArs,
        pendingAmountEffectiveAt:
          operation.input?.effectiveAt ??
          agreement.currentPeriodEnd ??
          agreement.pendingAmountEffectiveAt,
        updatedAt: now,
      });
      return;
    }
    case "pause": {
      await ctx.db.patch(agreement._id, {
        status: "paused_bonification",
        updatedAt: now,
      });
      return;
    }
    case "resume": {
      // Resuming a cancelled or scheduled-cancellation agreement would
      // silently revive a debit the member stopped; only a paused one resumes.
      if (agreement.status !== "paused_bonification") return;

      // Mercado Pago does not always preserve the intended next charge date
      // across a pause/resume. If the provider now intends to charge before
      // this cycle is over, the resume is abandoned rather than allowed to
      // take money early: the debit is cancelled and the member is asked to
      // authorize a fresh agreement.
      const intendedNextChargeAt =
        agreement.currentPeriodEnd ?? operation.input?.effectiveAt;
      const providerNextChargeAt = args.providerNextChargeAt;

      if (
        intendedNextChargeAt !== undefined &&
        providerNextChargeAt !== undefined &&
        providerNextChargeAt < intendedNextChargeAt - RESUME_CHARGE_TOLERANCE_MS
      ) {
        await ctx.db.patch(agreement._id, {
          status: "failed",
          nextChargeAt: undefined,
          updatedAt: now,
        });
        await enqueueProviderOperation(ctx, {
          organizationId: agreement.organizationId,
          connectionId: agreement.connectionId,
          agreementId: agreement._id,
          operation: "cancel",
          input: { reason: "resume_would_charge_early" },
        });
        return;
      }

      await ctx.db.patch(agreement._id, {
        status: "active",
        nextChargeAt: providerNextChargeAt ?? agreement.nextChargeAt,
        updatedAt: now,
      });
      return;
    }
    case "cancel": {
      const subscription = await ctx.db.get(agreement.subscriptionId);
      // A member who is leaving keeps access until `accessEndsAt`, so the
      // agreement stays scheduled until the worker retires it. A member who
      // only switched payment method has no end date and is done here.
      const leaving = subscription?.accessEndsAt !== undefined;

      await ctx.db.patch(agreement._id, {
        providerCancelledAt: now,
        nextChargeAt: undefined,
        status: leaving ? agreement.status : "cancelled",
        updatedAt: now,
      });
      return;
    }
    case "resync": {
      if (!args.providerPreapprovalStatus) return;
      await ctx.db.patch(agreement._id, {
        status: mapPreapprovalStatusToAgreement(
          args.providerPreapprovalStatus,
          agreement.status,
        ),
        nextChargeAt: args.providerNextChargeAt ?? agreement.nextChargeAt,
        updatedAt: now,
      });
      return;
    }
  }
}

export const getAgreementInternal = internalQuery({
  args: { agreementId: v.id("memberRecurringAgreements") },
  handler: async (ctx, args) => await ctx.db.get(args.agreementId),
});

export const getOperationInternal = internalQuery({
  args: { operationId: v.id("memberPaymentProviderOperations") },
  handler: async (ctx, args) => await ctx.db.get(args.operationId),
});

/**
 * Admin support tool: put a permanently failed operation back in the queue
 * after the underlying cause was fixed.
 */
export const retryProviderOperation = mutation({
  args: { operationId: v.id("memberPaymentProviderOperations") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.organizationId !== membership.organizationId) {
      throw new Error("Operación no encontrada");
    }
    if (
      operation.status !== "permanently_failed" &&
      operation.status !== "failed"
    ) {
      throw new Error("Solo se pueden reintentar operaciones que fallaron");
    }

    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: "queued",
      attempts: 0,
      executeAfter: now,
      lastError: undefined,
      // A fresh key: the previous attempts may have been rejected for the old
      // payload, and the provider should treat this as a new request.
      idempotencyKey: `${operation._id}:${now}`,
      updatedAt: now,
    });

    return { requeued: true };
  },
});

// ---------------------------------------------------------------------------
// Webhook ledger
//
// A separate ledger from `mercadoPagoWebhookEvents`, which belongs to the
// organization -> MAT SaaS billing integration. Full payloads are never
// persisted: they carry payer contact details MAT has no reason to store.
// ---------------------------------------------------------------------------

/**
 * Record an incoming notification and say whether it needs processing.
 *
 * Returns `shouldProcess: false` for a redelivery that already succeeded or is
 * still in flight, so Mercado Pago's retries cost nothing.
 */
export const recordWebhookEventInternal = internalMutation({
  args: {
    connectionId: v.optional(v.id("organizationPaymentProviderConnections")),
    eventKey: v.string(),
    providerEventId: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    topic: v.optional(v.string()),
    action: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    payloadHash: v.optional(v.string()),
    ignored: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("paymentProviderWebhookEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();

    if (existing) {
      if (existing.status === "processed" || existing.status === "ignored") {
        return { eventId: existing._id, shouldProcess: false as const };
      }
      // Still processing or previously failed: allow another pass. Applying
      // the resource again is idempotent, so a retry cannot double-charge.
      await ctx.db.patch(existing._id, {
        status: "processing",
        attempts: existing.attempts + 1,
        receivedAt: now,
        error: undefined,
      });
      return { eventId: existing._id, shouldProcess: true as const };
    }

    const eventId = await ctx.db.insert("paymentProviderWebhookEvents", {
      provider: "mercadopago",
      connectionId: args.connectionId,
      eventKey: args.eventKey,
      providerEventId: args.providerEventId,
      providerRequestId: args.providerRequestId,
      topic: args.topic,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      payloadHash: args.payloadHash,
      status: args.ignored ? "ignored" : "processing",
      attempts: args.ignored ? 0 : 1,
      receivedAt: now,
      processedAt: args.ignored ? now : undefined,
    });

    return { eventId, shouldProcess: !args.ignored };
  },
});

export const getWebhookEventInternal = internalQuery({
  args: { eventId: v.id("paymentProviderWebhookEvents") },
  handler: async (ctx, args) => await ctx.db.get(args.eventId),
});

export const markWebhookEventInternal = internalMutation({
  args: {
    eventId: v.id("paymentProviderWebhookEvents"),
    status: v.union(
      v.literal("processed"),
      v.literal("failed"),
      v.literal("ignored"),
    ),
    // Already sanitized by the caller.
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: args.status,
      error: args.error,
      processedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Local object resolution
// ---------------------------------------------------------------------------

export const findAgreementByProviderInternal = internalQuery({
  args: {
    providerPreapprovalId: v.optional(v.string()),
    externalReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.providerPreapprovalId) {
      const byPreapproval = await ctx.db
        .query("memberRecurringAgreements")
        .withIndex("by_provider_preapproval", (q) =>
          q.eq("providerPreapprovalId", args.providerPreapprovalId),
        )
        .first();
      if (byPreapproval) return byPreapproval;
    }

    if (args.externalReference) {
      return await ctx.db
        .query("memberRecurringAgreements")
        .withIndex("by_external_reference", (q) =>
          q.eq("externalReference", args.externalReference!),
        )
        .first();
    }

    return null;
  },
});

export const findCheckoutSessionByExternalReferenceInternal = internalQuery({
  args: { externalReference: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("memberPaymentCheckoutSessions")
      .withIndex("by_external_reference", (q) =>
        q.eq("externalReference", args.externalReference),
      )
      .first(),
});

// ---------------------------------------------------------------------------
// The single idempotent transition point
// ---------------------------------------------------------------------------

const preapprovalEventValidator = v.object({
  id: v.string(),
  status: v.string(),
  externalReference: v.optional(v.string()),
  amountArs: v.optional(v.number()),
  nextChargeAt: v.optional(v.number()),
});

const authorizedPaymentEventValidator = v.object({
  id: v.string(),
  preapprovalId: v.optional(v.string()),
  externalReference: v.optional(v.string()),
  paymentId: v.optional(v.string()),
  paymentStatus: v.optional(v.string()),
  statusDetail: v.optional(v.string()),
  amountArs: v.optional(v.number()),
  approvedAt: v.optional(v.number()),
});

const paymentEventValidator = v.object({
  id: v.string(),
  status: v.string(),
  statusDetail: v.optional(v.string()),
  externalReference: v.optional(v.string()),
  amountArs: v.optional(v.number()),
  providerFeeArs: v.optional(v.number()),
  netReceivedArs: v.optional(v.number()),
  approvedAt: v.optional(v.number()),
});

/**
 * Apply one verified provider resource to local state.
 *
 * Every path into MAT's payment state — webhook, reconciliation, admin resync —
 * goes through here, so the ordering and idempotency rules are written once.
 * The caller has already verified the seller, organization, amount and
 * currency against local snapshots; this function does not re-authorize, it
 * applies.
 */
export const applyProviderEventInternal = internalMutation({
  args: {
    connectionId: v.id("organizationPaymentProviderConnections"),
    source: v.union(
      v.literal("webhook"),
      v.literal("reconciliation"),
      v.literal("manual"),
    ),
    preapproval: v.optional(preapprovalEventValidator),
    authorizedPayment: v.optional(authorizedPaymentEventValidator),
    payment: v.optional(paymentEventValidator),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection)
      return { applied: false as const, reason: "no_connection" };

    const now = Date.now();

    if (args.preapproval) {
      return await applyPreapprovalEvent(
        ctx,
        connection,
        args.preapproval,
        now,
      );
    }
    if (args.authorizedPayment) {
      return await applyAuthorizedPaymentEvent(
        ctx,
        connection,
        args.authorizedPayment,
        args.source,
        now,
      );
    }
    if (args.payment) {
      return await applyPaymentEvent(
        ctx,
        connection,
        args.payment,
        args.source,
        now,
      );
    }

    return { applied: false as const, reason: "empty_event" };
  },
});

async function applyPreapprovalEvent(
  ctx: any,
  connection: Doc<"organizationPaymentProviderConnections">,
  preapproval: {
    id: string;
    status: string;
    externalReference?: string;
    amountArs?: number;
    nextChargeAt?: number;
  },
  now: number,
) {
  const agreement = await findAgreement(ctx, {
    providerPreapprovalId: preapproval.id,
    externalReference: preapproval.externalReference,
  });

  if (!agreement)
    return { applied: false as const, reason: "unknown_agreement" };
  if (agreement.organizationId !== connection.organizationId) {
    return { applied: false as const, reason: "organization_mismatch" };
  }

  await ctx.db.patch(agreement._id, {
    // A checkout created locally before the provider responded may not have
    // recorded the preapproval id yet; the first notification supplies it.
    providerPreapprovalId: agreement.providerPreapprovalId ?? preapproval.id,
    status: mapPreapprovalStatusToAgreement(
      preapproval.status,
      agreement.status,
    ),
    nextChargeAt: preapproval.nextChargeAt ?? agreement.nextChargeAt,
    updatedAt: now,
  });

  return { applied: true as const, agreementId: agreement._id };
}

async function applyAuthorizedPaymentEvent(
  ctx: any,
  connection: Doc<"organizationPaymentProviderConnections">,
  event: {
    id: string;
    preapprovalId?: string;
    externalReference?: string;
    paymentId?: string;
    paymentStatus?: string;
    statusDetail?: string;
    amountArs?: number;
    approvedAt?: number;
  },
  source: "webhook" | "reconciliation" | "manual",
  now: number,
) {
  const agreement = await findAgreement(ctx, {
    providerPreapprovalId: event.preapprovalId,
    externalReference: event.externalReference,
  });

  if (!agreement)
    return { applied: false as const, reason: "unknown_agreement" };
  if (agreement.organizationId !== connection.organizationId) {
    return { applied: false as const, reason: "organization_mismatch" };
  }

  const status = mapProviderPaymentStatus(event.paymentStatus);
  // A charge whose amount does not match what MAT agreed to is still real
  // money that moved, so the transaction is recorded either way. What it must
  // not do is silently justify access; the mismatch is returned so the caller
  // can raise it for an operator.
  const expectedAmounts = [agreement.amountArs, agreement.pendingAmountArs];
  const amountMismatch =
    event.amountArs !== undefined && !expectedAmounts.includes(event.amountArs);

  const transactionId = await upsertTransaction(ctx, {
    organizationId: agreement.organizationId,
    connectionId: connection._id,
    payerUserId: agreement.payerUserId,
    subscriptionId: agreement.subscriptionId,
    agreementId: agreement._id,
    kind: "recurring",
    providerTransactionId: event.paymentId ?? event.id,
    providerAuthorizedPaymentId: event.id,
    externalReference: event.externalReference,
    status,
    statusDetail: event.statusDetail,
    grossAmountArs: event.amountArs ?? agreement.amountArs,
    providerApprovedAt: event.approvedAt,
    source,
    now,
  });

  await ctx.db.patch(agreement._id, {
    lastPaymentStatus: status,
    lastPaymentStatusDetail: event.statusDetail,
    latestAuthorizedPaymentId: event.id,
    updatedAt: now,
  });

  // An approved charge grants access — but never one whose amount MAT did not
  // agree to. That case is recorded and flagged, not honoured.
  if (status === "approved" && !amountMismatch) {
    const refreshed = await ctx.db.get(agreement._id);

    // A charge that lands after the member cancelled is money that should not
    // have been taken. It is recorded so it can be refunded, but it never buys
    // another month or reopens access.
    const cancelled =
      refreshed?.status === "cancelled" ||
      refreshed?.status === "cancellation_scheduled";

    if (cancelled) {
      await flagTransactionForAttention(
        ctx,
        transactionId,
        "charge_after_cancellation: refund and confirm the debit is stopped at MercadoPago",
        now,
      );
    } else if (refreshed) {
      await applyApprovedRecurringPayment(ctx, {
        agreement: refreshed,
        transactionId,
        grossAmountArs: event.amountArs ?? agreement.amountArs,
        approvedAt: event.approvedAt,
        now,
      });
    }
  }

  if (amountMismatch) {
    await flagTransactionForAttention(
      ctx,
      transactionId,
      `amount_mismatch: charged ${event.amountArs} but the agreement is for ${agreement.amountArs}`,
      now,
    );
  }

  if (status === "rejected" || status === "cancelled") {
    const refreshed = await ctx.db.get(agreement._id);
    if (refreshed) {
      await applyFailedRecurringPayment(ctx, {
        agreement: refreshed,
        failedAt: event.approvedAt ?? now,
        now,
      });
    }
  }

  if (status === "refunded" || status === "charged_back") {
    await applyPaymentReversal(ctx, { transactionId, status, now });
  }

  return {
    applied: true as const,
    agreementId: agreement._id,
    transactionId,
    status,
    amountMismatch,
  };
}

async function applyPaymentEvent(
  ctx: any,
  connection: Doc<"organizationPaymentProviderConnections">,
  event: {
    id: string;
    status: string;
    statusDetail?: string;
    externalReference?: string;
    amountArs?: number;
    providerFeeArs?: number;
    netReceivedArs?: number;
    approvedAt?: number;
  },
  source: "webhook" | "reconciliation" | "manual",
  now: number,
) {
  if (!event.externalReference) {
    return { applied: false as const, reason: "no_external_reference" };
  }

  const session = await ctx.db
    .query("memberPaymentCheckoutSessions")
    .withIndex("by_external_reference", (q: any) =>
      q.eq("externalReference", event.externalReference),
    )
    .first();

  if (!session) return { applied: false as const, reason: "unknown_session" };
  if (session.organizationId !== connection.organizationId) {
    return { applied: false as const, reason: "organization_mismatch" };
  }

  const status = mapProviderPaymentStatus(event.status);
  const amountMismatch =
    event.amountArs !== undefined && event.amountArs !== session.amountArs;

  const transactionId = await upsertTransaction(ctx, {
    organizationId: session.organizationId,
    connectionId: connection._id,
    payerUserId: session.userId,
    subscriptionId: session.subscriptionId,
    checkoutSessionId: session._id,
    kind: "advance",
    providerTransactionId: event.id,
    externalReference: event.externalReference,
    status,
    statusDetail: event.statusDetail,
    grossAmountArs: event.amountArs ?? session.amountArs,
    providerFeeArs: event.providerFeeArs,
    providerApprovedAt: event.approvedAt,
    source,
    now,
  });

  if (status === "approved" && !amountMismatch) {
    await applyApprovedAdvancePurchase(ctx, {
      session,
      transactionId,
      grossAmountArs: event.amountArs ?? session.amountArs,
      providerFeeArs: event.providerFeeArs,
      approvedAt: event.approvedAt,
      now,
    });
  }

  if (amountMismatch) {
    await flagTransactionForAttention(
      ctx,
      transactionId,
      `amount_mismatch: charged ${event.amountArs} but the checkout was for ${session.amountArs}`,
      now,
    );
  }

  if (status === "refunded" || status === "charged_back") {
    await applyPaymentReversal(ctx, { transactionId, status, now });
  }

  const sessionStatus =
    status === "approved"
      ? "approved"
      : status === "rejected" || status === "cancelled"
        ? "failed"
        : "processing";

  if (session.status !== "approved") {
    await ctx.db.patch(session._id, {
      status: sessionStatus,
      completedAt: sessionStatus === "approved" ? now : session.completedAt,
      updatedAt: now,
    });
  }

  return {
    applied: true as const,
    sessionId: session._id,
    transactionId,
    status,
    amountMismatch,
  };
}

async function findAgreement(
  ctx: any,
  params: { providerPreapprovalId?: string; externalReference?: string },
) {
  if (params.providerPreapprovalId) {
    const byPreapproval = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_provider_preapproval", (q: any) =>
        q.eq("providerPreapprovalId", params.providerPreapprovalId),
      )
      .first();
    if (byPreapproval) return byPreapproval;
  }

  if (params.externalReference) {
    return await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_external_reference", (q: any) =>
        q.eq("externalReference", params.externalReference),
      )
      .first();
  }

  return null;
}

/**
 * Create or update the transaction row for one provider charge.
 *
 * Keyed on the provider's own id, so a redelivered or out-of-order
 * notification updates the same row instead of creating a second one — and an
 * approved payment is never walked back to pending or rejected by a stale
 * message.
 */
async function upsertTransaction(
  ctx: any,
  params: {
    organizationId: Id<"organizations">;
    connectionId: Id<"organizationPaymentProviderConnections">;
    payerUserId: string;
    subscriptionId?: Id<"memberPlanSubscriptions">;
    agreementId?: Id<"memberRecurringAgreements">;
    checkoutSessionId?: Id<"memberPaymentCheckoutSessions">;
    kind: "recurring" | "advance";
    providerTransactionId: string;
    providerAuthorizedPaymentId?: string;
    externalReference?: string;
    status: Doc<"memberPaymentTransactions">["status"];
    statusDetail?: string;
    grossAmountArs: number;
    providerFeeArs?: number;
    providerApprovedAt?: number;
    source: "webhook" | "reconciliation" | "manual";
    now: number;
  },
): Promise<Id<"memberPaymentTransactions">> {
  const existing = await ctx.db
    .query("memberPaymentTransactions")
    .withIndex("by_provider_transaction", (q: any) =>
      q.eq("providerTransactionId", params.providerTransactionId),
    )
    .first();

  if (existing) {
    if (!canApplyTransactionStatus(existing.status, params.status)) {
      return existing._id;
    }

    await ctx.db.patch(existing._id, {
      status: params.status,
      statusDetail: params.statusDetail ?? existing.statusDetail,
      providerFeeArs: params.providerFeeArs ?? existing.providerFeeArs,
      providerApprovedAt:
        params.providerApprovedAt ?? existing.providerApprovedAt,
      providerAuthorizedPaymentId:
        params.providerAuthorizedPaymentId ??
        existing.providerAuthorizedPaymentId,
      reconciliationSource: params.source,
      lastReconciledAt: params.now,
      updatedAt: params.now,
    });
    return existing._id;
  }

  return await ctx.db.insert("memberPaymentTransactions", {
    organizationId: params.organizationId,
    connectionId: params.connectionId,
    payerUserId: params.payerUserId,
    subscriptionId: params.subscriptionId,
    agreementId: params.agreementId,
    checkoutSessionId: params.checkoutSessionId,
    kind: params.kind,
    providerTransactionId: params.providerTransactionId,
    providerAuthorizedPaymentId: params.providerAuthorizedPaymentId,
    externalReference: params.externalReference,
    status: params.status,
    statusDetail: params.statusDetail,
    grossAmountArs: params.grossAmountArs,
    currency: "ARS",
    providerFeeArs: params.providerFeeArs,
    providerApprovedAt: params.providerApprovedAt,
    reconciliationSource: params.source,
    lastReconciledAt: params.now,
    createdAt: params.now,
    updatedAt: params.now,
  });
}

// ---------------------------------------------------------------------------
// Reconciliation reads
// ---------------------------------------------------------------------------

/** Webhook events stuck mid-processing (an action that died before finishing). */
export const listStuckWebhookEventsInternal = internalQuery({
  args: { olderThan: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("paymentProviderWebhookEvents")
      .withIndex("by_status_received", (q) =>
        q.eq("status", "processing").lt("receivedAt", args.olderThan),
      )
      .take(args.limit ?? 50);
    return events.map((event) => event._id);
  },
});

export const listExpiredCheckoutSessionsInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: Id<"memberPaymentCheckoutSessions">[] = [];

    for (const status of ["created", "opened", "processing"] as const) {
      const sessions = await ctx.db
        .query("memberPaymentCheckoutSessions")
        .withIndex("by_status_expires_at", (q) =>
          q.eq("status", status).lt("expiresAt", now),
        )
        .take(args.limit ?? 50);
      results.push(...sessions.map((session) => session._id));
    }

    return results.slice(0, args.limit ?? 50);
  },
});

/** Agreements whose provider state MAT has not confirmed recently. */
export const listAgreementsNeedingResyncInternal = internalQuery({
  args: { staleBefore: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const results: Array<{
      _id: Id<"memberRecurringAgreements">;
      connectionId: Id<"organizationPaymentProviderConnections">;
      providerPreapprovalId?: string;
    }> = [];

    for (const status of [
      "pending_authorization",
      "pending_first_payment",
      "retrying",
    ] as const) {
      const agreements = await ctx.db
        .query("memberRecurringAgreements")
        .withIndex("by_status_next_charge", (q) => q.eq("status", status))
        .take(args.limit ?? 25);

      for (const agreement of agreements) {
        if (agreement.updatedAt > args.staleBefore) continue;
        if (!agreement.providerPreapprovalId) continue;
        results.push({
          _id: agreement._id,
          connectionId: agreement.connectionId,
          providerPreapprovalId: agreement.providerPreapprovalId,
        });
      }
    }

    return results.slice(0, args.limit ?? 25);
  },
});

export const expireCheckoutSessionInternal = internalMutation({
  args: { sessionId: v.id("memberPaymentCheckoutSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    // An approved session must never be expired out from under a paid member.
    if (!session || session.status === "approved") return { expired: false };

    const now = Date.now();
    await ctx.db.patch(args.sessionId, { status: "expired", updatedAt: now });

    logMemberPaymentEvent({
      event: "checkout_failed",
      organizationId: String(session.organizationId),
      sessionId: String(session._id),
      externalReference: session.externalReference,
      reason: "expired",
    });

    // Only worth mentioning if the member actually opened the checkout; a
    // session they never touched is noise.
    if (session.status === "opened" || session.status === "processing") {
      await ctx.scheduler.runAfter(
        0,
        internal.memberPaymentNotifications.notifyMember,
        {
          userId: session.userId,
          event: "member_checkout_incomplete",
          dedupeKey: String(session._id),
          subscriptionId: session.subscriptionId,
        },
      );
    }

    return { expired: true };
  },
});

// ---------------------------------------------------------------------------
// Activation on an approved recurring payment
// ---------------------------------------------------------------------------

/**
 * The transition that actually grants access.
 *
 * Not the browser return, and not the member authorizing the debit — only an
 * approved payment reaches here. It records the month as paid, activates the
 * whole family group, restores their recurring class bookings and snapshots
 * MAT's commission.
 *
 * Idempotent: re-running it for the same charge updates the same
 * `planPayments` row and the same ledger entry rather than creating seconds.
 */
async function applyApprovedRecurringPayment(
  ctx: any,
  params: {
    agreement: Doc<"memberRecurringAgreements">;
    transactionId: Id<"memberPaymentTransactions">;
    grossAmountArs: number;
    providerFeeArs?: number;
    approvedAt?: number;
    now: number;
  },
) {
  const { agreement, now } = params;
  const subscription = await ctx.db.get(agreement.subscriptionId);
  if (!subscription) return;

  const [plan, organization] = await Promise.all([
    ctx.db.get(subscription.planId),
    ctx.db.get(agreement.organizationId),
  ]);
  if (!plan) return;

  const timezone = getPaymentTimezone(organization?.timezone);
  // The first approved payment fixes the billing anchor: the member's cycles
  // run from the day the money actually arrived, not from when they tapped.
  const isFirstPayment =
    agreement.status === "pending_authorization" ||
    agreement.status === "pending_first_payment";
  const billingAnchorAt = isFirstPayment
    ? (params.approvedAt ?? now)
    : agreement.billingAnchorAt;

  const cycle = getBillingCycle(
    plan,
    billingAnchorAt,
    params.approvedAt ?? now,
    timezone,
  );

  const policyResult = await getOrganizationMemberPaymentPolicy(
    ctx,
    agreement.organizationId,
  );
  const platformFeeArs = computeCommissionArs(
    params.grossAmountArs,
    policyResult.policy.platformFeeBps,
  );
  const gymNetAmountArs = computeGymNetArs({
    grossArs: params.grossAmountArs,
    providerFeeArs: params.providerFeeArs,
    platformFeeArs,
  });

  // One approved payment row per anchored cycle, whatever the notification
  // count.
  const existingPayment = await ctx.db
    .query("planPayments")
    .withIndex("by_subscription_period", (q: any) =>
      q
        .eq("subscriptionId", subscription._id)
        .eq("billingPeriod", cycle.billingPeriod),
    )
    .first();

  const paymentFields = {
    billingCycleStartAt: cycle.cycleStartAt,
    billingCycleEndAt: cycle.cycleEndAt,
    dueAt: cycle.dueAt,
    amountArs: params.grossAmountArs,
    totalAmountArs: params.grossAmountArs,
    paymentMethod: "mercadopago_recurring" as const,
    status: "approved" as const,
    providerTransactionId: params.transactionId,
    grossAmountArs: params.grossAmountArs,
    providerFeeArs: params.providerFeeArs,
    platformFeeArs,
    gymNetAmountArs,
    reviewedAt: params.approvedAt ?? now,
    updatedAt: now,
  };

  const planPaymentId = existingPayment
    ? (await ctx.db.patch(existingPayment._id, paymentFields),
      existingPayment._id)
    : await ctx.db.insert("planPayments", {
        organizationId: agreement.organizationId,
        userId: subscription.userId,
        subscriptionId: subscription._id,
        planId: plan._id,
        billingPeriod: cycle.billingPeriod,
        createdAt: now,
        ...paymentFields,
      });

  await ctx.db.patch(params.transactionId, {
    planPaymentId,
    subscriptionId: subscription._id,
    platformFeeArs,
    gymNetAmountArs,
    updatedAt: now,
  });
  await awardMembershipPaymentReward(ctx, {
    paymentId: planPaymentId,
    occurredAt: params.approvedAt ?? now,
  });

  // A scheduled change takes effect the moment the provider actually charges
  // it, and not before.
  const pendingTookEffect =
    agreement.pendingAmountArs !== undefined &&
    params.grossAmountArs === agreement.pendingAmountArs;

  await ctx.db.patch(agreement._id, {
    status: "active",
    billingAnchorAt,
    currentPeriodStart: cycle.cycleStartAt,
    currentPeriodEnd: cycle.cycleEndAt,
    nextChargeAt: cycle.cycleEndAt,
    ...(pendingTookEffect
      ? {
          amountArs: agreement.pendingAmountArs,
          pendingAmountArs: undefined,
          pendingAmountEffectiveAt: undefined,
        }
      : {}),
    // A successful charge closes any open grace window.
    firstFailureAt: undefined,
    graceUntil: undefined,
    updatedAt: now,
  });

  const wasLockedOut =
    agreement.status === "retrying" || subscription.status !== "active";

  await setFamilyGroupStatus(ctx, subscription, "active", now);

  logMemberPaymentEvent({
    event: "payment_approved",
    organizationId: String(agreement.organizationId),
    agreementId: String(agreement._id),
    externalReference: agreement.externalReference,
    amountArs: params.grossAmountArs,
  });

  await ctx.scheduler?.runAfter(
    0,
    internal.memberPaymentNotifications.notifyMember,
    {
      userId: subscription.userId,
      event: wasLockedOut
        ? "member_payment_recovered"
        : "member_payment_approved",
      dedupeKey: String(params.transactionId),
      subscriptionId: subscription._id,
    },
  );

  await recordCommissionSnapshot(ctx, {
    organizationId: agreement.organizationId,
    billingPlanId: policyResult.billingPlanId,
    transactionId: params.transactionId,
    grossAmountArs: params.grossAmountArs,
    platformFeeBps: policyResult.policy.platformFeeBps,
    feeAmountArs: platformFeeArs,
    collectionMode: policyResult.policy.feeCollectionMode,
    kind: "recurring",
    now,
  });
}

/**
 * Move a whole family group to the same access state.
 *
 * Payment covers the group, so access does too: activating only the payer
 * would leave the rest of the family locked out of a plan that is paid for.
 */
async function setFamilyGroupStatus(
  ctx: any,
  subscription: Doc<"memberPlanSubscriptions">,
  status: "active" | "suspended",
  now: number,
) {
  const parent = subscription.familyParentSubscriptionId
    ? await ctx.db.get(subscription.familyParentSubscriptionId)
    : subscription;
  if (!parent) return;

  const children = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_family_parent", (q: any) =>
      q.eq("familyParentSubscriptionId", parent._id),
    )
    .collect();

  const group = [parent, ...children].filter(
    (item: any) => item.status !== "cancelled",
  );

  for (const item of group) {
    if (item.status === status) continue;
    await ctx.db.patch(item._id, {
      status,
      suspendedAt: status === "suspended" ? now : undefined,
      updatedAt: now,
    });
  }

  // While suspended or pending, future schedules skipped these members, so
  // paying alone would not put them back on the calendar.
  if (status === "active") {
    for (const item of group) {
      await reassignFixedSlotsForUser(ctx, item.organizationId, item.userId);
    }
  }
}

/**
 * How MAT can actually collect its fee on a given charge.
 *
 * Mercado Pago exposes a split fee on one-time checkout preferences, but its
 * recurring `/preapproval` charges have no documented equivalent. Recording
 * `marketplace_split` on a recurring charge would claim money was taken at the
 * source when nothing was, so those always fall back to monthly invoicing.
 */
function resolveCollectionMode(
  configured: "none" | "marketplace_split" | "monthly_gym_invoice",
  kind: "recurring" | "advance",
): "none" | "marketplace_split" | "monthly_gym_invoice" {
  if (configured === "marketplace_split" && kind === "recurring") {
    return "monthly_gym_invoice";
  }
  return configured;
}

/**
 * Immutable commission snapshot for one approved transaction.
 *
 * A later change to the gym's MAT plan must not rewrite what was owed on a
 * payment that already happened, so the row is written once and then left
 * alone; corrections are separate compensating entries.
 */
async function recordCommissionSnapshot(
  ctx: any,
  params: {
    organizationId: Id<"organizations">;
    billingPlanId?: Id<"appBillingPlans">;
    transactionId: Id<"memberPaymentTransactions">;
    grossAmountArs: number;
    platformFeeBps: number;
    feeAmountArs: number;
    collectionMode: "none" | "marketplace_split" | "monthly_gym_invoice";
    /** Recurring charges cannot carry a provider-side split. */
    kind: "recurring" | "advance";
    now: number;
  },
) {
  const existing = await ctx.db
    .query("platformCommissionLedger")
    .withIndex("by_transaction", (q: any) =>
      q.eq("transactionId", params.transactionId),
    )
    .first();
  if (existing) return existing._id;

  const collectionMode = resolveCollectionMode(
    params.collectionMode,
    params.kind,
  );

  // A split fee was taken by Mercado Pago at the moment of the charge, so it
  // is already collected and must never appear on a monthly invoice as well.
  const alreadyCollected =
    collectionMode === "marketplace_split" && params.feeAmountArs > 0;

  return await ctx.db.insert("platformCommissionLedger", {
    organizationId: params.organizationId,
    billingPlanId: params.billingPlanId,
    transactionId: params.transactionId,
    grossAmountArs: params.grossAmountArs,
    // v1 uses the gross approved member payment as the fee basis.
    feeBasisArs: params.grossAmountArs,
    platformFeeBps: params.platformFeeBps,
    feeAmountArs: params.feeAmountArs,
    collectionMode,
    // A zero-fee policy still records the row, so the audit trail is complete
    // even when nothing is owed.
    status:
      params.feeAmountArs <= 0
        ? "not_applicable"
        : alreadyCollected
          ? "collected"
          : "accrued",
    collectedAt: alreadyCollected ? params.now : undefined,
    createdAt: params.now,
    updatedAt: params.now,
  });
}

// ---------------------------------------------------------------------------
// Failed renewals, grace and recovery
// ---------------------------------------------------------------------------

/**
 * A renewal the provider could not collect.
 *
 * Access is kept until the gym's grace deadline, and that deadline is anchored
 * to the *first* failure. Mercado Pago retries a failed subscription charge
 * several times; letting each retry restart the clock would hand a member an
 * open-ended free period.
 *
 * Grace applies to renewals only. Before the first approved payment there is
 * no access to protect, so a rejected first charge simply leaves the member
 * where they were: waiting to pay.
 */
async function applyFailedRecurringPayment(
  ctx: any,
  params: {
    agreement: Doc<"memberRecurringAgreements">;
    failedAt: number;
    now: number;
  },
) {
  const { agreement, now } = params;

  const neverPaid =
    agreement.status === "pending_authorization" ||
    agreement.status === "pending_first_payment";
  if (neverPaid) return;

  // A member who already cancelled, or whose agreement is paused for a full
  // bonification, is not put into a retry cycle by a stray failure.
  if (
    agreement.status === "cancelled" ||
    agreement.status === "cancellation_scheduled" ||
    agreement.status === "paused_bonification"
  ) {
    return;
  }

  if (agreement.firstFailureAt !== undefined) {
    // Already inside a grace window: record the attempt, move nothing.
    if (agreement.status !== "retrying") {
      await ctx.db.patch(agreement._id, { status: "retrying", updatedAt: now });
    }
    return;
  }

  const settings = await getMemberPaymentSettings(
    ctx,
    agreement.organizationId,
  );

  // Anchor grace to the provider's own debit date, so a notification that
  // arrives late does not hand the member extra free days. Clamped to this
  // billing cycle and to now: a stale or future date must not silently
  // produce a grace window that is already over, or one that never ends.
  const earliest = agreement.currentPeriodStart ?? params.failedAt;
  const firstFailureAt = Math.min(
    params.now,
    Math.max(params.failedAt, earliest),
  );

  const graceUntil = computeGraceUntil(
    firstFailureAt,
    settings.gracePeriodDays,
  );

  await ctx.db.patch(agreement._id, {
    status: "retrying",
    firstFailureAt,
    graceUntil,
    updatedAt: now,
  });

  logMemberPaymentEvent({
    event: "grace_opened",
    organizationId: String(agreement.organizationId),
    agreementId: String(agreement._id),
    externalReference: agreement.externalReference,
  });

  const failedSubscription = await ctx.db.get(agreement.subscriptionId);
  if (failedSubscription) {
    await ctx.scheduler?.runAfter(
      0,
      internal.memberPaymentNotifications.notifyMember,
      {
        userId: failedSubscription.userId,
        event: "member_payment_failed",
        dedupeKey: `${agreement._id}:${firstFailureAt}`,
        subscriptionId: agreement.subscriptionId,
      },
    );
  }

  // The local subscription deliberately stays `active`: the member keeps
  // access through grace. Clients read `retrying` from the agreement to show
  // the payment problem.
}

/**
 * Suspend the members whose grace period has run out.
 *
 * `graceUntil` is cleared once it has been acted on, so the worker's queue
 * drains instead of revisiting every suspended agreement forever.
 * `firstFailureAt` stays as the audit anchor, and also stops a later failed
 * retry from opening a second grace window.
 */
export const expireMemberPaymentGracePeriods = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    // `gte(1)` excludes agreements with no deadline: Convex sorts an absent
    // field before every value, so an open range would scan every agreement
    // that has never failed.
    const due = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_grace_until", (q) =>
        q.gte("graceUntil", 1).lte("graceUntil", now),
      )
      .take(args.limit ?? 50);

    let suspended = 0;

    for (const agreement of due) {
      if (agreement.graceUntil === undefined) continue;
      if (agreement.status !== "retrying") {
        await ctx.db.patch(agreement._id, {
          graceUntil: undefined,
          updatedAt: now,
        });
        continue;
      }

      const subscription = await ctx.db.get(agreement.subscriptionId);
      if (subscription && subscription.status === "active") {
        await setFamilyGroupStatus(ctx, subscription, "suspended", now);
        suspended += 1;

        logMemberPaymentEvent({
          event: "grace_expired",
          organizationId: String(agreement.organizationId),
          agreementId: String(agreement._id),
        });

        await ctx.scheduler.runAfter(
          0,
          internal.memberPaymentNotifications.notifyMember,
          {
            userId: subscription.userId,
            event: "member_payment_suspended",
            dedupeKey: `${agreement._id}:${agreement.graceUntil}`,
            subscriptionId: subscription._id,
          },
        );
      }

      await ctx.db.patch(agreement._id, {
        graceUntil: undefined,
        updatedAt: now,
      });
    }

    return { examined: due.length, suspended };
  },
});

// ---------------------------------------------------------------------------
// Refunds and chargebacks
// ---------------------------------------------------------------------------

/**
 * Undo what a reversed payment bought — but only where it is still safe to.
 *
 * A reversal of the period the member is currently inside removes that
 * verified coverage and suspends them. A reversal of a period that has already
 * ended is *not* rewritten: later months may have been paid separately, and
 * silently reopening closed history would corrupt the payment record. That
 * case is flagged for a human instead.
 *
 * Either way the commission is reversed with a compensating ledger entry, so
 * collected history is never edited in place.
 */
async function applyPaymentReversal(
  ctx: any,
  params: {
    transactionId: Id<"memberPaymentTransactions">;
    status: "refunded" | "charged_back";
    now: number;
  },
) {
  const transaction = await ctx.db.get(params.transactionId);
  if (!transaction) return;

  await reverseCommissionSnapshot(ctx, transaction, params.now);

  if (!transaction.planPaymentId) {
    await flagTransactionForAttention(
      ctx,
      transaction._id,
      `${params.status}: no local payment period was linked to this charge`,
      params.now,
    );
    return;
  }

  const payment = await ctx.db.get(transaction.planPaymentId);
  if (!payment) return;

  const coverageEndsAt = payment.billingCycleEndAt;
  const isHistorical =
    coverageEndsAt !== undefined && coverageEndsAt <= params.now;

  if (isHistorical) {
    await flagTransactionForAttention(
      ctx,
      transaction._id,
      `${params.status}: reversal of the closed period ${payment.billingPeriod}; review manually before changing coverage`,
      params.now,
    );
    return;
  }

  // Current coverage: the money came back, so the period is no longer paid.
  await ctx.db.patch(payment._id, {
    status: "declined",
    reviewNotes:
      params.status === "refunded"
        ? "Pago devuelto por Mercado Pago."
        : "Contracargo de Mercado Pago.",
    reviewedAt: params.now,
    updatedAt: params.now,
  });
  await reverseMembershipPaymentReward(ctx, payment._id);

  const subscription = await ctx.db.get(payment.subscriptionId);
  if (!subscription) return;

  // Another approved payment may already cover this period — an advance
  // purchase, a transfer, or a bonification. Only suspend when nothing does.
  const stillCovered = await hasApprovedCoverage(
    ctx,
    payment.subscriptionId,
    payment.billingPeriod,
  );
  if (!stillCovered && subscription.status === "active") {
    await setFamilyGroupStatus(ctx, subscription, "suspended", params.now);
  }

  await flagTransactionForAttention(
    ctx,
    transaction._id,
    `${params.status}: coverage for ${payment.billingPeriod} was removed`,
    params.now,
  );
}

async function hasApprovedCoverage(
  ctx: any,
  subscriptionId: Id<"memberPlanSubscriptions">,
  billingPeriod: string,
): Promise<boolean> {
  const payments = await ctx.db
    .query("planPayments")
    .withIndex("by_subscription_period", (q: any) =>
      q.eq("subscriptionId", subscriptionId).eq("billingPeriod", billingPeriod),
    )
    .collect();

  return payments.some((payment: any) => payment.status === "approved");
}

async function flagTransactionForAttention(
  ctx: any,
  transactionId: Id<"memberPaymentTransactions">,
  reason: string,
  now: number,
) {
  await ctx.db.patch(transactionId, {
    requiresAttention: true,
    attentionReason: reason.slice(0, 300),
    updatedAt: now,
  });

  const transaction = await ctx.db.get(transactionId);
  if (!transaction) return;

  logMemberPaymentEvent({
    event: "webhook_rejected",
    organizationId: String(transaction.organizationId),
    providerResourceId: transaction.providerTransactionId,
    reason,
  });

  // The gym has to act on this: a mismatched charge must not be honoured, and
  // a reversal usually needs a refund or a conversation with the member.
  await ctx.scheduler?.runAfter(
    0,
    internal.memberPaymentNotifications.alertAdmins,
    {
      organizationId: transaction.organizationId,
      kind: reason.startsWith("amount_mismatch")
        ? "amount_mismatch"
        : "payment_reversed",
      dedupeKey: `${transactionId}:${reason.slice(0, 40)}`,
      correlationId: transaction.providerTransactionId,
    },
  );
}

/**
 * Compensating ledger entry for a reversed payment.
 *
 * The original accrual is left untouched: collected commission history is
 * append-only, so a reversal is a new negative entry rather than an edit.
 */
async function reverseCommissionSnapshot(
  ctx: any,
  transaction: Doc<"memberPaymentTransactions">,
  now: number,
) {
  const original = await ctx.db
    .query("platformCommissionLedger")
    .withIndex("by_transaction", (q: any) =>
      q.eq("transactionId", transaction._id),
    )
    .first();
  if (!original || original.reversesLedgerId !== undefined) return;

  const alreadyReversed = await ctx.db
    .query("platformCommissionLedger")
    .withIndex("by_organization_created", (q: any) =>
      q.eq("organizationId", transaction.organizationId),
    )
    .collect();
  if (
    alreadyReversed.some(
      (entry: any) => entry.reversesLedgerId === original._id,
    )
  ) {
    return;
  }

  await ctx.db.insert("platformCommissionLedger", {
    organizationId: original.organizationId,
    billingPlanId: original.billingPlanId,
    transactionId: transaction._id,
    grossAmountArs: -original.grossAmountArs,
    feeBasisArs: -original.feeBasisArs,
    platformFeeBps: original.platformFeeBps,
    feeAmountArs: -original.feeAmountArs,
    collectionMode: original.collectionMode,
    status: original.feeAmountArs > 0 ? "accrued" : "not_applicable",
    reversesLedgerId: original._id,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Advance purchases
// ---------------------------------------------------------------------------

/**
 * Turn one approved advance payment into the months it bought.
 *
 * Coverage starts at the first cycle that is not already paid, so prepaying
 * three months always buys three *unpaid* months rather than overwriting one
 * the member already settled by transfer. Every generated row carries the same
 * `advancePaymentGroupId` and points at the same provider transaction, which is
 * what makes the purchase reviewable and reversible as one thing.
 *
 * Idempotent: the group id is derived from the transaction, and each cycle is
 * upserted by (subscription, period), so a redelivered notification produces no
 * duplicate periods.
 */
async function applyApprovedAdvancePurchase(
  ctx: any,
  params: {
    session: Doc<"memberPaymentCheckoutSessions">;
    transactionId: Id<"memberPaymentTransactions">;
    grossAmountArs: number;
    providerFeeArs?: number;
    approvedAt?: number;
    now: number;
  },
) {
  const { session, now } = params;
  if (!session.subscriptionId) return;

  const subscription = await ctx.db.get(session.subscriptionId);
  if (!subscription) return;

  const [plan, organization] = await Promise.all([
    ctx.db.get(session.planId),
    ctx.db.get(session.organizationId),
  ]);
  if (!plan) return;

  const timezone = getPaymentTimezone(organization?.timezone);
  const approvedAt = params.approvedAt ?? now;
  const anchorAt = subscription.billingAnchorAt ?? approvedAt;
  const advancePaymentGroupId = String(params.transactionId);

  // A redelivered notification must land on the months this purchase already
  // bought. Re-selecting would skip them — they are approved now — and hand
  // the member another N months for a single payment.
  const alreadyApplied = await ctx.db
    .query("planPayments")
    .withIndex("by_advance_group", (q: any) =>
      q.eq("advancePaymentGroupId", advancePaymentGroupId),
    )
    .collect();
  if (alreadyApplied.length > 0) {
    for (const payment of alreadyApplied) {
      await awardMembershipPaymentReward(ctx, {
        paymentId: payment._id,
        occurredAt: approvedAt,
      });
    }
    return;
  }

  const cycles = await selectUncoveredCycles(ctx, {
    subscriptionId: subscription._id,
    plan,
    anchorAt,
    referenceAt: approvedAt,
    count: session.months,
    timezone,
  });
  if (cycles.length === 0) return;

  const perCycleArs = splitAmountAcrossCycles(
    params.grossAmountArs,
    cycles.length,
  );

  const planPaymentIds: Id<"planPayments">[] = [];
  for (const [index, cycle] of cycles.entries()) {
    const amountArs = perCycleArs[index]!;
    const existing = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q: any) =>
        q
          .eq("subscriptionId", subscription._id)
          .eq("billingPeriod", cycle.billingPeriod),
      )
      .first();

    const fields = {
      billingCycleStartAt: cycle.cycleStartAt,
      billingCycleEndAt: cycle.cycleEndAt,
      dueAt: cycle.dueAt,
      amountArs,
      totalAmountArs: amountArs,
      // The gross/fee/net snapshot for the purchase as a whole lives on the
      // transaction; each row carries only its own share.
      grossAmountArs: amountArs,
      paymentMethod: "mercadopago_checkout" as const,
      status: "approved" as const,
      providerTransactionId: params.transactionId,
      checkoutSessionId: session._id,
      advancePaymentGroupId,
      reviewedAt: approvedAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      planPaymentIds.push(existing._id);
    } else {
      planPaymentIds.push(
        await ctx.db.insert("planPayments", {
          organizationId: session.organizationId,
          userId: subscription.userId,
          subscriptionId: subscription._id,
          planId: plan._id,
          billingPeriod: cycle.billingPeriod,
          createdAt: now,
          ...fields,
        }),
      );
    }
  }
  for (const paymentId of planPaymentIds) {
    await awardMembershipPaymentReward(ctx, {
      paymentId,
      occurredAt: approvedAt,
    });
  }

  const policyResult = await getOrganizationMemberPaymentPolicy(
    ctx,
    session.organizationId,
  );
  const platformFeeArs = computeCommissionArs(
    params.grossAmountArs,
    policyResult.policy.platformFeeBps,
  );

  await ctx.db.patch(params.transactionId, {
    planPaymentId: planPaymentIds[0],
    subscriptionId: subscription._id,
    platformFeeArs,
    gymNetAmountArs: computeGymNetArs({
      grossArs: params.grossAmountArs,
      providerFeeArs: params.providerFeeArs,
      platformFeeArs,
    }),
    updatedAt: now,
  });

  // An advance purchase is a one-time payment. It never creates a recurring
  // agreement, and the subscription stays on its manual/one-time mode.
  if (subscription.billingAnchorAt === undefined) {
    await ctx.db.patch(subscription._id, {
      billingAnchorAt: anchorAt,
      paymentMode: "mercadopago_one_time",
      updatedAt: now,
    });
  }

  await setFamilyGroupStatus(ctx, subscription, "active", now);
  await recordCommissionSnapshot(ctx, {
    organizationId: session.organizationId,
    billingPlanId: policyResult.billingPlanId,
    transactionId: params.transactionId,
    grossAmountArs: params.grossAmountArs,
    platformFeeBps: policyResult.policy.platformFeeBps,
    feeAmountArs: platformFeeArs,
    collectionMode: policyResult.policy.feeCollectionMode,
    kind: "advance",
    now,
  });
}

/**
 * The next `count` billing cycles the member has not already paid for.
 *
 * Skipping paid cycles keeps an advance purchase from silently overwriting a
 * month settled another way, and keeps the coverage the member bought equal to
 * the number of months they were charged for.
 */
async function selectUncoveredCycles(
  ctx: any,
  params: {
    subscriptionId: Id<"memberPlanSubscriptions">;
    plan: Doc<"membershipPlans">;
    anchorAt: number;
    referenceAt: number;
    count: number;
    timezone: string;
  },
) {
  // Generous lookahead so a member with a year of coverage still gets cycles
  // beyond it, while staying bounded.
  const candidates = getAdvanceBillingCycles(
    params.plan,
    params.anchorAt,
    params.referenceAt,
    params.count + MAX_COVERED_LOOKAHEAD_CYCLES,
    params.timezone,
  );

  const selected = [];
  for (const cycle of candidates) {
    if (selected.length >= params.count) break;

    const existing = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q: any) =>
        q
          .eq("subscriptionId", params.subscriptionId)
          .eq("billingPeriod", cycle.billingPeriod),
      )
      .first();

    if (existing?.status === "approved") continue;
    selected.push(cycle);
  }

  return selected;
}

const MAX_COVERED_LOOKAHEAD_CYCLES = 24;

// ---------------------------------------------------------------------------
// Keeping the agreement in step with family size, price and bonifications
// ---------------------------------------------------------------------------

/**
 * Recompute what a provider-managed member should pay, and schedule the change
 * for their next cycle.
 *
 * Call this from any mutation that changes what a member owes: a family member
 * added or removed, a bonification created, edited or revoked. It is a no-op
 * for manual subscriptions, so callers never have to know how the member pays.
 *
 * The change is always scheduled, never applied to the cycle in progress. The
 * member already paid for the month they are in; charging a difference
 * mid-cycle (or refunding one) is not something a gym admin editing a family
 * group is asking for.
 */
export async function scheduleAgreementAmountSync(
  ctx: { db: any; scheduler?: any },
  subscriptionId: Id<"memberPlanSubscriptions">,
): Promise<void> {
  const subscription = await ctx.db.get(subscriptionId);
  if (!subscription) return;

  const billingSubscription = subscription.familyParentSubscriptionId
    ? await ctx.db.get(subscription.familyParentSubscriptionId)
    : subscription;
  if (!billingSubscription) return;

  const agreements = await ctx.db
    .query("memberRecurringAgreements")
    .withIndex("by_subscription", (q: any) =>
      q.eq("subscriptionId", billingSubscription._id),
    )
    .collect();

  const agreement = agreements.find((item: any) =>
    isLiveAgreementStatus(item.status),
  );
  // Manual, cancelled or never-set-up: nothing on the provider to change.
  if (!agreement) return;

  // A member who already asked to stop is not put back on a new amount.
  if (agreement.status === "cancellation_scheduled") return;

  const plan = await ctx.db.get(billingSubscription.planId);
  if (!plan) return;

  const memberCount = await countChargeableFamilyMembers(
    ctx,
    billingSubscription,
  );
  const bonification = await ctx.db
    .query("planBonifications")
    .withIndex("by_subscription_status", (q: any) =>
      q.eq("subscriptionId", billingSubscription._id).eq("status", "active"),
    )
    .first();

  const nextAmountArs = computeEffectiveCycleAmountArs({
    planPriceArs: plan.priceArs,
    memberCount,
    bonification,
  });

  const now = Date.now();
  const effectiveAt = agreement.currentPeriodEnd ?? agreement.nextChargeAt;

  // Nothing owed: a full bonification pauses the debit rather than trying to
  // charge zero, which Mercado Pago rejects.
  if (nextAmountArs === 0) {
    if (agreement.status === "paused_bonification") return;
    await ctx.db.patch(agreement._id, {
      pendingAmountArs: 0,
      pendingAmountEffectiveAt: effectiveAt,
      familyMemberCount: memberCount,
      updatedAt: now,
    });
    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "pause",
      input: { effectiveAt, reason: "full_bonification" },
    });
    return;
  }

  const resuming = agreement.status === "paused_bonification";

  // Compare against what the provider has most recently been told, not against
  // the amount the member is paying now. An edit that undoes an earlier one
  // still has to reach Mercado Pago, or the reverted amount stays scheduled.
  const scheduledAmountArs = agreement.pendingAmountArs ?? agreement.amountArs;
  if (!resuming && nextAmountArs === scheduledAmountArs) {
    if (agreement.familyMemberCount !== memberCount) {
      await ctx.db.patch(agreement._id, {
        familyMemberCount: memberCount,
        updatedAt: now,
      });
    }
    return;
  }

  await ctx.db.patch(agreement._id, {
    // Only a real difference from the current cycle is "pending"; landing back
    // on today's amount means there is nothing left to announce.
    pendingAmountArs:
      nextAmountArs === agreement.amountArs ? undefined : nextAmountArs,
    pendingAmountEffectiveAt:
      nextAmountArs === agreement.amountArs ? undefined : effectiveAt,
    familyMemberCount: memberCount,
    updatedAt: now,
  });

  await enqueueProviderOperation(ctx, {
    organizationId: agreement.organizationId,
    connectionId: agreement.connectionId,
    agreementId: agreement._id,
    operation: "update_amount",
    input: { amountArs: nextAmountArs, effectiveAt },
  });

  // The member should hear about a price change before it is charged, not
  // discover it on their statement.
  await ctx.scheduler?.runAfter(
    0,
    internal.memberPaymentNotifications.notifyAmountChange,
    {
      userId: billingSubscription.userId,
      subscriptionId: billingSubscription._id,
      dedupeKey: `${agreement._id}:${nextAmountArs}:${effectiveAt ?? 0}`,
      newAmountArs: nextAmountArs,
      effectiveAt,
    },
  );

  if (resuming) {
    // Ordered behind the amount change: resuming first would let the provider
    // reinstate the old, bonified amount for the next charge.
    await enqueueProviderOperation(ctx, {
      organizationId: agreement.organizationId,
      connectionId: agreement.connectionId,
      agreementId: agreement._id,
      operation: "resume",
      input: { effectiveAt },
      delayMs: RESUME_AFTER_AMOUNT_DELAY_MS,
    });
  }
}

/** Small ordering gap so an amount update lands before the resume that follows it. */
const RESUME_AFTER_AMOUNT_DELAY_MS = 5_000;

/**
 * How much earlier than the intended date a resumed charge may fall before it
 * counts as charging early. A day absorbs provider-side rounding of dates.
 */
const RESUME_CHARGE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** Members of the family group who are still active in the gym. */
async function countChargeableFamilyMembers(
  ctx: { db: any },
  billingSubscription: Doc<"memberPlanSubscriptions">,
): Promise<number> {
  const children = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_family_parent", (q: any) =>
      q.eq("familyParentSubscriptionId", billingSubscription._id),
    )
    .collect();

  const group = [billingSubscription, ...children].filter(
    (item: any) => item.status !== "cancelled",
  );

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

  return Math.max(
    1,
    group.filter((item: any) => activeUserIds.has(item.userId)).length,
  );
}

/**
 * Retire subscriptions whose disclosed access end has arrived.
 *
 * Access ends on the date the member was shown, not when they tapped cancel,
 * and the whole family group goes together — nobody keeps training on a plan
 * that stopped being paid for, and nobody loses access early.
 */
export const expireScheduledCancellations = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();

    // `gte(1)` excludes the subscriptions with no end date: Convex sorts an
    // absent field before every value, so an open range would scan them all.
    const due = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_access_ends_at", (q) =>
        q.gte("accessEndsAt", 1).lte("accessEndsAt", now),
      )
      .take(args.limit ?? 50);

    let cancelled = 0;

    for (const subscription of due) {
      if (subscription.status === "cancelled") continue;

      const children = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_family_parent", (q) =>
          q.eq("familyParentSubscriptionId", subscription._id),
        )
        .collect();

      for (const item of [subscription, ...children]) {
        if (item.status === "cancelled") continue;
        await ctx.db.patch(item._id, {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
      }

      const agreements = await ctx.db
        .query("memberRecurringAgreements")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscription._id),
        )
        .collect();

      for (const agreement of agreements) {
        if (agreement.status === "cancelled") continue;
        await ctx.db.patch(agreement._id, {
          status: "cancelled",
          nextChargeAt: undefined,
          updatedAt: now,
        });
      }

      cancelled += 1;
    }

    return { examined: due.length, cancelled };
  },
});

/**
 * Remind members whose grace period is about to run out.
 *
 * Sent once per grace window: the deadline is part of the dedupe key, and the
 * deadline never moves, so retries of the underlying charge cannot turn this
 * into a stream of warnings.
 */
export const notifyGraceDeadlines = internalMutation({
  args: { withinMs: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const horizon = now + (args.withinMs ?? 24 * 60 * 60 * 1000);

    const agreements = await ctx.db
      .query("memberRecurringAgreements")
      .withIndex("by_grace_until", (q) =>
        q.gte("graceUntil", now).lte("graceUntil", horizon),
      )
      .take(args.limit ?? 100);

    let notified = 0;
    for (const agreement of agreements) {
      if (
        agreement.status !== "retrying" ||
        agreement.graceUntil === undefined
      ) {
        continue;
      }

      const subscription = await ctx.db.get(agreement.subscriptionId);
      if (!subscription || subscription.status !== "active") continue;

      await ctx.scheduler.runAfter(
        0,
        internal.memberPaymentNotifications.notifyMember,
        {
          userId: subscription.userId,
          event: "member_payment_grace_ending",
          dedupeKey: `${agreement._id}:${agreement.graceUntil}`,
          subscriptionId: subscription._id,
        },
      );
      notified += 1;
    }

    return { notified };
  },
});

/**
 * Coarse payment state for the public web fallback page.
 *
 * Deliberately minimal. A member who lands on the website instead of the app
 * is not signed in there, so this cannot be behind authentication — which
 * means the only safe thing to return is a state, with no amount, plan,
 * organization or identity attached. It exists to answer "did it work, and how
 * do I get back", nothing more.
 *
 * An unknown id returns `unknown` rather than an error, so the endpoint cannot
 * be used to confirm whether a given session exists.
 */
export const getCheckoutSessionPublicStatusInternal = internalQuery({
  args: { sessionId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "approved" | "processing" | "failed" | "expired" | "unknown" }> => {
    const sessionId = ctx.db.normalizeId(
      "memberPaymentCheckoutSessions",
      args.sessionId,
    );
    if (!sessionId) return { status: "unknown" };

    const session = await ctx.db.get(sessionId);
    if (!session) return { status: "unknown" };

    // Access is what the member actually cares about, and it is the only
    // signal that means a payment was verified.
    if (session.subscriptionId) {
      const subscription = await ctx.db.get(session.subscriptionId);
      if (subscription?.status === "active") return { status: "approved" };
    }

    switch (session.status) {
      case "approved":
        return { status: "approved" };
      case "failed":
      case "cancelled":
        return { status: "failed" };
      case "expired":
        return { status: "expired" };
      default:
        return { status: "processing" };
    }
  },
});
