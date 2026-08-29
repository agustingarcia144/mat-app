/**
 * Typed Mercado Pago adapter for member payments.
 *
 * Every provider call the feature makes goes through here, so authentication,
 * timeouts, idempotency, error classification and retry rules live in exactly
 * one place. The adapter takes a `MercadoPagoTransport` rather than calling
 * `fetch` itself, which is what lets tests exercise every failure mode without
 * touching the live API.
 *
 * The adapter is stateless: the caller supplies the gym's access token. It
 * never reads the database and never logs a token or a raw payload.
 */

import {
  sanitizeProviderError,
  type MercadoPagoRequest,
  type MercadoPagoTransport,
} from "./mercadoPagoTransport";

// ---------------------------------------------------------------------------
// Errors and retry classification
// ---------------------------------------------------------------------------

export type ProviderErrorKind =
  /** Credentials rejected. Worth exactly one refresh-and-retry. */
  | "auth"
  /** Provider asked us to slow down. Retryable. */
  | "rate_limited"
  /** Provider fault or timeout. Retryable. */
  | "transient"
  /** Request will never succeed as written. Never retry. */
  | "permanent"
  /** No response reached us; the provider may or may not have acted. */
  | "network";

export class MercadoPagoApiError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "MercadoPagoApiError";
  }

  /**
   * Whether a retry could plausibly succeed. Validation, permission and
   * not-found errors are excluded: retrying those just burns attempts and
   * delays the alert an operator needs to see.
   */
  get retryable(): boolean {
    return (
      this.kind === "rate_limited" ||
      this.kind === "transient" ||
      this.kind === "network"
    );
  }
}

export function classifyProviderStatus(status: number): ProviderErrorKind {
  if (status === 401) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 408) return "transient";
  if (status >= 500) return "transient";
  // 400, 403, 404, 409, 422 and every other 4xx: the request itself is wrong.
  return "permanent";
}

/** Turn a thrown transport failure (abort, DNS, socket) into a typed error. */
export function toNetworkError(error: unknown): MercadoPagoApiError {
  const message =
    error instanceof Error ? error.message : "MercadoPago request failed";
  return new MercadoPagoApiError("network", message.slice(0, 200));
}

// ---------------------------------------------------------------------------
// Request execution
// ---------------------------------------------------------------------------

export type ClientContext = {
  transport: MercadoPagoTransport;
  accessToken: string;
  /**
   * Called once when the provider rejects the credentials. Returns a fresh
   * access token, or null when the connection can no longer be refreshed.
   */
  refreshAccessToken?: () => Promise<string | null>;
};

async function request(
  ctx: ClientContext,
  spec: Omit<MercadoPagoRequest, "accessToken">,
): Promise<any> {
  let accessToken = ctx.accessToken;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await ctx.transport({ ...spec, accessToken });
    } catch (error) {
      throw toNetworkError(error);
    }

    if (response.ok) return response.body;

    const kind = classifyProviderStatus(response.status);

    // A rejected token is worth exactly one refresh-and-retry; anything else
    // will look the same on a second identical call.
    if (kind === "auth" && attempt === 0 && ctx.refreshAccessToken) {
      const refreshed = await ctx.refreshAccessToken();
      if (refreshed) {
        accessToken = refreshed;
        continue;
      }
    }

    throw new MercadoPagoApiError(
      kind,
      sanitizeProviderError(response.status, response.body),
      response.status,
      response.requestId,
    );
  }

  // Unreachable: the loop either returns or throws.
  throw new MercadoPagoApiError("transient", "MercadoPago request exhausted");
}

// ---------------------------------------------------------------------------
// Recurring agreements (preapprovals)
// ---------------------------------------------------------------------------

export type CreatePreapprovalParams = {
  /** Shown to the member on the Mercado Pago checkout. */
  reason: string;
  externalReference: string;
  payerEmail?: string;
  amountArs: number;
  /** Per-connection notification URL carrying the random routing key. */
  notificationUrl: string;
  /** Mobile universal link the member returns to. */
  backUrl: string;
  /** Persisted before the call so a retry reuses the same key. */
  idempotencyKey: string;
  /**
   * When the first debit should happen, as an epoch timestamp.
   *
   * Omitted, Mercado Pago charges as soon as the member authorizes. That is
   * right for a member with no coverage, and wrong for one switching from
   * transfer mid-cycle — they would pay twice for the same month.
   */
  startAt?: number;
};

