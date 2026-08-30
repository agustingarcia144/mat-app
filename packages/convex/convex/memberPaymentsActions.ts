/**
 * Provider-facing actions for member payments: OAuth connect, token refresh
 * and connection health checks.
 *
 * The implementation plan suggested a `memberPaymentsNode.ts`; the Node runtime
 * turned out to be unnecessary. AES-GCM comes from Web Crypto and Mercado Pago
 * is reached with `fetch`, both available in the Convex default runtime — the
 * same runtime the existing SaaS billing integration uses. The separation the
 * plan asked for is preserved: credentials and external calls live only here.
 */

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  buildAuthorizationUrl,
  buildConnectionNotificationUrl,
  OAUTH_STATE_TTL_MS,
  parseExternalReference,
  resolveAccessTokenExpiry,
  resolveReturnPath,
} from "./memberPaymentDomain";
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256Hex,
} from "./memberPaymentsCrypto";
import {
  getMemberPaymentsMobileReturnUrl,
  getMemberPaymentsWebhookBaseUrl,
  getMercadoPagoOAuthConfig,
  isMemberMercadoPagoEnabled,
  isMercadoPagoSandbox,
  MEMBER_MP_DISABLED_REASON,
} from "./memberPaymentsEnv";
import {
  assertSellerMatchesTokens,
  exchangeAuthorizationCode,
  fetchSellerIdentity,
  MercadoPagoOAuthError,
  refreshAccessToken,
  type ProviderTokens,
} from "./memberPaymentsOAuth";
import {
  fetchMercadoPagoTransport,
  sanitizeProviderError,
  type MercadoPagoTransport,
} from "./mercadoPagoTransport";
import {
  createPreapproval,
  createPreference,
  fetchWebhookResource,
  findLatestAuthorizedPayment,
  findPreapprovalByExternalReference,
  getPreapproval,
  MercadoPagoApiError,
  setPreapprovalStatus,
  toNetworkError,
  updatePreapprovalAmount,
  type ClientContext,
  type WebhookResourceType,
} from "./mercadoPagoClient";

/**
 * Production transport. Kept behind a getter so a test can substitute a fake
 * without any production code path reading a different value.
 */
let transport: MercadoPagoTransport = fetchMercadoPagoTransport;

/** Test seam. Never called from production code. */
export function __setMercadoPagoTransportForTests(
  next: MercadoPagoTransport,
): () => void {
  const previous = transport;
  transport = next;
  return () => {
    transport = previous;
  };
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

/**
 * Start the OAuth flow. Returns the Mercado Pago authorization URL the admin's
 * browser should be sent to.
 *
 * The random state never leaves this function in storable form: only its
 * SHA-256 hash is persisted, so a leaked database row cannot be replayed.
 */
export const beginMercadoPagoConnection = action({
  args: { returnPath: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const { organizationId, userId } = await ctx.runQuery(
      internal.memberPayments.requireAdminOrganization,
      {},
    );

    const config = getMercadoPagoOAuthConfig();
    const state = randomToken();
    const stateHash = await sha256Hex(state);

    await ctx.runMutation(internal.memberPayments.createOAuthStateInternal, {
      stateHash,
      organizationId,
      initiatedBy: userId,
      returnPath: resolveReturnPath(args.returnPath),
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });

    return {
      authorizationUrl: buildAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      }),
    };
  },
});

/**
 * Finish the OAuth flow. Called only by the HTTP callback route.
 *
 * Returns a short result code plus the allowlisted return path, so the HTTP
 * handler can redirect without ever seeing a token or a provider message.
 */
