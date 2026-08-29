/**
 * The single seam between MAT and the Mercado Pago HTTP API.
 *
 * Every provider call in the member-payment feature goes through a
 * `MercadoPagoTransport`. Production uses `fetchMercadoPagoTransport`;
 * automated tests inject a fake so they never touch the live API.
 */

export const MERCADO_PAGO_API_BASE = "https://api.mercadopago.com";

export type MercadoPagoRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path relative to the API base, e.g. `/preapproval/123`. */
  path: string;
  /** Bearer token: the gym's access token, or the app token for OAuth calls. */
  accessToken?: string;
  body?: unknown;
  /**
   * Persisted idempotency key. Required on creation calls so a retry after a
   * lost response cannot create a second provider resource.
   */
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
};

export type MercadoPagoResponse = {
  status: number;
  ok: boolean;
  body: any;
  /** Provider request id, kept for support correlation. Never a secret. */
  requestId?: string;
};

export type MercadoPagoTransport = (
  request: MercadoPagoRequest,
) => Promise<MercadoPagoResponse>;

export const DEFAULT_MP_TIMEOUT_MS = 15_000;

export function buildMercadoPagoUrl(request: MercadoPagoRequest): string {
  const url = new URL(request.path, MERCADO_PAGO_API_BASE);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Strip anything that must never reach a log or an error message: bearer
 * tokens, OAuth secrets and payer contact details.
 */
export function sanitizeProviderError(status: number, body: unknown): string {
  const raw =
    typeof body === "object" && body !== null
      ? ((body as any).message ?? (body as any).error ?? "")
      : String(body ?? "");
  const message = String(raw)
    .replace(/\b(APP_USR|TEST)-[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .slice(0, 300);
  return message ? `MercadoPago ${status}: ${message}` : `MercadoPago ${status}`;
}

export const fetchMercadoPagoTransport: MercadoPagoTransport = async (
  request,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? DEFAULT_MP_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (request.accessToken) {
      headers.Authorization = `Bearer ${request.accessToken}`;
    }
    if (request.idempotencyKey) {
      headers["X-Idempotency-Key"] = request.idempotencyKey;
    }

    const response = await fetch(buildMercadoPagoUrl(request), {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text.slice(0, 300) };
    }

    return {
      status: response.status,
      ok: response.ok,
      body,
      requestId: response.headers.get("x-request-id") ?? undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
};
