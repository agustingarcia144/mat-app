/**
 * Pure helpers and state-transition rules for the member-payment integration.
 *
 * Deterministic and side-effect free: no Convex context, no `Date.now()`, no
 * network. Anything that needs I/O lives in `memberPayments.ts` (database) or
 * `memberPaymentsActions.ts` (provider calls).
 */

import type { Doc } from "./_generated/dataModel";
import type { BillingMode } from "./billingDomain";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Refresh a gym's access token this long before it actually expires. */
export const TOKEN_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

export type ConnectionStatus =
  Doc<"organizationPaymentProviderConnections">["status"];

export type AgreementStatus = Doc<"memberRecurringAgreements">["status"];

/**
 * Agreement states that still depend on the gym's provider credentials.
 * A connection may not be disconnected while any of these exist.
 */
export const LIVE_AGREEMENT_STATUSES: AgreementStatus[] = [
  "pending_authorization",
  "pending_first_payment",
  "active",
  "retrying",
  "paused_bonification",
  "cancellation_scheduled",
];

export function isLiveAgreementStatus(status: AgreementStatus): boolean {
  return LIVE_AGREEMENT_STATUSES.includes(status);
}

/**
 * Destinations the OAuth callback may redirect a browser to.
 *
 * Only these exact web-app paths are allowed. An open redirect here would let
 * an attacker bounce an admin (and the `?mp=` result) to a site they control.
 */
const ALLOWED_RETURN_PATHS = [
  "/dashboard/settings",
  "/dashboard/payments",
] as const;

export const DEFAULT_RETURN_PATH = ALLOWED_RETURN_PATHS[0];

export function resolveReturnPath(requested: string | undefined | null): string {
  const candidate = (requested ?? "").trim();
  return (ALLOWED_RETURN_PATHS as readonly string[]).includes(candidate)
    ? candidate
    : DEFAULT_RETURN_PATH;
}

/** Build the final browser redirect for an OAuth callback outcome. */
export function buildOAuthResultUrl(params: {
  webAppOrigin: string;
  returnPath: string;
  result: "success" | "denied" | "error";
  reason?: string;
}): string {
  const url = new URL(resolveReturnPath(params.returnPath), params.webAppOrigin);
  url.searchParams.set("mp", params.result);
  if (params.reason) {
    // Short, non-sensitive code only — never a provider message.
    url.searchParams.set("reason", params.reason.slice(0, 60));
  }
  return url.toString();
}

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://auth.mercadopago.com/authorization");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Per-connection notification URL. The random routing key selects the gym's
 * token on an incoming webhook without putting an organization id in a URL
 * Mercado Pago stores.
 */
export function buildConnectionNotificationUrl(
  webhookBaseOrigin: string,
  webhookRoutingKey: string,
): string {
  return new URL(
    `/member-payments/webhook/${webhookRoutingKey}`,
    webhookBaseOrigin,
  ).toString();
}

export function isOAuthStateExpired(
  state: { expiresAt: number; consumedAt?: number },
  now: number,
): boolean {
  return state.expiresAt <= now;
}

export function shouldRefreshAccessToken(
  connection: { accessTokenExpiresAt?: number },
  now: number,
): boolean {
  if (connection.accessTokenExpiresAt === undefined) return false;
  return connection.accessTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS <= now;
}

/**
 * A connection's client-safe projection.
 *
 * Every credential field is dropped by construction: this builds a new object
 * from an allowlist rather than deleting keys, so a schema addition can never
 * leak a new secret by accident.
 */
export type SafeConnection = {
  _id: Doc<"organizationPaymentProviderConnections">["_id"];
  status: ConnectionStatus;
  provider: "mercadopago";
  providerAccountId: string;
  providerNickname?: string;
  providerEmail?: string;
  providerSiteId?: string;
  liveMode?: boolean;
  connectedAt?: number;
  connectedBy?: string;
  disconnectedAt?: number;
  lastHealthCheckAt?: number;
  lastError?: string;
  accessTokenExpiresAt?: number;
  lastRefreshedAt?: number;
};