export const completeMercadoPagoConnection = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    reason?: string;
    returnPath: string;
  }> => {
    const stateHash = await sha256Hex(args.state);
    const consumed = await ctx.runMutation(
      internal.memberPayments.consumeOAuthStateInternal,
      { stateHash },
    );

    // Unknown, expired or already-used state: nothing to attribute the code to.
    if (!consumed) {
      console.error("[member-payments] oauth connect failed: invalid_state");
      return { ok: false, reason: "invalid_state", returnPath: "" };
    }

    const returnPath = consumed.returnPath;

    try {
      const config = getMercadoPagoOAuthConfig();
      const tokens = await exchangeAuthorizationCode(transport, {
        code: args.code,
        config,
      });
      const identity = await fetchSellerIdentity(transport, tokens.accessToken);
      assertSellerMatchesTokens(tokens, identity);

      // OAuth has no separate sandbox credentials: the same application
      // client id and secret serve both, and whether money is real depends on
      // who authorized. On a sandbox deployment that makes it possible to
      // connect a genuine gym account by signing in with the wrong Mercado
      // Pago login — after which real members would be charged for real.
      // Refuse it: a test deployment must only ever hold test accounts.
      if (isMercadoPagoSandbox() && tokens.liveMode === true) {
        console.error(
          "[member-payments] oauth connect failed: live_account_on_sandbox " +
            `(seller ${identity.providerAccountId})`,
        );
        return { ok: false, reason: "live_account_on_sandbox", returnPath };
      }

      const now = Date.now();
      const [accessToken, refreshToken] = await Promise.all([
        encryptSecret(tokens.accessToken),
        encryptSecret(tokens.refreshToken),
      ]);

      await ctx.runMutation(internal.memberPayments.upsertConnectionInternal, {
        organizationId: consumed.organizationId,
        connectedBy: consumed.initiatedBy,
        providerAccountId: identity.providerAccountId,
        providerNickname: identity.nickname,
        providerEmail: identity.email,
        providerSiteId: identity.siteId,
        liveMode: tokens.liveMode,
        accessTokenCiphertext: accessToken.ciphertext,
        accessTokenIv: accessToken.iv,
        refreshTokenCiphertext: refreshToken.ciphertext,
        refreshTokenIv: refreshToken.iv,
        encryptionKeyVersion: accessToken.keyVersion,
        accessTokenExpiresAt: resolveAccessTokenExpiry(
          tokens.expiresInSeconds,
          now,
        ),
        webhookRoutingKey: randomToken(24),
      });

      return { ok: true, returnPath };
    } catch (error) {
      const reason = classifyConnectError(error);
      // The message is already sanitized (no token, no payer email), so it is
      // safe in the deployment log — and without it a failed connection is
      // indistinguishable from every other failed connection.
      console.error(
        `[member-payments] oauth connect failed: ${reason}`,
        error instanceof Error ? error.message : String(error),
      );
      return { ok: false, reason, returnPath };
    }
  },
});

/**
 * Short, non-sensitive result codes. The provider's own message is deliberately
 * dropped: it can echo a token or a payer email into a URL the browser logs.
 */
function classifyConnectError(error: unknown): string {
  if (error instanceof MercadoPagoOAuthError) return error.code;
  const message = error instanceof Error ? error.message : "";
  if (message === "SELLER_ALREADY_CONNECTED") return "seller_already_connected";
  return "connect_failed";
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Decrypt a connection's access token, refreshing it first when it is close to
 * expiry. Internal only — the plaintext token stays inside the calling action.
 */
async function resolveAccessToken(
  ctx: { runQuery: any; runMutation: any },
  connectionId: Id<"organizationPaymentProviderConnections">,
  forceRefresh = false,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.memberPayments.getConnectionInternal,
    { connectionId },
  );

  if (!connection || connection.status === "disconnected") {
    throw new Error("MercadoPago connection is not available");
  }

  const needsRefresh =
    forceRefresh ||
    (connection.accessTokenExpiresAt !== undefined &&
      connection.accessTokenExpiresAt <= Date.now());

  if (needsRefresh) {
    const refreshed = await refreshConnection(ctx, connectionId);
    if (refreshed) return refreshed;
  }

  return await decryptSecret({
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    keyVersion: connection.encryptionKeyVersion,
  });
}

