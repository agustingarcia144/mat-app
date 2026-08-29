/**
 * Pure Mercado Pago response fixtures for automated tests.
 *
 * Shapes mirror the provider's documented payloads, trimmed to the fields MAT
 * reads. The double-dotted filename keeps this file out of the Convex
 * deployment bundle.
 */

export const SELLER_A = {
  userId: 111111111,
  email: "test_user_a@testuser.com",
  nickname: "TESTSELLERA",
};

export const SELLER_B = {
  userId: 222222222,
  email: "test_user_b@testuser.com",
  nickname: "TESTSELLERB",
};

export function oauthTokenResponse(
  overrides: Partial<{
    access_token: string;
    refresh_token: string;
    user_id: number;
    expires_in: number;
    public_key: string;
    live_mode: boolean;
  }> = {},
) {
  return {
    access_token: "TEST-access-token-aaaa",
    refresh_token: "TG-refresh-token-aaaa",
    token_type: "bearer",
    expires_in: 15_552_000,
    scope: "offline_access payments read write",
    user_id: SELLER_A.userId,
    public_key: "TEST-public-key-aaaa",
    live_mode: false,
    ...overrides,
  };
}

export function sellerIdentityResponse(
  seller: { userId: number; email: string; nickname: string } = SELLER_A,
) {
  return {
    id: seller.userId,
    nickname: seller.nickname,
    email: seller.email,
    site_id: "MLA",
    first_name: "Test",
    last_name: "Seller",
  };
}

export type PreapprovalStatus =
  | "pending"
  | "authorized"
  | "paused"
  | "cancelled";

export function preapprovalResponse(
  overrides: Partial<{
    id: string;
    status: PreapprovalStatus;
    external_reference: string;
    collector_id: number;
    payer_id: number;
    transaction_amount: number;
    currency_id: string;
    next_payment_date: string;
    init_point: string;
  }> = {},
) {
  return {
    id: "2c9380848a1b2c3d",
    status: "pending" as PreapprovalStatus,
    external_reference: "mat_sub_test_0001",
    collector_id: SELLER_A.userId,
    payer_id: 900000001,
    reason: "MAT - Plan mensual",
    init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c9380848a1b2c3d",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 30_000,
      currency_id: "ARS",
    },
    // Flattened aliases MAT reads for convenience in verification.
    transaction_amount: 30_000,
    currency_id: "ARS",
    next_payment_date: "2026-04-10T00:00:00.000-03:00",
    ...overrides,
  };
}

export type AuthorizedPaymentStatus =
  | "processed"
  | "recycling"
  | "scheduled"
  | "cancelled";

export function authorizedPaymentResponse(
  overrides: Partial<{
    id: number;
    preapproval_id: string;
    status: AuthorizedPaymentStatus;
    payment_status:
      | "approved"
      | "rejected"
      | "pending"
      | "refunded"
      | "charged_back";
    payment_id: number;
    transaction_amount: number;
    currency_id: string;
    external_reference: string;
    debit_date: string;
  }> = {},
) {
  const base = {
    id: 5000000001,
    preapproval_id: "2c9380848a1b2c3d",
    type: "recurring",
    status: "processed" as AuthorizedPaymentStatus,
    external_reference: "mat_sub_test_0001",
    transaction_amount: 30_000,
    currency_id: "ARS",
    // Defaults to now: a charge whose provider date is months old belongs to
    // an older billing cycle, which is a different scenario a test must ask
    // for explicitly.
    debit_date: new Date().toISOString(),
    payment_id: 7000000001,
    payment_status: "approved" as
      | "approved"
      | "rejected"
      | "pending"
      | "refunded"
      | "charged_back",
    ...overrides,
  };

  // Mercado Pago nests the real payment result and MAT reads the nested value
  // first, so the nested object has to follow the overrides — otherwise a test
  // that sets `payment_status` would silently keep the default result.
  return {
    ...base,
    payment: {
      id: base.payment_id,
      status: base.payment_status,
      status_detail:
        base.payment_status === "approved" ? "accredited" : "cc_rejected_other_reason",
    },
  };
}

export function paymentResponse(
  overrides: Partial<{
    id: number;
    status: "approved" | "rejected" | "pending" | "refunded" | "cancelled";
    status_detail: string;
    external_reference: string;
    transaction_amount: number;
    currency_id: string;
    collector_id: number;
    date_approved: string | null;
    application_fee: number;
  }> = {},
) {
  return {
    id: 7000000001,
    status: "approved" as const,
    status_detail: "accredited",
    external_reference: "mat_advance_test_0001",
    transaction_amount: 90_000,
    currency_id: "ARS",
    collector_id: SELLER_A.userId,
    date_approved: new Date().toISOString(),
    date_created: new Date().toISOString(),
    fee_details: [{ type: "mercadopago_fee", amount: 5_490 }],
    transaction_details: { net_received_amount: 84_510 },
    ...overrides,
  };
}

export function preferenceResponse(
  overrides: Partial<{
    id: string;
    external_reference: string;
    init_point: string;
  }> = {},
) {
  return {
    id: "111111111-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    external_reference: "mat_advance_test_0001",
    init_point:
      "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=111111111-aaaaaaaa",
    sandbox_init_point:
      "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=111111111-aaaaaaaa",
    ...overrides,
  };
}

/** Provider error bodies MAT must classify correctly. */
export const providerErrors = {
  unauthorized: { message: "invalid access token", error: "unauthorized", status: 401 },
  rateLimited: { message: "too many requests", error: "too_many_requests", status: 429 },
  validation: { message: "auto_recurring.transaction_amount invalid", error: "bad_request", status: 400 },
  serverError: { message: "internal error", error: "internal_error", status: 500 },
};