export type PreapprovalResource = {
  id: string;
  status: string;
  externalReference?: string;
  collectorId?: string;
  amountArs?: number;
  currency?: string;
  nextPaymentDate?: string;
  initPoint?: string;
};

function readPreapproval(body: any): PreapprovalResource {
  const amount =
    body?.auto_recurring?.transaction_amount ?? body?.transaction_amount;
  return {
    id: String(body?.id ?? ""),
    status: String(body?.status ?? "unknown"),
    externalReference: body?.external_reference ?? undefined,
    collectorId:
      body?.collector_id === undefined || body?.collector_id === null
        ? undefined
        : String(body.collector_id),
    amountArs: typeof amount === "number" ? amount : undefined,
    currency:
      body?.auto_recurring?.currency_id ?? body?.currency_id ?? undefined,
    nextPaymentDate: body?.next_payment_date ?? undefined,
    initPoint: body?.init_point ?? undefined,
  };
}

/**
 * Create a "no associated plan" preapproval: MAT owns the pricing, so each
 * agreement carries its own amount rather than referencing a provider plan.
 * Created in `pending` status — the member authorizes it in the checkout.
 */
export async function createPreapproval(
  ctx: ClientContext,
  params: CreatePreapprovalParams,
): Promise<PreapprovalResource> {
  const body = await request(ctx, {
    method: "POST",
    path: "/preapproval",
    idempotencyKey: params.idempotencyKey,
    body: {
      reason: params.reason,
      external_reference: params.externalReference,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      notification_url: params.notificationUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: params.amountArs,
        currency_id: "ARS",
        start_date:
          params.startAt === undefined
            ? undefined
            : new Date(params.startAt).toISOString(),
      },
    },
  });

  return readPreapproval(body);
}

export async function getPreapproval(
  ctx: ClientContext,
  preapprovalId: string,
): Promise<PreapprovalResource> {
  return readPreapproval(
    await request(ctx, {
      method: "GET",
      path: `/preapproval/${encodeURIComponent(preapprovalId)}`,
    }),
  );
}

/**
 * Recover the resource a lost creation response may have produced.
 *
 * When a create times out the provider may still have created the preapproval.
 * Searching by MAT's own external reference lets the retry adopt that resource
 * instead of creating a second agreement for the same member.
 */
export async function findPreapprovalByExternalReference(
  ctx: ClientContext,
  externalReference: string,
): Promise<PreapprovalResource | null> {
  const body = await request(ctx, {
    method: "GET",
    path: "/preapproval/search",
    query: { external_reference: externalReference, limit: 1 },
  });

  const results = body?.results ?? body?.elements ?? [];
  if (!Array.isArray(results) || results.length === 0) return null;
  return readPreapproval(results[0]);
}

export async function updatePreapprovalAmount(
  ctx: ClientContext,
  params: { preapprovalId: string; amountArs: number; idempotencyKey: string },
): Promise<PreapprovalResource> {
  return readPreapproval(
    await request(ctx, {
      method: "PUT",
      path: `/preapproval/${encodeURIComponent(params.preapprovalId)}`,
      idempotencyKey: params.idempotencyKey,
      body: {
        auto_recurring: {
          transaction_amount: params.amountArs,
          currency_id: "ARS",
        },
      },
    }),
  );
}

export async function setPreapprovalStatus(
  ctx: ClientContext,
  params: {
    preapprovalId: string;
    status: "paused" | "authorized" | "cancelled";
    idempotencyKey: string;
  },
): Promise<PreapprovalResource> {
  return readPreapproval(
    await request(ctx, {
      method: "PUT",
      path: `/preapproval/${encodeURIComponent(params.preapprovalId)}`,
      idempotencyKey: params.idempotencyKey,
      body: { status: params.status },
    }),
  );
}