export const getConnectionAccessTokenInternal = internalAction({
  args: {
    connectionId: v.id("organizationPaymentProviderConnections"),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> =>
    await resolveAccessToken(ctx, args.connectionId, args.forceRefresh === true),
});

/**
 * Build an adapter context for a gym connection.
 *
 * The adapter gets a one-shot refresh callback, so a token that expires
 * between resolution and the call is repaired in place instead of surfacing as
 * a spurious failure.
 */
async function buildClientContext(
  ctx: { runQuery: any; runMutation: any },
  connectionId: Id<"organizationPaymentProviderConnections">,
): Promise<ClientContext> {
  return {
    transport,
    accessToken: await resolveAccessToken(ctx, connectionId),
    refreshAccessToken: async () => await refreshConnection(ctx, connectionId),
  };
}

/**
 * Exchange the refresh token for a new access token.
 *
 * The write is conditional on the `lastRefreshedAt` value read here, so two
 * concurrent refreshes cannot overwrite each other: the loser keeps the newer
 * credentials rather than reinstating its own.
 */
async function refreshConnection(
  ctx: { runQuery: any; runMutation: any },
  connectionId: Id<"organizationPaymentProviderConnections">,
): Promise<string | null> {
  const connection = await ctx.runQuery(
    internal.memberPayments.getConnectionInternal,
    { connectionId },
  );
  if (!connection) return null;

  const expectedLastRefreshedAt = connection.lastRefreshedAt;

  let tokens: ProviderTokens;
  try {
    const refreshToken = await decryptSecret({
      ciphertext: connection.refreshTokenCiphertext,
      iv: connection.refreshTokenIv,
      keyVersion: connection.encryptionKeyVersion,
    });
    tokens = await refreshAccessToken(transport, {
      refreshToken,
      config: getMercadoPagoOAuthConfig(),
    });
  } catch (error) {
    await ctx.runMutation(
      internal.memberPayments.recordConnectionStatusInternal,
      {
        connectionId,
        status: "refresh_required",
        lastError:
          error instanceof MercadoPagoOAuthError
            ? error.message
            : "Token refresh failed",
      },
    );
    return null;
  }

  const [accessToken, newRefreshToken] = await Promise.all([
    encryptSecret(tokens.accessToken),
    encryptSecret(tokens.refreshToken),
  ]);

  const result = await ctx.runMutation(
    internal.memberPayments.recordConnectionRefreshInternal,
    {
      connectionId,
      expectedLastRefreshedAt,
      accessTokenCiphertext: accessToken.ciphertext,
      accessTokenIv: accessToken.iv,
      refreshTokenCiphertext: newRefreshToken.ciphertext,
      refreshTokenIv: newRefreshToken.iv,
      encryptionKeyVersion: accessToken.keyVersion,
      accessTokenExpiresAt: resolveAccessTokenExpiry(
        tokens.expiresInSeconds,
        Date.now(),
      ),
    },
  );

  // Another refresh won the race; its token is the current one.
  if (!result.applied) return null;

  return tokens.accessToken;
}

export const refreshConnectionInternal = internalAction({
  args: { connectionId: v.id("organizationPaymentProviderConnections") },
  handler: async (ctx, args): Promise<{ refreshed: boolean }> => {
    const token = await refreshConnection(ctx, args.connectionId);
    return { refreshed: token !== null };
  },
});

/** Scheduled job: refresh every connection approaching token expiry. */
export const refreshExpiringConnections = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ attempted: number }> => {
    const { TOKEN_REFRESH_MARGIN_MS } = await import("./memberPaymentDomain");
    const connectionIds: Id<"organizationPaymentProviderConnections">[] =
      await ctx.runQuery(
        internal.memberPayments.listConnectionsForRefreshInternal,
        {
          before: Date.now() + TOKEN_REFRESH_MARGIN_MS,
          limit: args.limit ?? 25,
        },
      );

    for (const connectionId of connectionIds) {
      await refreshConnection(ctx, connectionId);
    }

    return { attempted: connectionIds.length };
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Admin-triggered check that the gym's credentials still work. Retries once
 * through a refresh on an authentication failure before reporting a problem.
 */
export const checkMercadoPagoConnectionHealth = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    status: "active" | "refresh_required" | "error" | "disconnected" | "none";
    reason?: string;
    sellerNickname?: string;
  }> => {
    const { organizationId } = await ctx.runQuery(
      internal.memberPayments.requireAdminOrganization,
      {},
    );

    if (!isMemberMercadoPagoEnabled()) {
      return { status: "error", reason: MEMBER_MP_DISABLED_REASON };
    }

    const connection = await ctx.runQuery(
      internal.memberPayments.getConnectionByOrganizationInternal,
      { organizationId },
    );

    if (!connection) return { status: "none" };
    if (connection.status === "disconnected") return { status: "disconnected" };

    for (const forceRefresh of [false, true]) {
      let accessToken: string;
      try {
        accessToken = await ctx.runAction(
          internal.memberPaymentsActions.getConnectionAccessTokenInternal,
          { connectionId: connection._id, forceRefresh },
        );
      } catch {
        continue;
      }

      const response = await transport({
        method: "GET",
        path: "/users/me",
        accessToken,
      });

      if (response.ok) {
        await ctx.runMutation(
          internal.memberPayments.recordConnectionStatusInternal,
          { connectionId: connection._id, status: "active", healthChecked: true },
        );
        return {
          status: "active",
          sellerNickname:
            typeof response.body?.nickname === "string"
              ? response.body.nickname
              : undefined,
        };
      }

      // Anything other than an auth failure will not be fixed by refreshing.
      if (response.status !== 401) {
        const reason = sanitizeProviderError(response.status, response.body);
        await ctx.runMutation(
          internal.memberPayments.recordConnectionStatusInternal,
          {
            connectionId: connection._id,
            status: "error",
            lastError: reason,
            healthChecked: true,
          },
        );
        return { status: "error", reason };
      }
    }

    await ctx.runMutation(
      internal.memberPayments.recordConnectionStatusInternal,
      {
        connectionId: connection._id,
        status: "refresh_required",
        lastError: "MercadoPago rejected the stored credentials",
        healthChecked: true,
      },
    );
    return {
      status: "refresh_required",
      reason:
        "Mercado Pago rechazó las credenciales guardadas. Volvé a conectar la cuenta.",
    };
  },
});