export function toSafeConnection(
  connection: Doc<"organizationPaymentProviderConnections">,
): SafeConnection {
  return {
    _id: connection._id,
    status: connection.status,
    provider: connection.provider,
    providerAccountId: connection.providerAccountId,
    providerNickname: connection.providerNickname,
    providerEmail: connection.providerEmail,
    providerSiteId: connection.providerSiteId,
    liveMode: connection.liveMode,
    connectedAt: connection.connectedAt,
    connectedBy: connection.connectedBy,
    disconnectedAt: connection.disconnectedAt,
    lastHealthCheckAt: connection.lastHealthCheckAt,
    lastError: connection.lastError,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    lastRefreshedAt: connection.lastRefreshedAt,
  };
}

/** A connection usable for new checkouts and provider operations. */
export function isConnectionUsable(
  connection: Pick<
    Doc<"organizationPaymentProviderConnections">,
    "status"
  > | null,
): boolean {
  return connection?.status === "active";
}

/**
 * External reference MAT sends to the provider and matches webhooks against.
 *
 * Underscore-delimited, so every part must be free of underscores — a nonce
 * that contained one would make the reference unparseable and its
 * notifications look like they belonged to another gym. Use `randomHex` for
 * the nonce, never a base64url token.
 */
export function buildExternalReference(params: {
  kind: "sub" | "adv";
  organizationId: string;
  localId: string;
  nonce: string;
}): string {
  for (const [name, part] of Object.entries({
    organizationId: params.organizationId,
    localId: params.localId,
    nonce: params.nonce,
  })) {
    if (part.includes("_")) {
      throw new Error(
        `External reference ${name} must not contain "_" (got "${part}")`,
      );
    }
  }
  return `mat_${params.kind}_${params.organizationId}_${params.localId}_${params.nonce}`;
}

export function parseExternalReference(reference: string): {
  kind: "sub" | "adv";
  organizationId: string;
  localId: string;
  nonce: string;
} | null {
  const parts = reference.split("_");
  if (parts.length !== 5 || parts[0] !== "mat") return null;
  const [, kind, organizationId, localId, nonce] = parts;
  if (kind !== "sub" && kind !== "adv") return null;
  return {
    kind,
    organizationId: organizationId!,
    localId: localId!,
    nonce: nonce!,
  };
}

/** Provider expiry (seconds from now) -> absolute timestamp. */
export function resolveAccessTokenExpiry(
  expiresInSeconds: unknown,
  now: number,
): number | undefined {
  const seconds = Number(expiresInSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return now + seconds * 1000;
}

// ---------------------------------------------------------------------------
// Provider-operation outbox
// ---------------------------------------------------------------------------

/**
 * Attempts allowed for one queued provider operation before it is parked as
 * `permanently_failed` and surfaced to an operator. Bounded on purpose: an
 * operation that keeps failing needs a human, not an infinite retry loop.
 */
export const MAX_OPERATION_ATTEMPTS = 6;

export const OPERATION_RETRY_BASE_MS = 30_000;
export const OPERATION_RETRY_MAX_MS = 60 * 60 * 1000;

/**
 * An operation left `running` this long is assumed to have died mid-flight
 * (action crash, deploy) and is returned to the queue.
 */
export const OPERATION_STALE_RUNNING_MS = 10 * 60 * 1000;

/** Exponential backoff, capped. `attempts` counts failures so far. */
export function computeRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = OPERATION_RETRY_BASE_MS * 2 ** exponent;
  return Math.min(delay, OPERATION_RETRY_MAX_MS);
}

export function hasExhaustedAttempts(attempts: number): boolean {
  return attempts >= MAX_OPERATION_ATTEMPTS;
}

/**
 * Decide what happens to an operation after one attempt.
 *
 * Non-retryable provider errors (validation, permission, not found) go
 * straight to `permanently_failed`: repeating an identical request that the
 * provider already rejected only delays the alert.
 */
export function decideOperationOutcome(params: {
  succeeded: boolean;
  retryable: boolean;
  attempts: number;
  now: number;
}):
  | { status: "succeeded" }
  | { status: "queued"; executeAfter: number }
  | { status: "permanently_failed" } {
  if (params.succeeded) return { status: "succeeded" };
  if (!params.retryable) return { status: "permanently_failed" };
  if (hasExhaustedAttempts(params.attempts)) {
    return { status: "permanently_failed" };
  }
  return {
    status: "queued",
    executeAfter: params.now + computeRetryDelayMs(params.attempts),
  };
}

/**
 * Map a provider preapproval status onto MAT's agreement lifecycle during a
 * resync. Deliberately conservative: it never invents `active` for an
 * agreement whose first payment has not been seen, because authorization alone
 * is not proof of payment.
 */
