/**
 * Environment access for the member -> gym payment integration.
 *
 * These variables are deliberately separate from the organization -> MAT SaaS
 * billing variables (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`,
 * ...). The SaaS integration uses one global MAT seller token; member payments
 * use a per-gym OAuth connection. Never read one from the other.
 *
 * Nothing here returns a secret to a client: every accessor is meant to be
 * called from internal functions and Node actions only.
 */

/**
 * Runtime kill switch for the whole member-payment Mercado Pago feature.
 * Defaults to disabled so an unfinished rollout can never take money.
 */
export function isMemberMercadoPagoEnabled(): boolean {
  return parseBooleanFlag(process.env.MEMBER_MP_PAYMENTS_ENABLED);
}

/** Pure helper so tests can exercise the flag parsing without touching env. */
export function parseBooleanFlag(raw: string | undefined | null): boolean {
  return String(raw ?? "").trim().toLowerCase() === "true";
}

/** Reason text shown to admins/members when the switch is off. */
export const MEMBER_MP_DISABLED_REASON =
  "Los pagos con Mercado Pago están temporalmente deshabilitados.";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function getMercadoPagoOAuthConfig() {
  return {
    clientId: requireEnv("MERCADOPAGO_CLIENT_ID"),
    clientSecret: requireEnv("MERCADOPAGO_CLIENT_SECRET"),
    /**
     * Must match the redirect URI registered on the Mercado Pago application
     * exactly; Mercado Pago rejects any mismatch.
     */
    redirectUri: requireEnv("MEMBER_PAYMENTS_OAUTH_REDIRECT_URL"),
  };
}

export function getMemberPaymentsEncryptionConfig() {
  return {
    key: requireEnv("MEMBER_PAYMENTS_ENCRYPTION_KEY"),
    keyVersion: requireEnv("MEMBER_PAYMENTS_ENCRYPTION_KEY_VERSION"),
  };
}

/**
 * Public base URL of the Convex deployment, used to build the per-connection
 * member webhook notification URL.
 */
export function getMemberPaymentsWebhookBaseUrl(): string {
  const value = requireEnv("MEMBER_PAYMENTS_WEBHOOK_BASE_URL");
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(
      "MEMBER_PAYMENTS_WEBHOOK_BASE_URL must be an HTTPS URL — Mercado Pago rejects non-HTTPS notification URLs.",
    );
  }
  return url.origin;
}

/** Allowlisted web origin the OAuth callback may redirect back to. */
export function getMemberPaymentsWebAppUrl(): string {
  return new URL(requireEnv("MEMBER_PAYMENTS_WEB_APP_URL")).origin;
}

/** Mobile return URL Mercado Pago sends the member back to after checkout. */
export function getMemberPaymentsMobileReturnUrl(): string {
  return requireEnv("MEMBER_PAYMENTS_MOBILE_RETURN_URL");
}

/**
 * Webhook signing secret of the Mercado Pago **application** gyms connect
 * through. Notifications from every connected seller are signed with it, so
 * one secret covers all gyms — unlike the access token, which is per gym.
 */
export function getMemberPaymentsWebhookSecret(): string {
  return requireEnv("MEMBER_PAYMENTS_WEBHOOK_SECRET");
}

export function isMercadoPagoSandbox(): boolean {
  return process.env.MEMBER_PAYMENTS_MP_ENV?.trim() === "sandbox";
}