// ---------------------------------------------------------------------------
// Provider-operation outbox worker
// ---------------------------------------------------------------------------

/**
 * Perform the provider calls for operations that are due.
 *
 * This intentionally ignores `MEMBER_MP_PAYMENTS_ENABLED`. The kill switch
 * stops new checkouts; it must not strand a gym's existing agreements with a
 * pending pause, amount change or cancellation.
 */
export const runProviderOperations = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ processed: number }> => {
    const claimed = await ctx.runMutation(
      internal.memberPayments.claimDueOperationsInternal,
      { limit: args.limit ?? 20 },
    );

    for (const operation of claimed) {
      await executeProviderOperation(ctx, operation);
    }

    return { processed: claimed.length };
  },
});

type ClaimedOperation = {
  _id: Id<"memberPaymentProviderOperations">;
  connectionId: Id<"organizationPaymentProviderConnections">;
  agreementId?: Id<"memberRecurringAgreements">;
  operation: "update_amount" | "pause" | "resume" | "cancel" | "resync";
  idempotencyKey: string;
  input?: { amountArs?: number; effectiveAt?: number; reason?: string };
};

async function executeProviderOperation(
  ctx: { runQuery: any; runMutation: any },
  operation: ClaimedOperation,
): Promise<void> {
  const complete = (result: {
    succeeded: boolean;
    retryable?: boolean;
    error?: string;
    providerPreapprovalStatus?: string;
    providerNextChargeAt?: number;
  }) =>
    ctx.runMutation(internal.memberPayments.completeOperationInternal, {
      operationId: operation._id,
      ...result,
    });

  if (!operation.agreementId) {
    await complete({
      succeeded: false,
      retryable: false,
      error: "Operation has no target agreement",
    });
    return;
  }

  const agreement = await ctx.runQuery(
    internal.memberPayments.getAgreementInternal,
    { agreementId: operation.agreementId },
  );

  if (!agreement?.providerPreapprovalId) {
    // Nothing exists on the provider side yet, so there is nothing to change
    // and never will be for this operation.
    await complete({
      succeeded: false,
      retryable: false,
      error: "Agreement has no MercadoPago preapproval",
    });
    return;
  }

  let client: ClientContext;
  try {
    client = await buildClientContext(ctx, operation.connectionId);
  } catch {
    // The connection is broken or disconnected: retryable, because an admin
    // reconnecting repairs it without any change to this operation.
    await complete({
      succeeded: false,
      retryable: true,
      error: "MercadoPago connection unavailable",
    });
    return;
  }

  try {
    switch (operation.operation) {
      case "update_amount": {
        const amountArs = operation.input?.amountArs;
        if (amountArs === undefined || !Number.isInteger(amountArs) || amountArs < 0) {
          await complete({
            succeeded: false,
            retryable: false,
            error: "update_amount requires a non-negative integer ARS amount",
          });
          return;
        }
        await updatePreapprovalAmount(client, {
          preapprovalId: agreement.providerPreapprovalId,
          amountArs,
          idempotencyKey: operation.idempotencyKey,
        });
        break;
      }
      case "pause":
      case "resume":
      case "cancel": {
        const status =
          operation.operation === "pause"
            ? "paused"
            : operation.operation === "resume"
              ? "authorized"
              : "cancelled";
        const updated = await setPreapprovalStatus(client, {
          preapprovalId: agreement.providerPreapprovalId,
          status,
          idempotencyKey: operation.idempotencyKey,
        });

        // The resumed agreement's next charge date decides whether resuming is
        // safe at all, so it is carried back to the state transition.
        await complete({
          succeeded: true,
          providerPreapprovalStatus: updated.status,
          providerNextChargeAt: parseProviderDate(updated.nextPaymentDate),
        });
        return;
      }
      case "resync": {
        const preapproval = await getPreapproval(
          client,
          agreement.providerPreapprovalId,
        );
        await complete({
          succeeded: true,
          providerPreapprovalStatus: preapproval.status,
          providerNextChargeAt: parseProviderDate(preapproval.nextPaymentDate),
        });
        return;
      }
    }

    await complete({ succeeded: true });
  } catch (error) {
    const apiError =
      error instanceof MercadoPagoApiError ? error : toNetworkError(error);
    await complete({
      succeeded: false,
      retryable: apiError.retryable,
      error: apiError.message,
    });
  }
}

