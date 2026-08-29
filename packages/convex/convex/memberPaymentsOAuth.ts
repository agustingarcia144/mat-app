/**
 * Mercado Pago OAuth exchanges, expressed against the transport seam so tests
 * can run them without touching the live API.
 *
 * These functions never persist anything and never log a token: they take a
 * transport and credentials in, and hand plaintext tokens back to the caller,
 * which is responsible for encrypting them immediately.
 */

import {
  sanitizeProviderError,
  type MercadoPagoTransport,
} from "./mercadoPagoTransport";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type ProviderTokens = {
  accessToken: string;
  refreshToken: string;
  providerAccountId: string;
  expiresInSeconds?: number;
  liveMode?: boolean;
};

export type SellerIdentity = {
  providerAccountId: string;
  nickname?: string;
  email?: string;
  siteId?: string;
};

export class MercadoPagoOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function readTokens(body: any): ProviderTokens {
  const accessToken = body?.access_token;
  const refreshToken = body?.refresh_token;
  const userId = body?.user_id;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new MercadoPagoOAuthError(
      "missing_access_token",
      "MercadoPago did not return an access token",
    );
  }
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    // Without a refresh token the connection would silently die at expiry.
    throw new MercadoPagoOAuthError(
      "missing_refresh_token",
      "MercadoPago did not return a refresh token — check that the application requests offline_access",
    );
  }
  if (userId === undefined || userId === null || String(userId).length === 0) {
    throw new MercadoPagoOAuthError(
      "missing_user_id",
      "MercadoPago did not return a seller id",
    );
  }

  return {
    accessToken,
    refreshToken,
    providerAccountId: String(userId),
    expiresInSeconds:
      typeof body?.expires_in === "number" ? body.expires_in : undefined,
    liveMode: typeof body?.live_mode === "boolean" ? body.live_mode : undefined,
  };
}

export async function exchangeAuthorizationCode(
  transport: MercadoPagoTransport,
  params: { code: string; config: OAuthConfig },
): Promise<ProviderTokens> {
  const response = await transport({
    method: "POST",
    path: "/oauth/token",
    body: {
      client_id: params.config.clientId,
      client_secret: params.config.clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.config.redirectUri,
    },
  });

  if (!response.ok) {
    throw new MercadoPagoOAuthError(
      "exchange_failed",
      sanitizeProviderError(response.status, response.body),
      response.status,
    );
  }

  return readTokens(response.body);
}

export async function refreshAccessToken(
  transport: MercadoPagoTransport,
  params: { refreshToken: string; config: OAuthConfig },
): Promise<ProviderTokens> {
  const response = await transport({
    method: "POST",
    path: "/oauth/token",
    body: {
      client_id: params.config.clientId,
      client_secret: params.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    },
  });

  if (!response.ok) {
    throw new MercadoPagoOAuthError(
      "refresh_failed",
      sanitizeProviderError(response.status, response.body),
      response.status,
    );
  }

  return readTokens(response.body);
}

export async function fetchSellerIdentity(
  transport: MercadoPagoTransport,
  accessToken: string,
): Promise<SellerIdentity> {
  const response = await transport({
    method: "GET",
    path: "/users/me",
    accessToken,
  });

  if (!response.ok) {
    throw new MercadoPagoOAuthError(
      "identity_failed",
      sanitizeProviderError(response.status, response.body),
      response.status,
    );
  }

  const body = response.body ?? {};
  if (body.id === undefined || body.id === null) {
    throw new MercadoPagoOAuthError(
      "identity_missing_id",
      "MercadoPago identity response had no seller id",
    );
  }

  return {
    providerAccountId: String(body.id),
    nickname: typeof body.nickname === "string" ? body.nickname : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    siteId: typeof body.site_id === "string" ? body.site_id : undefined,
  };
}

/**
 * The token exchange and the identity lookup must agree on which seller
 * authorized the connection. A mismatch means the tokens do not belong to the
 * account MAT is about to record, so the connection is refused.
 */
export function assertSellerMatchesTokens(
  tokens: ProviderTokens,
  identity: SellerIdentity,
) {
  if (tokens.providerAccountId !== identity.providerAccountId) {
    throw new MercadoPagoOAuthError(
      "seller_mismatch",
      "The MercadoPago token and identity refer to different seller accounts",
    );
  }
}