export function mapPreapprovalStatusToAgreement(
  providerStatus: string,
  current: AgreementStatus,
): AgreementStatus {
  switch (providerStatus) {
    case "cancelled":
      return current === "cancellation_scheduled" ? current : "cancelled";
    case "paused":
      return current === "paused_bonification" ? current : "paused_bonification";
    case "pending":
      return current === "pending_authorization" ? current : current;
    case "authorized":
      // An authorized agreement that has never charged stays waiting for its
      // first approved payment; one that already charged stays as it is.
      return current === "pending_authorization"
        ? "pending_first_payment"
        : current;
    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** A notification older than this is refused, so a captured request cannot be replayed later. */
export const MAX_WEBHOOK_AGE_MS = 10 * 60 * 1000;

export type WebhookTopic =
  | "subscription_preapproval"
  | "subscription_authorized_payment"
  | "payment";

/**
 * Map a Mercado Pago topic to the resource endpoint that actually serves it.
 *
 * The ordering matters: `subscription_authorized_payment` contains the word
 * "payment" but is NOT a `/v1/payments` resource. Matching on "payment" first
 * would send every recurring charge to the wrong endpoint, where it 404s and
 * looks like a payment that never happened.
 */
export function classifyWebhookTopic(
  raw: string | undefined | null,
): WebhookTopic | null {
  const topic = String(raw ?? "").trim().toLowerCase();
  if (!topic) return null;

  if (
    topic === "subscription_authorized_payment" ||
    topic === "authorized_payment"
  ) {
    return "subscription_authorized_payment";
  }
  if (
    topic === "subscription_preapproval" ||
    topic === "preapproval" ||
    topic === "subscription"
  ) {
    return "subscription_preapproval";
  }
  if (topic === "payment") return "payment";

  // Anything else (plan, invoice, point_integration_wh, ...) is not something
  // member payments act on. Ignoring beats guessing.
  return null;
}

/** The signed manifest Mercado Pago builds for the `x-signature` v1 hash. */
export function buildWebhookSignatureManifest(params: {
  dataId: string;
  requestId: string;
  ts: string;
}): string {
  // Mercado Pago lowercases alphanumeric resource ids in the manifest.
  return `id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${params.ts};`;
}

export function parseSignatureHeader(header: string | null): {
  ts?: string;
  v1?: string;
} {
  const parts = new Map<string, string>();
  for (const part of (header ?? "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value) parts.set(key.trim(), value.trim());
  }
  return { ts: parts.get("ts"), v1: parts.get("v1") };
}

export function isWebhookTimestampFresh(ts: string, now: number): boolean {
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return false;
  const timestampMs =
    timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return Math.abs(now - timestampMs) <= MAX_WEBHOOK_AGE_MS;
}

/**
 * Connection-scoped deduplication key.
 *
 * A redelivery of the same notification carries the same provider request id,
 * so that is the key when present. Without one, the topic/resource/action
 * triple is used; reprocessing is safe either way because MAT always re-fetches
 * the authoritative resource and applies it idempotently.
 */
export function buildWebhookEventKey(params: {
  connectionId: string;
  requestId?: string;
  topic: string;
  resourceId: string;
  action?: string;
}): string {
  if (params.requestId) return `${params.connectionId}:req:${params.requestId}`;
  return `${params.connectionId}:${params.topic}:${params.resourceId}:${params.action ?? "-"}`;
}

/** Extract the routing key from `/member-payments/webhook/<key>`. */
export function parseWebhookRoutingKey(pathname: string): string | null {
  const prefix = "/member-payments/webhook/";
  if (!pathname.startsWith(prefix)) return null;
  const key = pathname.slice(prefix.length).replace(/\/.*$/, "").trim();
  return key.length > 0 ? key : null;
}

/** Map the provider's payment status onto MAT's transaction status. */
export function mapProviderPaymentStatus(
  status: string | undefined,
): Doc<"memberPaymentTransactions">["status"] {
  switch (String(status ?? "").toLowerCase()) {
    case "approved":
    case "accredited":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
      return "pending";
    default:
      return "unknown";
  }
}

export type TransactionStatus = Doc<"memberPaymentTransactions">["status"];

/**
 * Whether a newly observed provider status may replace the stored one.
 *
 * Webhooks arrive out of order and are redelivered, so an approved payment
 * must never be walked back to pending or rejected by a stale notification.
 * The only moves away from `approved` are the genuine reversals.
 */
export function canApplyTransactionStatus(
  current: TransactionStatus,
  next: TransactionStatus,
): boolean {
  if (current === next) return true;
  if (current === "approved") {
    return next === "refunded" || next === "charged_back";
  }
  // A reversal is final; nothing later un-refunds a payment.
  if (current === "refunded" || current === "charged_back") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Member payment method availability
// ---------------------------------------------------------------------------

export type MemberPaymentMethod =
  | "bank_transfer"
  | "mercadopago_recurring"
  | "mercadopago_checkout";

export type PaymentMethodOption = {
  method: MemberPaymentMethod;
  available: boolean;
  /** Member-facing explanation, in Spanish, when the method is unavailable. */
  reason?: string;
};

export type MethodAvailabilityInput = {
  killSwitchEnabled: boolean;
  /** The gym's MAT billing-plan entitlement. */
  mercadoPagoEntitled: boolean;
  bankTransferEnabled: boolean;
  mercadoPagoRecurringEnabled: boolean;
  mercadoPagoOneTimeEnabled: boolean;
  connectionUsable: boolean;
  planBillingMode: BillingMode;
  planHasInterestTiers: boolean;
  planHasAdvanceDiscounts: boolean;
  /** A family child cannot pay; only the designated payer can. */
  isFamilyChild: boolean;
  hasLiveRecurringAgreement: boolean;
};

/**
 * Which payment methods a member can actually use right now, and why not when
 * they cannot.
 *
 * Ordering matters: the first failing check wins, so the member sees the most
 * actionable reason rather than the last one in the list.
 */
export function evaluatePaymentMethods(
  input: MethodAvailabilityInput,
): PaymentMethodOption[] {
  const mercadoPagoBlocked = firstMercadoPagoBlocker(input);

  return [
    {
      method: "bank_transfer",
      available: input.bankTransferEnabled && !input.isFamilyChild,
      reason: input.isFamilyChild
        ? "El pago de tu grupo familiar lo hace el titular."
        : input.bankTransferEnabled
          ? undefined
          : "Tu gimnasio no acepta transferencias por la app.",
    },
    {
      method: "mercadopago_recurring",
      available:
        mercadoPagoBlocked === null &&
        input.mercadoPagoRecurringEnabled &&
        recurringBlocker(input) === null,
      reason:
        mercadoPagoBlocked ??
        (input.mercadoPagoRecurringEnabled
          ? (recurringBlocker(input) ?? undefined)
          : "Tu gimnasio no tiene habilitado el débito automático."),
    },
    {
      method: "mercadopago_checkout",
      available:
        mercadoPagoBlocked === null &&
        input.mercadoPagoOneTimeEnabled &&
        input.planHasAdvanceDiscounts,
      reason:
        mercadoPagoBlocked ??
        (!input.mercadoPagoOneTimeEnabled
          ? "Tu gimnasio no tiene habilitado el pago con Mercado Pago."
          : !input.planHasAdvanceDiscounts
            ? "Este plan no tiene pagos adelantados configurados."
            : undefined),
    },
  ];
}

/** Blockers that stop every Mercado Pago method, not just one. */
function firstMercadoPagoBlocker(input: MethodAvailabilityInput): string | null {
  if (input.isFamilyChild) {
    return "El pago de tu grupo familiar lo hace el titular.";
  }
  if (!input.killSwitchEnabled || !input.mercadoPagoEntitled) {
    return "Los pagos con Mercado Pago no están disponibles en este momento.";
  }
  if (!input.connectionUsable) {
    return "Tu gimnasio todavía no conectó su cuenta de Mercado Pago.";
  }
  return null;
}

/** Blockers specific to recurring debit. */
function recurringBlocker(input: MethodAvailabilityInput): string | null {
  if (input.hasLiveRecurringAgreement) {
    return "Ya tenés un débito automático en curso. Cancelalo antes de crear otro.";
  }
  if (input.planBillingMode !== "join_date") {
    return "El débito automático sólo está disponible en planes que se cobran desde tu fecha de alta.";
  }
  if (input.planHasInterestTiers) {
    // Provider retries charge the agreed amount, which cannot express MAT's
    // cumulative late-fee rules, so the combination is refused rather than
    // charging an amount that silently ignores the interest.
    return "Este plan cobra intereses por mora, que no son compatibles con el débito automático.";
  }
  return null;
}