/**
 * The mobile return URL for one checkout, carrying its local session id.
 *
 * A member who kills the app mid-checkout comes back through a cold start, and
 * the universal link is then the only thing that can tell the return screen
 * which checkout to ask about. The id identifies a session the caller already
 * owns — it is not a credential, and nothing in the URL can grant access.
 */
function buildMobileReturnUrl(sessionId: string): string {
  const url = new URL(getMemberPaymentsMobileReturnUrl());
  url.searchParams.set("session", sessionId);
  return url.toString();
}

function parseProviderDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

/**
 * Fetch the authoritative resource for one notification and apply it.
 *
 * A browser return or a notification body is never trusted: MAT re-fetches the
 * resource with the gym's own token and verifies the seller, organization and
 * external reference before anything is applied.
 */
export const processWebhookEvent = internalAction({
  args: { eventId: v.id("paymentProviderWebhookEvents") },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const mark = async (
      status: "processed" | "failed" | "ignored",
      error?: string,
    ) => {
      await ctx.runMutation(internal.memberPayments.markWebhookEventInternal, {
        eventId: args.eventId,
        status,
        error,
      });
      return { status };
    };

    const event = await ctx.runQuery(
      internal.memberPayments.getWebhookEventInternal,
      { eventId: args.eventId },
    );

    if (!event) return { status: "missing" };
    if (!event.connectionId || !event.resourceType || !event.resourceId) {
      return await mark("ignored", "Notification carried no usable resource");
    }

    const connection = await ctx.runQuery(
      internal.memberPayments.getConnectionInternal,
      { connectionId: event.connectionId },
    );
    if (!connection) return await mark("ignored", "Connection no longer exists");

    let fetched;
    try {
      const client = await buildClientContext(ctx, event.connectionId);
      fetched = await fetchWebhookResource(
        client,
        event.resourceType as WebhookResourceType,
        event.resourceId,
      );
    } catch (error) {
      const apiError =
        error instanceof MercadoPagoApiError ? error : toNetworkError(error);
      // A resource the provider says does not exist will never appear; a
      // transient failure is picked up again by reconciliation.
      return await mark(
        apiError.status === 404 ? "ignored" : "failed",
        apiError.message,
      );
    }

    const ownership = verifyResourceOwnership(fetched, connection);
    if (!ownership.ok) return await mark(ownership.mark, ownership.reason);

    const result = await ctx.runMutation(
      internal.memberPayments.applyProviderEventInternal,
      { connectionId: event.connectionId, source: "webhook", ...toEventArgs(fetched) },
    );

    if (!result.applied) {
      // Unknown local object: either a resource MAT never created, or one
      // whose local row has not been written yet. Reconciliation retries it.
      return await mark(
        result.reason === "unknown_agreement" || result.reason === "unknown_session"
          ? "failed"
          : "ignored",
        result.reason,
      );
    }

    if ("amountMismatch" in result && result.amountMismatch) {
      // The money is recorded, but the discrepancy has to reach an operator.
      return await mark(
        "processed",
        "amount_mismatch: charged amount does not match the agreed amount",
      );
    }

    return await mark("processed");
  },
});

type FetchedResource = Awaited<ReturnType<typeof fetchWebhookResource>>;

/**
 * Confirm the resource really belongs to this gym.
 *
 * A notification whose seller or external reference points somewhere else is
 * not ours to apply, no matter how it reached this endpoint.
 */