// ---------------------------------------------------------------------------
// Recurring charges (authorized payments)
// ---------------------------------------------------------------------------

export type AuthorizedPaymentResource = {
  id: string;
  preapprovalId?: string;
  externalReference?: string;
  /** Lifecycle of the scheduled charge itself. */
  status: string;
  /** Result of the underlying payment. This is what grants access. */
  paymentStatus?: string;
  paymentStatusDetail?: string;
  paymentId?: string;
  amountArs?: number;
  currency?: string;
  debitDate?: string;
};

export async function getAuthorizedPayment(
  ctx: ClientContext,
  authorizedPaymentId: string,
): Promise<AuthorizedPaymentResource> {
  const body = await request(ctx, {
    method: "GET",
    path: `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`,
  });

  const paymentId = body?.payment?.id ?? body?.payment_id;
  return {
    id: String(body?.id ?? ""),
    preapprovalId: body?.preapproval_id ?? undefined,
    externalReference: body?.external_reference ?? undefined,
    status: String(body?.status ?? "unknown"),
    paymentStatus: body?.payment?.status ?? body?.payment_status ?? undefined,
    paymentStatusDetail: body?.payment?.status_detail ?? undefined,
    paymentId:
      paymentId === undefined || paymentId === null
        ? undefined
        : String(paymentId),
    amountArs:
      typeof body?.transaction_amount === "number"
        ? body.transaction_amount
        : undefined,
    currency: body?.currency_id ?? undefined,
    debitDate: body?.debit_date ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// One-time payments (advance purchases)
// ---------------------------------------------------------------------------

export type CreatePreferenceParams = {
  title: string;
  externalReference: string;
  amountArs: number;
  quantity?: number;
  payerEmail?: string;
  notificationUrl: string;
  backUrl: string;
  idempotencyKey: string;
  /**
   * MAT's commission, sent only when the resolved policy is a
   * provider-supported marketplace split. Omitted otherwise, and the fee is
   * accrued for monthly invoicing instead.
   */
  marketplaceFeeArs?: number;
};

export type PreferenceResource = {
  id: string;
  externalReference?: string;
  initPoint: string;
  sandboxInitPoint?: string;
};

export async function createPreference(
  ctx: ClientContext,
  params: CreatePreferenceParams,
): Promise<PreferenceResource> {
  const body = await request(ctx, {
    method: "POST",
    path: "/checkout/preferences",
    idempotencyKey: params.idempotencyKey,
    body: {
      items: [
        {
          title: params.title,
          quantity: params.quantity ?? 1,
          unit_price: params.amountArs,
          currency_id: "ARS",
        },
      ],
      external_reference: params.externalReference,
      payer: params.payerEmail ? { email: params.payerEmail } : undefined,
      notification_url: params.notificationUrl,
      back_urls: {
        success: params.backUrl,
        pending: params.backUrl,
        failure: params.backUrl,
      },
      auto_return: "approved",
      marketplace_fee: params.marketplaceFeeArs,
    },
  });

  const initPoint = body?.init_point ?? body?.sandbox_init_point;
  if (typeof initPoint !== "string" || initPoint.length === 0) {
    throw new MercadoPagoApiError(
      "permanent",
      "MercadoPago returned a preference with no checkout URL",
    );
  }

  return {
    id: String(body?.id ?? ""),
    externalReference: body?.external_reference ?? undefined,
    initPoint,
    sandboxInitPoint: body?.sandbox_init_point ?? undefined,
  };
}

export type PaymentResource = {
  id: string;
  status: string;
  statusDetail?: string;
  externalReference?: string;
  amountArs?: number;
  currency?: string;
  collectorId?: string;
  providerFeeArs?: number;
  netReceivedArs?: number;
  approvedAt?: string;
  createdAt?: string;
};

export async function getPayment(
  ctx: ClientContext,
  paymentId: string,
): Promise<PaymentResource> {
  const body = await request(ctx, {
    method: "GET",
    path: `/v1/payments/${encodeURIComponent(paymentId)}`,
  });

  const providerFee = Array.isArray(body?.fee_details)
    ? body.fee_details
        .filter((fee: any) => fee?.type !== "application_fee")
        .reduce((total: number, fee: any) => total + Number(fee?.amount ?? 0), 0)
    : undefined;

  return {
    id: String(body?.id ?? ""),
    status: String(body?.status ?? "unknown"),
    statusDetail: body?.status_detail ?? undefined,
    externalReference: body?.external_reference ?? undefined,
    amountArs:
      typeof body?.transaction_amount === "number"
        ? body.transaction_amount
        : undefined,
    currency: body?.currency_id ?? undefined,
    collectorId:
      body?.collector_id === undefined || body?.collector_id === null
        ? undefined
        : String(body.collector_id),
    providerFeeArs:
      providerFee === undefined || Number.isNaN(providerFee)
        ? undefined
        : Math.round(providerFee),
    netReceivedArs:
      typeof body?.transaction_details?.net_received_amount === "number"
        ? Math.round(body.transaction_details.net_received_amount)
        : undefined,
    approvedAt: body?.date_approved ?? undefined,
    createdAt: body?.date_created ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Webhook resource dispatch
// ---------------------------------------------------------------------------

export type WebhookResourceType =
  | "subscription_preapproval"
  | "subscription_authorized_payment"
  | "payment";

/**
 * Fetch the authoritative resource for a webhook topic.
 *
 * Topic mapping is explicit on purpose: `subscription_authorized_payment`
 * contains the word "payment" but is NOT a `/v1/payments` resource, and
 * fetching it from the wrong endpoint yields a 404 that looks like a missing
 * payment.
 */
export async function fetchWebhookResource(
  ctx: ClientContext,
  resourceType: WebhookResourceType,
  resourceId: string,
): Promise<
  | { type: "subscription_preapproval"; resource: PreapprovalResource }
  | {
      type: "subscription_authorized_payment";
      resource: AuthorizedPaymentResource;
    }
  | { type: "payment"; resource: PaymentResource }
> {
  switch (resourceType) {
    case "subscription_preapproval":
      return {
        type: "subscription_preapproval",
        resource: await getPreapproval(ctx, resourceId),
      };
    case "subscription_authorized_payment":
      return {
        type: "subscription_authorized_payment",
        resource: await getAuthorizedPayment(ctx, resourceId),
      };
    case "payment":
      return { type: "payment", resource: await getPayment(ctx, resourceId) };
  }
}

/**
 * Latest charge attempt for an agreement.
 *
 * This is how a missed `subscription_authorized_payment` notification is
 * repaired: reconciliation asks the provider what actually happened instead of
 * waiting for a webhook that is never coming.
 */
export async function findLatestAuthorizedPayment(
  ctx: ClientContext,
  preapprovalId: string,
): Promise<AuthorizedPaymentResource | null> {
  const body = await request(ctx, {
    method: "GET",
    path: "/authorized_payments/search",
    query: {
      preapproval_id: preapprovalId,
      sort: "date_created",
      criteria: "desc",
      limit: 1,
    },
  });

  const results = body?.results ?? body?.elements ?? [];
  if (!Array.isArray(results) || results.length === 0) return null;

  const raw = results[0];
  const paymentId = raw?.payment?.id ?? raw?.payment_id;
  return {
    id: String(raw?.id ?? ""),
    preapprovalId: raw?.preapproval_id ?? preapprovalId,
    externalReference: raw?.external_reference ?? undefined,
    status: String(raw?.status ?? "unknown"),
    paymentStatus: raw?.payment?.status ?? raw?.payment_status ?? undefined,
    paymentStatusDetail: raw?.payment?.status_detail ?? undefined,
    paymentId:
      paymentId === undefined || paymentId === null
        ? undefined
        : String(paymentId),
    amountArs:
      typeof raw?.transaction_amount === "number"
        ? raw.transaction_amount
        : undefined,
    currency: raw?.currency_id ?? undefined,
    debitDate: raw?.debit_date ?? undefined,
  };
}
