/**
 * Fake Mercado Pago transport for automated tests.
 *
 * Automated tests must never reach the live API. This records every request,
 * replays scripted responses, and can simulate the failure modes the
 * integration has to survive: timeouts after the provider already succeeded,
 * 401-then-refresh, rate limiting, and duplicate delivery of the same call.
 *
 * The double-dotted filename keeps this file out of the Convex deployment
 * bundle.
 */

import type {
  MercadoPagoRequest,
  MercadoPagoResponse,
  MercadoPagoTransport,
} from "./mercadoPagoTransport";

export type RecordedRequest = MercadoPagoRequest & { at: number };

type Responder = (
  request: RecordedRequest,
  callIndex: number,
) => MercadoPagoResponse | Promise<MercadoPagoResponse>;

export type RouteKey = `${MercadoPagoRequest["method"]} ${string}`;

export class FakeMercadoPago {
  readonly requests: RecordedRequest[] = [];
  private readonly routes = new Map<string, Responder>();
  private readonly callCounts = new Map<string, number>();
  private clock = 0;

  /**
   * Register a responder. `pattern` is `"<METHOD> <path>"`; a trailing `*`
   * matches any suffix, e.g. `"GET /preapproval/*"`.
   */
  on(pattern: RouteKey, responder: Responder | MercadoPagoResponse): this {
    this.routes.set(
      pattern,
      typeof responder === "function" ? responder : () => responder,
    );
    return this;
  }

  /** Convenience: respond 200 with `body`. */
  onJson(pattern: RouteKey, body: unknown, status = 200): this {
    return this.on(pattern, { status, ok: status < 300, body });
  }

  /** Respond with `first` on the first call and `rest` afterwards. */
  onSequence(pattern: RouteKey, responses: MercadoPagoResponse[]): this {
    return this.on(pattern, (_request, callIndex) => {
      const index = Math.min(callIndex, responses.length - 1);
      return responses[index]!;
    });
  }

  /**
   * The provider processed the request but the response never arrived. The
   * caller sees a network error while the resource exists — the case
   * idempotency keys must cover.
   */
  onLostResponse(pattern: RouteKey, onProviderSuccess?: () => void): this {
    return this.on(pattern, () => {
      onProviderSuccess?.();
      throw new MercadoPagoNetworkError("The operation was aborted");
    });
  }

  /** How many times a matching request was made. */
  countFor(pattern: RouteKey): number {
    return this.callCounts.get(pattern) ?? 0;
  }

  /** Idempotency keys seen for a route, in order (duplicates included). */
  idempotencyKeysFor(pattern: RouteKey): string[] {
    return this.requests
      .filter((request) => matches(pattern, request))
      .map((request) => request.idempotencyKey ?? "");
  }

  reset() {
    this.requests.length = 0;
    this.routes.clear();
    this.callCounts.clear();
    this.clock = 0;
  }

  readonly transport: MercadoPagoTransport = async (request) => {
    const recorded: RecordedRequest = { ...request, at: (this.clock += 1) };
    this.requests.push(recorded);

    const pattern = this.resolveRoute(request);
    if (pattern) {
      const callIndex = this.callCounts.get(pattern) ?? 0;
      this.callCounts.set(pattern, callIndex + 1);
      return await this.routes.get(pattern)!(recorded, callIndex);
    }

    throw new Error(
      `FakeMercadoPago: no responder registered for ${request.method} ${request.path}`,
    );
  };

  /**
   * Most specific route wins: an exact path beats a wildcard, and a longer
   * wildcard prefix beats a shorter one.
   *
   * Registration order would otherwise let `GET /authorized_payments/*`
   * swallow `GET /authorized_payments/search`, which is a real endpoint with a
   * completely different response shape — a mistake that reads as a product
   * bug rather than a test-setup bug.
   */
  private resolveRoute(request: MercadoPagoRequest): string | null {
    const candidates = [...this.routes.keys()].filter((pattern) =>
      matches(pattern, request),
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const aWildcard = a.endsWith("*");
      const bWildcard = b.endsWith("*");
      if (aWildcard !== bWildcard) return aWildcard ? 1 : -1;
      return b.length - a.length;
    });

    return candidates[0]!;
  }
}

export class MercadoPagoNetworkError extends Error {
  readonly isNetworkError = true;
}

function matches(pattern: string, request: MercadoPagoRequest): boolean {
  const [method, rawPath] = pattern.split(" ");
  if (method !== request.method) return false;
  const path = rawPath ?? "";
  if (path.endsWith("*")) {
    return request.path.startsWith(path.slice(0, -1));
  }
  return request.path === path;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  requestId = "fake-request-id",
): MercadoPagoResponse {
  return { status, ok: status < 300, body, requestId };
}

export function errorResponse(
  status: number,
  body: unknown,
): MercadoPagoResponse {
  return { status, ok: false, body, requestId: "fake-request-id" };
}