function verifyResourceOwnership(
  fetched: FetchedResource,
  connection: {
    providerAccountId: string;
    organizationId: Id<"organizations">;
  },
):
  | { ok: true }
  | { ok: false; mark: "ignored" | "failed"; reason: string } {
  const collectorId =
    fetched.type === "subscription_preapproval"
      ? fetched.resource.collectorId
      : fetched.type === "payment"
        ? fetched.resource.collectorId
        : undefined;

  if (collectorId !== undefined && collectorId !== connection.providerAccountId) {
    return {
      ok: false,
      mark: "ignored",
      reason: "seller_mismatch: resource belongs to a different MercadoPago account",
    };
  }

  const externalReference = fetched.resource.externalReference;
  if (!externalReference) {
    return {
      ok: false,
      mark: "ignored",
      reason: "no_external_reference: not a MAT-created resource",
    };
  }

  const parsed = parseExternalReference(externalReference);
  if (!parsed) {
    return {
      ok: false,
      mark: "ignored",
      reason: "foreign_external_reference: not a MAT-created resource",
    };
  }

  if (parsed.organizationId !== String(connection.organizationId)) {
    return {
      ok: false,
      mark: "ignored",
      reason: "organization_mismatch: reference belongs to another gym",
    };
  }

  return { ok: true };
}

/** Shape a fetched resource into the transition mutation's arguments. */
function toEventArgs(fetched: FetchedResource) {
  switch (fetched.type) {
    case "subscription_preapproval":
      return {
        preapproval: {
          id: fetched.resource.id,
          status: fetched.resource.status,
          externalReference: fetched.resource.externalReference,
          amountArs: fetched.resource.amountArs,
          nextChargeAt: parseProviderDate(fetched.resource.nextPaymentDate),
        },
      };
    case "subscription_authorized_payment":
      return {
        authorizedPayment: {
          id: fetched.resource.id,
          preapprovalId: fetched.resource.preapprovalId,
          externalReference: fetched.resource.externalReference,
          paymentId: fetched.resource.paymentId,
          paymentStatus: fetched.resource.paymentStatus,
          statusDetail: fetched.resource.paymentStatusDetail,
          amountArs: fetched.resource.amountArs,
          approvedAt: parseProviderDate(fetched.resource.debitDate),
        },
      };
    case "payment":
      return {
        payment: {
          id: fetched.resource.id,
          status: fetched.resource.status,
          statusDetail: fetched.resource.statusDetail,
          externalReference: fetched.resource.externalReference,
          amountArs: fetched.resource.amountArs,
          providerFeeArs: fetched.resource.providerFeeArs,
          netReceivedArs: fetched.resource.netReceivedArs,
          approvedAt: parseProviderDate(fetched.resource.approvedAt),
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Repair what webhooks missed.
 *
 * Notifications get lost, delayed and dropped; this asks the provider what
 * actually happened rather than waiting. Everything it applies goes through
 * the same idempotent transition mutation, so running it repeatedly is safe.
 */
export const reconcileMemberPayments = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    retriedEvents: number;
    expiredSessions: number;
    resyncedAgreements: number;
  }> => {
    const limit = args.limit ?? 25;
    const now = Date.now();

    // 1. Events whose processing action died mid-flight.
    const stuckEventIds: Id<"paymentProviderWebhookEvents">[] =
      await ctx.runQuery(internal.memberPayments.listStuckWebhookEventsInternal, {
        olderThan: now - STUCK_EVENT_MS,
        limit,
      });
    for (const eventId of stuckEventIds) {
      await ctx.runAction(internal.memberPaymentsActions.processWebhookEvent, {
        eventId,
      });
    }

    // 2. Checkout sessions the member abandoned or that timed out.
    const expiredSessionIds: Id<"memberPaymentCheckoutSessions">[] =
      await ctx.runQuery(
        internal.memberPayments.listExpiredCheckoutSessionsInternal,
        { limit },
      );
    for (const sessionId of expiredSessionIds) {
      await ctx.runMutation(
        internal.memberPayments.expireCheckoutSessionInternal,
        { sessionId },
      );
    }

    // 3. Agreements MAT has not confirmed recently: ask the provider directly.
    const staleAgreements: Array<{
      _id: Id<"memberRecurringAgreements">;
      connectionId: Id<"organizationPaymentProviderConnections">;
      providerPreapprovalId?: string;
    }> = await ctx.runQuery(
      internal.memberPayments.listAgreementsNeedingResyncInternal,
      { staleBefore: now - STALE_AGREEMENT_MS, limit },
    );

    let resyncedAgreements = 0;
    for (const agreement of staleAgreements) {
      if (!agreement.providerPreapprovalId) continue;
      const applied = await resyncAgreement(
        ctx,
        agreement.connectionId,
        agreement.providerPreapprovalId,
      );
      if (applied) resyncedAgreements += 1;
    }

    return {
      retriedEvents: stuckEventIds.length,
      expiredSessions: expiredSessionIds.length,
      resyncedAgreements,
    };
  },
});

const STUCK_EVENT_MS = 5 * 60 * 1000;
const STALE_AGREEMENT_MS = 30 * 60 * 1000;

/**
 * Pull an agreement's current provider state, plus its most recent charge.
 *
 * The charge lookup is what repairs a missed first-payment notification: the
 * preapproval alone only says the member authorized the debit, never that the
 * money arrived.
 */
async function resyncAgreement(
  ctx: { runQuery: any; runMutation: any },
  connectionId: Id<"organizationPaymentProviderConnections">,
  preapprovalId: string,
): Promise<boolean> {
  let client: ClientContext;
  try {
    client = await buildClientContext(ctx, connectionId);
  } catch {
    return false;
  }

  try {
    const preapproval = await getPreapproval(client, preapprovalId);
    await ctx.runMutation(internal.memberPayments.applyProviderEventInternal, {
      connectionId,
      source: "reconciliation",
      preapproval: {
        id: preapproval.id,
        status: preapproval.status,
        externalReference: preapproval.externalReference,
        amountArs: preapproval.amountArs,
        nextChargeAt: parseProviderDate(preapproval.nextPaymentDate),
      },
    });

    const latestCharge = await findLatestAuthorizedPayment(client, preapprovalId);
    if (latestCharge) {
      await ctx.runMutation(internal.memberPayments.applyProviderEventInternal, {
        connectionId,
        source: "reconciliation",
        authorizedPayment: {
          id: latestCharge.id,
          preapprovalId: latestCharge.preapprovalId,
          externalReference: latestCharge.externalReference,
          paymentId: latestCharge.paymentId,
          paymentStatus: latestCharge.paymentStatus,
          statusDetail: latestCharge.paymentStatusDetail,
          amountArs: latestCharge.amountArs,
          approvedAt: parseProviderDate(latestCharge.debitDate),
        },
      });
    }

    return true;
  } catch {
    // A gym that is temporarily unreachable is picked up on the next pass.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recurring checkout
// ---------------------------------------------------------------------------

/**
 * Start automatic debit for the calling member.
 *
 * Returns only a checkout URL and a local session id. The amount, the plan,
 * the organization and the payer are all resolved on the server; nothing about
 * money or access is accepted from the caller.
 */
export const startRecurringCheckout = action({
  args: { planId: v.id("membershipPlans") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sessionId: Id<"memberPaymentCheckoutSessions">;
    checkoutUrl: string;
    resumed: boolean;
  }> => {
    const context = await ctx.runQuery(
      internal.memberPaymentsCheckout.getRecurringCheckoutContextInternal,
      { planId: args.planId },
    );

    if (!context.ok) throw new Error(context.reason);

    // A repeated tap while a checkout is still open returns the same link
    // instead of creating a second agreement.
    if ("resume" in context && context.resume) {
      return {
        sessionId: context.resume.sessionId,
        checkoutUrl: context.resume.checkoutUrl,
        resumed: true,
      };
    }

    if (!("create" in context) || !context.create) {
      throw new Error("No se pudo preparar el pago.");
    }

    const plan = context.create;
    const connection = await ctx.runQuery(
      internal.memberPayments.getConnectionInternal,
      { connectionId: plan.connectionId },
    );
    if (!connection) throw new Error("Tu gimnasio no tiene Mercado Pago conectado.");

    // Local rows first: a lost provider response is then recoverable by
    // external reference rather than producing a duplicate agreement.
    const created = await ctx.runMutation(
      internal.memberPaymentsCheckout.createRecurringCheckoutSessionInternal,
      {
        organizationId: plan.organizationId,
        userId: plan.userId,
        planId: plan.planId,
        connectionId: plan.connectionId,
        subscriptionId: plan.subscriptionId,
        amountArs: plan.amountArs,
        coveredMemberCount: plan.coveredMemberCount,
        startAt: plan.startAt,
      },
    );

    try {
      const client = await buildClientContext(ctx, plan.connectionId);
      const notificationUrl = buildConnectionNotificationUrl(
        getMemberPaymentsWebhookBaseUrl(),
        connection.webhookRoutingKey,
      );

      let preapproval;
      try {
        preapproval = await createPreapproval(client, {
          reason: `${plan.planName} - ${connection.providerNickname ?? "MAT"}`,
          externalReference: created.externalReference,
          amountArs: plan.amountArs,
          notificationUrl,
          backUrl: buildMobileReturnUrl(created.sessionId),
          idempotencyKey: created.idempotencyKey,
          // Undefined for a member with no coverage, so they are charged on
          // authorization; a date for one switching from transfer mid-cycle.
          startAt: plan.startAt,
        });
      } catch (error) {
        const apiError =
          error instanceof MercadoPagoApiError ? error : toNetworkError(error);
        // The provider may have created the preapproval before the response
        // was lost. Adopt that resource rather than creating a second one.
        if (apiError.kind !== "network" && apiError.kind !== "transient") throw apiError;
        preapproval = await findPreapprovalByExternalReference(
          client,
          created.externalReference,
        );
        if (!preapproval) throw apiError;
      }

      if (!preapproval.initPoint) {
        throw new MercadoPagoApiError(
          "permanent",
          "MercadoPago returned no checkout URL",
        );
      }

      await ctx.runMutation(
        internal.memberPaymentsCheckout.attachCheckoutResourcesInternal,
        {
          sessionId: created.sessionId,
          agreementId: created.agreementId,
          providerPreapprovalId: preapproval.id,
          checkoutUrl: preapproval.initPoint,
        },
      );

      return {
        sessionId: created.sessionId,
        checkoutUrl: preapproval.initPoint,
        resumed: false,
      };
    } catch (error) {
      const apiError =
        error instanceof MercadoPagoApiError ? error : toNetworkError(error);
      await ctx.runMutation(
        internal.memberPaymentsCheckout.failCheckoutSessionInternal,
        {
          sessionId: created.sessionId,
          agreementId: created.agreementId,
          reason: apiError.message,
        },
      );
      // The provider's own wording is kept out of the member-facing message.
      throw new Error(
        "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en unos minutos.",
      );
    }
  },
});

/**
 * Buy 3, 6 or 12 months up front.
 *
 * A one-time Mercado Pago checkout: no recurring agreement is created, so
 * nothing keeps debiting once the purchased months run out.
 */
export const startAdvanceCheckout = action({
  args: { planId: v.id("membershipPlans"), months: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sessionId: Id<"memberPaymentCheckoutSessions">;
    checkoutUrl: string;
    amountArs: number;
  }> => {
    const context = await ctx.runQuery(
      internal.memberPaymentsCheckout.getAdvanceCheckoutContextInternal,
      { planId: args.planId, months: args.months },
    );
    if (!context.ok) throw new Error(context.reason);

    const plan = context.create;
    const connection = await ctx.runQuery(
      internal.memberPayments.getConnectionInternal,
      { connectionId: plan.connectionId },
    );
    if (!connection) throw new Error("Tu gimnasio no tiene Mercado Pago conectado.");

    const created = await ctx.runMutation(
      internal.memberPaymentsCheckout.createAdvanceCheckoutSessionInternal,
      {
        organizationId: plan.organizationId,
        userId: plan.userId,
        planId: plan.planId,
        connectionId: plan.connectionId,
        subscriptionId: plan.subscriptionId,
        months: plan.months,
        amountArs: plan.amountArs,
      },
    );

    try {
      const client = await buildClientContext(ctx, plan.connectionId);
      const preference = await createPreference(client, {
        title: `${plan.planName} - ${plan.months} meses`,
        externalReference: created.externalReference,
        amountArs: plan.amountArs,
        notificationUrl: buildConnectionNotificationUrl(
          getMemberPaymentsWebhookBaseUrl(),
          connection.webhookRoutingKey,
        ),
        backUrl: buildMobileReturnUrl(created.sessionId),
        idempotencyKey: created.idempotencyKey,
        marketplaceFeeArs: plan.marketplaceFeeArs,
      });

      await ctx.runMutation(
        internal.memberPaymentsCheckout.attachCheckoutResourcesInternal,
        {
          sessionId: created.sessionId,
          providerPreferenceId: preference.id,
          checkoutUrl: preference.initPoint,
        },
      );

      return {
        sessionId: created.sessionId,
        checkoutUrl: preference.initPoint,
        amountArs: plan.amountArs,
      };
    } catch (error) {
      const apiError =
        error instanceof MercadoPagoApiError ? error : toNetworkError(error);
      await ctx.runMutation(
        internal.memberPaymentsCheckout.failCheckoutSessionInternal,
        { sessionId: created.sessionId, reason: apiError.message },
      );
      throw new Error(
        "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en unos minutos.",
      );
    }
  },
});
