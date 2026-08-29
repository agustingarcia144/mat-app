import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - stores app-specific user data
  // Clerk is the source of truth for basic user info (name, email, etc.)
  users: defineTable({
    // Clerk user ID - used to link with Clerk
    externalId: v.string(),
    // Clerk user fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    nickname: v.optional(v.string()),
    isSuperAdmin: v.optional(v.boolean()),
    // App-specific fields not stored in Clerk
    birthday: v.optional(v.string()),
    phone: v.optional(v.string()),
    height: v.optional(v.number()), // cm
    weight: v.optional(v.number()), // kg
    // Onboarding tracking
    onboardingStep1Completed: v.optional(v.boolean()),
    onboardingCompleted: v.optional(v.boolean()),
    // Selected org context for multi-org users.
    activeOrganizationId: v.optional(v.id("organizations")),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_email", ["email"]),

  // Organizations table - stores gym data
  organizations: defineTable({
    // Basic fields
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    // IANA timezone for class times (e.g. "America/Argentina/Buenos_Aires").
    // Used when matching fixed slots to schedules; if unset, UTC is used.
    timezone: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // Organization memberships - links users to gyms with roles.
  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    // Auth user id (not a users-table reference to keep flexibility)
    userId: v.string(),
    description: v.optional(v.string()),
    // Internal role literal. "employee" is surfaced in the UI as "Empleado";
    // the label lives only in label maps, never as a stored value.
    role: v.union(
      v.literal("admin"),
      v.literal("trainer"),
      v.literal("employee"),
      v.literal("member"),
    ),
    status: v.union(v.literal("active"), v.literal("inactive")),
    // Whether the member should be included in planification tracking.
    usesPlanification: v.optional(v.boolean()),
    // For members: Clerk user id of the staff member responsible for keeping
    // this member's planification up to date.
    responsibleUserId: v.optional(v.string()),
    // For staff (admin/trainer/employee): payroll config.
    // payrollType decides how the total is computed: "hourly" uses
    // pricePerHour + pricePerClass; "monthly" uses a fixed pricePerMonth.
    payrollType: v.optional(v.union(v.literal("hourly"), v.literal("monthly"))),
    pricePerHour: v.optional(v.number()),
    pricePerClass: v.optional(v.number()),
    pricePerMonth: v.optional(v.number()),
    // Percentage (0-100) of what the members assigned to this staff member
    // (via responsibleUserId) pay. Added on top of the hourly/monthly total.
    commissionPercentage: v.optional(v.number()),
    joinedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
    inactivatedAt: v.optional(v.number()),
    // Timestamp of the most recent reactivation (inactive -> active). Kept
    // separate from joinedAt so the original join date is preserved while a
    // return still registers as a fresh "alta".
    reactivatedAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_organization_role", ["organizationId", "role"])
    .index("by_organization_responsible", [
      "organizationId",
      "responsibleUserId",
    ]),

  // Join requests (QR/deep link): user requested to join org; admin/trainer approves or rejects.
  organizationJoinRequests: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()), // Clerk user ID of admin/trainer who resolved
    source: v.optional(v.string()), // e.g. 'qr'
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_user_status", ["userId", "status"]),

  // Organization-level settings (feature toggles, membership config).
  // One row per org; if no row exists, defaults apply (all enabled, no auto-approval).
  organizationSettings: defineTable({
    organizationId: v.id("organizations"),
    // Feature toggles
    planificationsEnabled: v.boolean(),
    classesEnabled: v.boolean(),
    financeEnabled: v.boolean(),
    // Membership
    memberAutoApproval: v.boolean(),
    // Member -> gym payment configuration. Absent on rows created before the
    // member-payments feature: those gyms behave as transfer-only with
    // MercadoPago disabled (see organizationSettings.MEMBER_PAYMENT_DEFAULTS).
    memberPayments: v.optional(
      v.object({
        bankTransferEnabled: v.boolean(),
        mercadoPagoRecurringEnabled: v.boolean(),
        mercadoPagoOneTimeEnabled: v.boolean(),
        // Days of access kept after a renewal fails, before suspension.
        gracePeriodDays: v.number(),
        // When true, a MercadoPago subscription grants no access until its
        // first underlying payment is approved.
        initialPaymentRequiresApproval: v.boolean(),
      }),
    ),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  // Organization invitations managed inside Convex (replaces Clerk invitations).
  organizationInvitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("trainer"),
      v.literal("employee"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    invitedBy: v.string(),
    tokenHash: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_email", ["organizationId", "email"])
    .index("by_token_hash", ["tokenHash"]),

  // Internal invite codes used to bootstrap brand-new organizations.
  // This is separate from member join links/tokens.
  organizationCreationInviteCodes: defineTable({
    codeHash: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("consumed"),
      v.literal("revoked"),
    ),
    expiresAt: v.optional(v.number()),
    maxUses: v.number(),
    usedCount: v.number(),
    consumedAt: v.optional(v.number()),
    consumedByUserId: v.optional(v.string()),
    consumedOrganizationId: v.optional(v.id("organizations")),
    billingAccess: v.optional(v.union(v.literal("legacy"), v.literal("lite"))),
    createdBy: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_status", ["status"]),

  // Persistent member invite code per organization (manual fallback for join flow).
  organizationMemberInviteCodes: defineTable({
    organizationId: v.id("organizations"),
    code: v.string(),
    codeHash: v.string(),
    joinToken: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdBy: v.string(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_codeHash", ["codeHash"])
    .index("by_status", ["status"]),

  // Clerk webhook processing ledger for idempotency, replay defense, and auditing.
  webhookEvents: defineTable({
    svixId: v.string(),
    svixTimestamp: v.number(),
    eventType: v.string(),
    objectId: v.optional(v.string()),
    status: v.union(
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_svixId", ["svixId"])
    .index("by_status", ["status"])
    .index("by_eventType", ["eventType"]),

  // App-level billing plans for MAT organizations (SaaS billing).
  appBillingPlans: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    referencePriceUsd: v.number(),
    priceCurrency: v.literal("ARS"),
    priceArs: v.number(),
    frequency: v.number(),
    frequencyType: v.union(
      v.literal("months"),
      v.literal("weeks"),
      v.literal("years"),
    ),
    entitlements: v.object({
      modules: v.array(v.string()),
      dashboardCards: v.array(v.string()),
      // Member-payment policy for gyms on this MAT plan. Plans without this
      // object behave as MercadoPago disabled with zero commission, so member
      // payment code never has to branch on the plan name.
      memberPayments: v.optional(
        v.object({
          mercadoPagoEnabled: v.boolean(),
          // MAT's transaction commission, in basis points (100 bps = 1%).
          platformFeeBps: v.number(),
          feeCollectionMode: v.union(
            v.literal("none"),
            v.literal("marketplace_split"),
            v.literal("monthly_gym_invoice"),
          ),
        }),
      ),
    }),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_active", ["isActive"]),

  // Organization-level subscriptions for MAT app access.
  organizationBillingSubscriptions: defineTable({
    organizationId: v.id("organizations"),
    billingPlanId: v.id("appBillingPlans"),
    source: v.optional(
      v.union(
        v.literal("mercadopago"),
        v.literal("manual"),
        v.literal("legacy"),
        v.literal("trial"),
      ),
    ),
    mercadoPagoPreapprovalId: v.optional(v.string()),
    mercadoPagoPayerEmail: v.optional(v.string()),
    externalReference: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("authorized"),
      v.literal("paused"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("payment_failed"),
    ),
    entitlementStatus: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("grace_period"),
      v.literal("trial"),
    ),
    trialEndsAt: v.optional(v.number()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    lastPaymentStatus: v.optional(
      v.union(
        v.literal("approved"),
        v.literal("pending"),
        v.literal("rejected"),
        v.literal("unknown"),
      ),
    ),
    lastPaymentId: v.optional(v.string()),
    lastWebhookAt: v.optional(v.number()),
    graceUntil: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_externalReference", ["externalReference"])
    .index("by_mercadoPagoPreapprovalId", ["mercadoPagoPreapprovalId"])
    .index("by_status", ["status"]),

  // Manual (off-MercadoPago) payments an organization makes to the platform.
  // Legacy clients pay by transfer/cash, so a super admin records each month
  // here and the matching `organizationBillingSubscriptions` period advances.
  // Not to be confused with `planPayments`, which is member -> gym.
  organizationBillingPayments: defineTable({
    organizationId: v.id("organizations"),
    billingPlanId: v.id("appBillingPlans"),
    amountArs: v.number(),
    paidAt: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    billingPeriod: v.string(), // "YYYY-MM", derived from periodStart
    notes: v.optional(v.string()),
    recordedBy: v.string(),
    createdAt: v.number(),
  }).index("by_organization_paidAt", ["organizationId", "paidAt"]),

  mercadoPagoWebhookEvents: defineTable({
    eventId: v.string(),
    requestId: v.string(),
    type: v.string(),
    action: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    status: v.union(
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("ignored"),
    ),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_requestId", ["requestId"])
    .index("by_resource", ["resourceType", "resourceId"]),

  // ===========================================================================
  // Member -> gym payments (MercadoPago per-gym seller connections).
  //
  // Deliberately separate from the organization -> MAT SaaS billing tables
  // above (organizationBillingSubscriptions, mercadoPagoWebhookEvents, ...).
  // Those use MAT's single global seller token; these use one OAuth connection
  // per gym. The two must never share credentials, ledgers or webhook routes.
  // ===========================================================================

  // One row per organization + payment provider. Holds the gym's encrypted
  // MercadoPago credentials; only internal backend functions may read them.
  organizationPaymentProviderConnections: defineTable({
    organizationId: v.id("organizations"),
    provider: v.literal("mercadopago"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("refresh_required"),
      v.literal("error"),
      v.literal("disconnected"),
    ),
    // Provider seller identity + non-sensitive display metadata, so admins can
    // confirm which MercadoPago account is receiving their members' money.
    providerAccountId: v.string(),
    providerNickname: v.optional(v.string()),
    providerEmail: v.optional(v.string()),
    providerSiteId: v.optional(v.string()),
    liveMode: v.optional(v.boolean()),
    // Encrypted credentials. Never returned to a client, never logged.
    accessTokenCiphertext: v.string(),
    accessTokenIv: v.string(),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    encryptionKeyVersion: v.string(),
    accessTokenExpiresAt: v.optional(v.number()),
    lastRefreshedAt: v.optional(v.number()),
    // Random per-connection key embedded in this seller's notification URL, so
    // an incoming webhook selects the right gym token without exposing an
    // organization id.
    webhookRoutingKey: v.string(),
    connectedBy: v.optional(v.string()),
    connectedAt: v.optional(v.number()),
    disconnectedBy: v.optional(v.string()),
    disconnectedAt: v.optional(v.number()),
    lastHealthCheckAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_provider", ["organizationId", "provider"])
    .index("by_provider_account", ["provider", "providerAccountId"])
    .index("by_webhook_routing_key", ["webhookRoutingKey"])
    .index("by_status", ["status"]),

  // Single-use, short-lived OAuth state. Only the hash is stored, so a leaked
  // row cannot be replayed against the provider.
  paymentProviderOAuthStates: defineTable({
    stateHash: v.string(),
    organizationId: v.id("organizations"),
    provider: v.literal("mercadopago"),
    initiatedBy: v.string(),
    // Allowlisted destination the callback may redirect back to.
    returnPath: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_state_hash", ["stateHash"])
    .index("by_expires_at", ["expiresAt"]),

  // Recurring billing lifecycle for one member (the family payer). Only a
  // family parent subscription may own an agreement.
  memberRecurringAgreements: defineTable({
    organizationId: v.id("organizations"),
    connectionId: v.id("organizationPaymentProviderConnections"),
    subscriptionId: v.id("memberPlanSubscriptions"),
    payerUserId: v.string(),
    providerPreapprovalId: v.optional(v.string()),
    externalReference: v.string(),
    status: v.union(
      v.literal("pending_authorization"),
      v.literal("pending_first_payment"),
      v.literal("active"),
      v.literal("retrying"),
      v.literal("paused_bonification"),
      v.literal("cancellation_scheduled"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    lastPaymentStatus: v.optional(
      v.union(
        v.literal("approved"),
        v.literal("pending"),
        v.literal("rejected"),
        v.literal("refunded"),
        v.literal("charged_back"),
        v.literal("unknown"),
      ),
    ),
    lastPaymentStatusDetail: v.optional(v.string()),
    amountArs: v.number(),
    currency: v.literal("ARS"),
    // Family size the current amount was calculated from.
    familyMemberCount: v.number(),
    billingAnchorAt: v.number(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    nextChargeAt: v.optional(v.number()),
    // Grace is anchored to the FIRST failure. Provider retries must never move
    // graceUntil forward.
    firstFailureAt: v.optional(v.number()),
    graceUntil: v.optional(v.number()),
    // Price/family/bonification changes take effect at the next cycle only.
    pendingAmountArs: v.optional(v.number()),
    pendingAmountEffectiveAt: v.optional(v.number()),
    latestAuthorizedPaymentId: v.optional(v.string()),
    cancellationRequestedAt: v.optional(v.number()),
    providerCancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_provider_preapproval", ["providerPreapprovalId"])
    .index("by_external_reference", ["externalReference"])
    .index("by_status_next_charge", ["status", "nextChargeAt"])
    .index("by_grace_until", ["graceUntil"]),

  // Idempotent checkout creation. A repeated tap resumes the same session
  // instead of creating a second provider resource.
  memberPaymentCheckoutSessions: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(),
    planId: v.id("membershipPlans"),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    agreementId: v.optional(v.id("memberRecurringAgreements")),
    kind: v.union(
      v.literal("recurring_setup"),
      v.literal("advance_purchase"),
    ),
    months: v.number(),
    amountArs: v.number(),
    currency: v.literal("ARS"),
    paymentMethod: v.union(
      v.literal("mercadopago_recurring"),
      v.literal("mercadopago_checkout"),
      v.literal("bank_transfer"),
    ),
    providerPreferenceId: v.optional(v.string()),
    providerPreapprovalId: v.optional(v.string()),
    externalReference: v.string(),
    // Persisted before the provider call so a retry reuses the same key.
    idempotencyKey: v.string(),
    checkoutUrl: v.optional(v.string()),
    status: v.union(
      v.literal("created"),
      v.literal("opened"),
      v.literal("processing"),
      v.literal("approved"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    failureReason: v.optional(v.string()),
    expiresAt: v.number(),
    openedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_external_reference", ["externalReference"])
    .index("by_provider_preference", ["providerPreferenceId"])
    .index("by_provider_preapproval", ["providerPreapprovalId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_organization", ["organizationId"])
    .index("by_status_expires_at", ["status", "expiresAt"]),

  // One row per provider charge attempt. Never stores card data or a raw
  // provider payload.
  memberPaymentTransactions: defineTable({
    organizationId: v.id("organizations"),
    connectionId: v.id("organizationPaymentProviderConnections"),
    payerUserId: v.string(),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    agreementId: v.optional(v.id("memberRecurringAgreements")),
    checkoutSessionId: v.optional(v.id("memberPaymentCheckoutSessions")),
    planPaymentId: v.optional(v.id("planPayments")),
    kind: v.union(v.literal("recurring"), v.literal("advance")),
    providerTransactionId: v.string(),
    providerAuthorizedPaymentId: v.optional(v.string()),
    externalReference: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("cancelled"),
      v.literal("refunded"),
      v.literal("charged_back"),
      v.literal("unknown"),
    ),
    statusDetail: v.optional(v.string()),
    grossAmountArs: v.number(),
    currency: v.literal("ARS"),
    providerFeeArs: v.optional(v.number()),
    // Snapshot of MAT's fee at approval time; a later plan change must not
    // rewrite it.
    platformFeeArs: v.optional(v.number()),
    gymNetAmountArs: v.optional(v.number()),
    providerApprovedAt: v.optional(v.number()),
    providerCreatedAt: v.optional(v.number()),
    // Sanitized reconciliation metadata only — no payer PII, no raw payload.
    reconciliationSource: v.optional(
      v.union(v.literal("webhook"), v.literal("reconciliation"), v.literal("manual")),
    ),
    lastReconciledAt: v.optional(v.number()),
    // Set when a transaction needs a human: a charge whose amount MAT never
    // agreed to, or a reversal of a period that has already ended and must not
    // be silently rewritten. Surfaced in the admin payment views.
    requiresAttention: v.optional(v.boolean()),
    attentionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_transaction", ["providerTransactionId"])
    .index("by_provider_authorized_payment", ["providerAuthorizedPaymentId"])
    .index("by_agreement", ["agreementId"])
    .index("by_checkout_session", ["checkoutSessionId"])
    .index("by_organization_created", ["organizationId", "createdAt"])
    .index("by_status", ["status"]),

  // Durable outbox for external side effects. Local mutations enqueue an
  // operation transactionally; a scheduled action performs the provider call,
  // so a failed network request can never leave a half-applied change.
  memberPaymentProviderOperations: defineTable({
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
    idempotencyKey: v.string(),
    // Sanitized inputs only (amounts, ids) — never tokens or payer contact data.
    input: v.optional(
      v.object({
        amountArs: v.optional(v.number()),
        effectiveAt: v.optional(v.number()),
        reason: v.optional(v.string()),
      }),
    ),
    executeAfter: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("permanently_failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_execute_after", ["status", "executeAfter"])
    .index("by_agreement", ["agreementId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_organization", ["organizationId"]),

  // Member-payment webhook ledger. Separate from mercadoPagoWebhookEvents,
  // which belongs to organization -> MAT billing.
  paymentProviderWebhookEvents: defineTable({
    provider: v.literal("mercadopago"),
    connectionId: v.optional(v.id("organizationPaymentProviderConnections")),
    // Connection-scoped key used to deduplicate redelivered notifications.
    eventKey: v.string(),
    providerEventId: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    topic: v.optional(v.string()),
    action: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    // Hash only: full payloads carry payer information and are never persisted.
    payloadHash: v.optional(v.string()),
    status: v.union(
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("ignored"),
    ),
    attempts: v.number(),
    error: v.optional(v.string()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_connection", ["connectionId"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_status_received", ["status", "receivedAt"]),

  // Immutable MAT commission snapshot per approved member transaction. A later
  // gym plan change must never modify an existing row; corrections are added
  // as compensating entries instead.
  platformCommissionLedger: defineTable({
    organizationId: v.id("organizations"),
    billingPlanId: v.optional(v.id("appBillingPlans")),
    transactionId: v.id("memberPaymentTransactions"),
    grossAmountArs: v.number(),
    feeBasisArs: v.number(),
    platformFeeBps: v.number(),
    feeAmountArs: v.number(),
    collectionMode: v.union(
      v.literal("none"),
      v.literal("marketplace_split"),
      v.literal("monthly_gym_invoice"),
    ),
    status: v.union(
      v.literal("not_applicable"),
      v.literal("accrued"),
      v.literal("collected"),
      v.literal("waived"),
      v.literal("failed"),
    ),
    // Either the provider's application-fee id (split) or the MAT billing
    // settlement this fee was invoiced on (monthly invoice).
    providerFeeId: v.optional(v.string()),
    settlementReference: v.optional(v.string()),
    settlementPeriod: v.optional(v.string()), // "YYYY-MM"
    // Compensating entry for a refund/chargeback, linked to the row it offsets.
    reversesLedgerId: v.optional(v.id("platformCommissionLedger")),
    collectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_created", ["organizationId", "createdAt"])
    .index("by_transaction", ["transactionId"])
    .index("by_status", ["status"])
    .index("by_settlement_period", ["organizationId", "settlementPeriod"]),

  // Exercises - Exercise library per organization
  exercises: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(), // Upper Body, Lower Body, Core, Cardio, etc.
    muscleGroups: v.array(v.string()), // e.g., ["chest", "triceps"]
    equipment: v.optional(v.string()), // Barbell, Dumbbell, Machine, Bodyweight, etc.
    videoUrl: v.optional(v.string()),
    isStandard: v.optional(v.boolean()), // true = platform default, users cannot edit or remove
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_category", ["category"])
    .index("by_organization_category", ["organizationId", "category"]),

  // Folders - Tree structure for organizing planifications
  folders: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    parentId: v.optional(v.id("folders")), // null for root folders
    path: v.string(), // Computed path for breadcrumbs (e.g., "Beginners/Week 1")
    order: v.number(), // Display order within parent
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_parent", ["parentId"])
    .index("by_organization_parent", ["organizationId", "parentId"]),

  // Planifications - Workout programs/templates
  planifications: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")), // null for root level
    isTemplate: v.boolean(), // true if it's a reusable template
    currentRevisionId: v.optional(v.id("planificationRevisions")),
    hasEverBeenAssigned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_folder", ["folderId"])
    .index("by_created_by", ["createdBy"])
    .index("by_organization_folder", ["organizationId", "folderId"])
    .index("by_organization_isTemplate", ["organizationId", "isTemplate"]),

  // Workout Weeks - Weeks within a planification
  planificationRevisions: defineTable({
    planificationId: v.id("planifications"),
    revisionNumber: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
    supersedesRevisionId: v.optional(v.id("planificationRevisions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_planification", ["planificationId"])
    .index("by_planification_revisionNumber", [
      "planificationId",
      "revisionNumber",
    ]),

  // Workout Weeks - Weeks within a planification
  workoutWeeks: defineTable({
    planificationId: v.id("planifications"),
    revisionId: v.optional(v.id("planificationRevisions")),
    name: v.string(), // e.g., "Semana 1", "Semana 2"
    order: v.number(), // Display order
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_planification", ["planificationId"])
    .index("by_planification_revision", ["planificationId", "revisionId"])
    .index("by_planification_order", ["planificationId", "order"]),

  // Workout Days - Days within a workout week
  workoutDays: defineTable({
    weekId: v.id("workoutWeeks"),
    planificationId: v.id("planifications"), // Keep for easier queries
    revisionId: v.optional(v.id("planificationRevisions")),
    name: v.string(), // Flexible: "Day 1", "Legs", "Upper Body", etc.
    order: v.number(), // Display order within the week
    // ISO weekday: 1 = Monday (Lunes) … 7 = Sunday (Domingo). Omit = not scheduled to a specific day.
    dayOfWeek: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_week", ["weekId"])
    .index("by_planification", ["planificationId"])
    .index("by_planification_revision", ["planificationId", "revisionId"])
    .index("by_week_order", ["weekId", "order"])
    .index("by_planification_order", ["planificationId", "order"]),

  // Exercise Blocks - Groups of exercises within a workout day
  exerciseBlocks: defineTable({
    workoutDayId: v.id("workoutDays"),
    revisionId: v.optional(v.id("planificationRevisions")),
    name: v.string(), // e.g., "Warm-up", "Main", "Cool-down"
    order: v.number(), // Display order within the day
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workout_day", ["workoutDayId"])
    .index("by_revision", ["revisionId"])
    .index("by_workout_day_order", ["workoutDayId", "order"]),

  // Day Exercises - Exercises in a workout day
  dayExercises: defineTable({
    workoutDayId: v.id("workoutDays"),
    revisionId: v.optional(v.id("planificationRevisions")),
    exerciseId: v.id("exercises"),
    blockId: v.optional(v.id("exerciseBlocks")), // Optional: exercise can belong to a block
    order: v.number(), // Display order within the block (or day if no block)
    sets: v.number(),
    reps: v.optional(v.string()), // Can be "10", "10-12", "AMRAP", etc.
    weight: v.optional(v.string()), // e.g., "50kg", "BW", "25lb"
    prPercentage: v.optional(v.number()), // e.g., 80 means 80% of PR
    timeSeconds: v.optional(v.number()), // Time in seconds (e.g. plank duration)
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workout_day", ["workoutDayId"])
    .index("by_exercise", ["exerciseId"])
    .index("by_revision", ["revisionId"])
    .index("by_workout_day_order", ["workoutDayId", "order"])
    .index("by_block", ["blockId"])
    .index("by_block_order", ["blockId", "order"]),

  // Planification Assignments - Assign planifications to members
  planificationAssignments: defineTable({
    planificationId: v.id("planifications"),
    revisionId: v.optional(v.id("planificationRevisions")),
    userId: v.string(), // Clerk user ID of the member
    organizationId: v.id("organizations"),
    assignedBy: v.string(), // Clerk user ID of admin/trainer
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_planification", ["planificationId"])
    .index("by_planification_revision", ["planificationId", "revisionId"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"])
    .index("by_user_status", ["userId", "status"]),

  // Workout Day Sessions - Member completion per workout day per date
  workoutDaySessions: defineTable({
    assignmentId: v.id("planificationAssignments"),
    planificationId: v.id("planifications"),
    revisionId: v.optional(v.id("planificationRevisions")),
    workoutDayId: v.id("workoutDays"),
    userId: v.string(), // Clerk user ID
    organizationId: v.id("organizations"),
    performedOn: v.string(), // Local date YYYY-MM-DD
    status: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("skipped"),
    ),
    // Post-workout self-report (set on completion)
    effortRating: v.optional(v.number()), // 1–10 perceived effort (RPE)
    mood: v.optional(
      v.union(
        v.literal("great"),
        v.literal("good"),
        v.literal("ok"),
        v.literal("tired"),
        v.literal("exhausted"),
      ),
    ),
    memberNote: v.optional(v.string()), // free-text feedback for the trainer
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_performedOn", ["organizationId", "performedOn"])
    .index("by_user_performedOn", ["userId", "performedOn"])
    .index("by_user_assignment_performedOn", [
      "userId",
      "assignmentId",
      "performedOn",
    ])
    .index("by_assignment", ["assignmentId"])
    .index("by_assignment_revision", ["assignmentId", "revisionId"])
    .index("by_assignment_workoutDay_performedOn", [
      "assignmentId",
      "workoutDayId",
      "performedOn",
    ]),

  // Session Exercise Logs - What the user actually did per exercise per session
  sessionExerciseLogs: defineTable({
    sessionId: v.id("workoutDaySessions"),
    dayExerciseId: v.id("dayExercises"),
    revisionId: v.optional(v.id("planificationRevisions")),
    sets: v.number(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    comment: v.optional(v.string()),
    // Comma-separated per-set seconds, e.g. "30, 30, 45"
    timeSeconds: v.optional(v.string()),
    order: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_revision", ["revisionId"])
    .index("by_dayExercise", ["dayExerciseId"])
    .index("by_session_dayExercise", ["sessionId", "dayExerciseId"]),

  // Classes - Class templates and configurations
  classes: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(), // "Yoga Avanzado", "Acceso Gimnasio", etc.
    description: v.optional(v.string()),
    capacity: v.number(), // Max attendees
    trainerId: v.optional(v.string()), // Clerk user ID (optional)
    // Recurring configuration
    isRecurring: v.boolean(),
    recurrencePattern: v.optional(
      v.object({
        frequency: v.union(
          v.literal("hourly"),
          v.literal("daily"),
          v.literal("weekly"),
          v.literal("monthly"),
        ),
        interval: v.number(), // Every X hours/days/weeks
        daysOfWeek: v.optional(v.array(v.number())), // 0-6 for weekly
        endDate: v.optional(v.number()), // Timestamp
      }),
    ),
    // Booking settings
    bookingWindowDays: v.number(), // Default: 7
    cancellationWindowHours: v.number(), // Default: 2
    // Status
    isActive: v.boolean(),
    createdBy: v.string(), // Clerk user ID
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_active", ["organizationId", "isActive"])
    .index("by_trainer", ["trainerId"]),

  // Schedule batches - generation runs for class schedules
  scheduleBatches: defineTable({
    organizationId: v.id("organizations"),
    classId: v.id("classes"),
    sourceType: v.union(v.literal("single"), v.literal("timeWindow")),
    status: v.union(v.literal("active"), v.literal("replaced")),
    sourceConfig: v.union(
      v.object({
        mode: v.literal("single"),
        startTime: v.number(),
        endTime: v.number(),
        endDate: v.optional(v.number()),
        durationMinutes: v.number(),
      }),
      v.object({
        mode: v.literal("timeWindow"),
        rangeStartDate: v.number(),
        rangeEndDate: v.number(),
        timeWindowStartMinutes: v.number(),
        timeWindowEndMinutes: v.number(),
        slotIntervalMinutes: v.number(),
        durationMinutes: v.number(),
        daysOfWeek: v.optional(v.array(v.number())),
      }),
    ),
    generatedCount: v.number(),
    firstStartTime: v.number(),
    lastEndTime: v.number(),
    createdBy: v.string(),
    duplicatedFromBatchId: v.optional(v.id("scheduleBatches")),
    replacedByBatchId: v.optional(v.id("scheduleBatches")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status_created", [
      "organizationId",
      "status",
      "createdAt",
    ])
    .index("by_class", ["classId"]),

  // Class Schedules - Individual class occurrences
  classSchedules: defineTable({
    classId: v.id("classes"),
    organizationId: v.id("organizations"), // Denormalized for queries
    batchId: v.optional(v.id("scheduleBatches")),
    startTime: v.number(), // Timestamp
    endTime: v.number(), // Timestamp
    capacity: v.number(), // Can override class capacity
    // currentReservations is a denormalized counter that must be updated atomically
    // with classReservations changes. The reserve/cancel mutations re-fetch the schedule
    // immediately before updating to minimize TOCTOU races. A periodic reconciliation
    // job should be added to correct any drift.
    currentReservations: v.number(), // Count for quick checks
    status: v.union(
      v.literal("scheduled"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    // Staff (admin/trainer/employee) Clerk user id in charge of running this
    // occurrence. Defaults from the class's trainerId at generation time.
    inChargeUserId: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_class", ["classId"])
    .index("by_batch", ["batchId"])
    .index("by_class_time", ["classId", "startTime"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_time", ["organizationId", "startTime"])
    .index("by_start_time", ["startTime"])
    .index("by_end_time", ["endTime"]),

  // Class Reservations - Member bookings
  classReservations: defineTable({
    scheduleId: v.id("classSchedules"),
    classId: v.id("classes"), // Denormalized
    organizationId: v.id("organizations"), // Denormalized
    userId: v.string(), // Clerk user ID
    // Denormalized schedule start timestamp for efficient per-cycle quota checks.
    // Optional while legacy rows are backfilled.
    scheduleStartTime: v.optional(v.number()),
    status: v.union(
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("attended"),
      v.literal("no_show"),
    ),
    cancelledAt: v.optional(v.number()),
    checkedInAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_schedule_status", ["scheduleId", "status"])
    .index("by_organization_user_start_time", [
      "organizationId",
      "userId",
      "scheduleStartTime",
    ]),

  // Fixed class slots - Members with a fixed weekly slot (class + day + time)
  // Auto-assigned to every matching class occurrence when schedules are created
  fixedClassSlots: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID (member)
    classId: v.id("classes"),
    dayOfWeek: v.number(), // 0-6, Sunday = 0
    startTimeMinutes: v.number(), // 0-1439, e.g. 540 = 9:00
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_class_slot", [
      "organizationId",
      "classId",
      "dayOfWeek",
      "startTimeMinutes",
    ])
    .index("by_user", ["userId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  // Model week slots - defines the recurring class schedule template (which classes run on which day/time).
  // This is the "ideal week" used for planning; separate from actual schedules and from member-specific
  // fixed slots (fixedClassSlots). Applying this template to a date range generates real classSchedules.
  modelWeekSlots: defineTable({
    organizationId: v.id("organizations"),
    classId: v.id("classes"),
    dayOfWeek: v.number(), // 0-6, Sunday = 0 (same convention as fixedClassSlots)
    startTimeMinutes: v.number(), // 0-1439, e.g. 540 = 09:00
    durationMinutes: v.number(), // Default 60
    capacity: v.optional(v.number()), // Overrides class capacity when set
    notes: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_class", ["organizationId", "classId"])
    .index("by_organization_slot", [
      "organizationId",
      "classId",
      "dayOfWeek",
      "startTimeMinutes",
    ]),

  // Staff shift model slots - recurring weekly template of when each staff
  // member is in charge of the gym. Mirrors modelWeekSlots; applying the
  // template to dated weeks generates staffShifts.
  staffShiftModelSlots: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID (staff)
    dayOfWeek: v.number(), // 0-6, Sunday = 0 (same convention as modelWeekSlots)
    startTimeMinutes: v.number(), // 0-1439
    endTimeMinutes: v.number(), // 0-1440, must be > startTimeMinutes
    notes: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  // Staff shifts - dated actual shifts (who is in charge of the gym and when).
  // Used to track hours worked for payroll. Mirrors classSchedules.
  staffShifts: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID (staff)
    startTime: v.number(), // Timestamp
    endTime: v.number(), // Timestamp
    status: v.union(v.literal("scheduled"), v.literal("cancelled")),
    // When generated from a model slot, references it so re-applying can replace.
    sourceModelSlotId: v.optional(v.id("staffShiftModelSlots")),
    notes: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_time", ["organizationId", "startTime"])
    .index("by_user", ["userId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  // Staff payroll payments - records that a staff member's payroll for a given
  // period (YYYY-MM) was paid, linked to the generated finance expense.
  staffPayrollPayments: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID (staff)
    period: v.string(), // "YYYY-MM"
    payrollType: v.union(v.literal("hourly"), v.literal("monthly")),
    hours: v.number(),
    classesInCharge: v.number(),
    // Snapshot of the commission inputs at payment time (audit only).
    commissionPercentage: v.optional(v.number()),
    commissionBaseArs: v.optional(v.number()),
    amountArs: v.number(),
    occurredOn: v.optional(v.string()), // "YYYY-MM-DD" accounting date of the payment
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("card"),
        v.literal("other"),
      ),
    ),
    transactionId: v.id("financeTransactions"),
    paidBy: v.string(), // Clerk user ID of admin who marked as paid
    paidAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_period", ["organizationId", "period"])
    .index("by_organization_user_period", [
      "organizationId",
      "userId",
      "period",
    ]),

  // Push tokens - stores Expo push tokens per user/device
  pushTokens: defineTable({
    userId: v.string(), // Clerk user ID
    token: v.string(), // Expo push token
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
    active: v.boolean(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"])
    .index("by_user_active", ["userId", "active"]),

  // Class alerts - users who want to be notified when a full class opens a spot or gets cancelled
  classAlerts: defineTable({
    userId: v.string(),
    scheduleId: v.id("classSchedules"),
    organizationId: v.id("organizations"),
    createdAt: v.number(),
  })
    .index("by_user_schedule", ["userId", "scheduleId"])
    .index("by_schedule", ["scheduleId"]),

  // Notification events - idempotency + delivery status
  notificationEvents: defineTable({
    eventKey: v.string(),
    type: v.union(
      v.literal("class_cancelled"),
      v.literal("class_start_reminder"),
      v.literal("attendance_reminder"),
      v.literal("class_spot_available"),
      v.literal("workout_completion_reminder"),
      v.literal("payment_review_approved"),
      v.literal("payment_review_declined"),
      v.literal("plan_due_soon"),
      v.literal("plan_due_today"),
      v.literal("member_payment_approved"),
      v.literal("member_payment_failed"),
      v.literal("member_payment_grace_ending"),
      v.literal("member_payment_suspended"),
      v.literal("member_payment_recovered"),
      v.literal("member_payment_amount_changed"),
      v.literal("member_payment_cancellation_scheduled"),
      v.literal("member_checkout_incomplete"),
      v.literal("member_payment_admin_alert"),
    ),
    userId: v.string(),
    scheduleId: v.optional(v.id("classSchedules")),
    workoutSessionId: v.optional(v.id("workoutDaySessions")),
    paymentId: v.optional(v.id("planPayments")),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    tokenCount: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_user_created_at", ["userId", "createdAt"])
    .index("by_status_created_at", ["status", "createdAt"]),

  // Membership plans - subscription tiers with weekly class limits and payment windows
  membershipPlans: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(), // "Plan Básico", "2 veces/semana"
    description: v.optional(v.string()),
    isFamilyPlan: v.optional(v.boolean()),
    // calendar: day-of-month payment window. join_date: each member pays on their activation day.
    billingMode: v.optional(
      v.union(v.literal("calendar"), v.literal("join_date")),
    ),
    priceArs: v.number(), // Price in ARS (whole pesos)
    weeklyClassLimit: v.number(), // Max classes per week (Mon-Sun)
    paymentWindowStartDay: v.number(), // Day of month payment opens (1-28)
    paymentWindowEndDay: v.number(), // Day of month payment closes (1-28)
    // Interest tiers applied cumulatively when payment is late
    // If any tiers are set, auto-suspension is disabled for this plan
    interestTiers: v.optional(
      v.array(
        v.object({
          daysAfterWindowEnd: v.number(), // tier activates this many days after paymentWindowEndDay
          type: v.union(v.literal("percentage"), v.literal("fixed")),
          value: v.number(), // % or fixed ARS amount
        }),
      ),
    ),
    // Advance payment discounts - e.g. pay 3 months upfront, get 10% off
    advancePaymentDiscounts: v.optional(
      v.array(
        v.object({
          months: v.number(), // 3, 6, 12
          discountPercentage: v.number(), // 0-100
        }),
      ),
    ),
    // Class templates this plan grants access to.
    // undefined or [] means the plan includes every class in the organization.
    // When false, the plan grants no class access at all. undefined = enabled.
    classesEnabled: v.optional(v.boolean()),
    allowedClassIds: v.optional(v.array(v.id("classes"))),
    isActive: v.boolean(),
    // When true, the plan stays active but is hidden from the mobile app so
    // members cannot self-assign to it. Admins can still assign it manually.
    hiddenFromSelfAssignment: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_active", ["organizationId", "isActive"]),

  // Member plan subscriptions - one active plan per member per org
  memberPlanSubscriptions: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID
    planId: v.id("membershipPlans"),
    familyHeadUserId: v.optional(v.string()),
    familyParentSubscriptionId: v.optional(v.id("memberPlanSubscriptions")),
    familyMemberUserIds: v.optional(v.array(v.string())),
    // "pending_payment": a plan was chosen but no first payment is approved
    // yet, so the member has no access. Provider states never appear here —
    // they live on memberRecurringAgreements / memberPaymentTransactions.
    status: v.union(
      v.literal("pending_payment"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("cancelled"),
    ),
    activatedAt: v.number(),
    suspendedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    // Anchor day for join-date billing, set when the first payment is approved.
    billingAnchorAt: v.optional(v.number()),
    // For a scheduled cancellation: when local access actually ends.
    accessEndsAt: v.optional(v.number()),
    cancellationRequestedAt: v.optional(v.number()),
    // Absent on legacy rows, which are manual (transfer/cash) subscriptions.
    paymentMode: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("mercadopago_recurring"),
        v.literal("mercadopago_one_time"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_access_ends_at", ["accessEndsAt"])
    .index("by_family_parent", ["familyParentSubscriptionId"])
    .index("by_family_head", ["organizationId", "familyHeadUserId"])
    .index("by_user", ["userId"]),

  // Plan payments - monthly payment records with proof upload and admin review
  planPayments: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(), // Clerk user ID
    subscriptionId: v.id("memberPlanSubscriptions"),
    planId: v.id("membershipPlans"), // Denormalized for queries
    billingPeriod: v.string(), // "YYYY-MM" format
    billingCycleStartAt: v.optional(v.number()),
    billingCycleEndAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    amountArs: v.number(), // Base plan price at time of creation
    // How the payment was made. Absent on legacy rows (treated as proof_upload).
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("proof_upload"),
        v.literal("bonification"),
        v.literal("mercadopago_recurring"),
        v.literal("mercadopago_checkout"),
      ),
    ),
    // Clerk user ID of admin/trainer who recorded the payment (admin-created payments only)
    recordedBy: v.optional(v.string()),
    // Bonification reference (for auto-generated bonification payments)
    bonificationId: v.optional(v.id("planBonifications")),
    isBonification: v.optional(v.boolean()),
    // Interest calculated at proof-upload time
    interestApplied: v.optional(
      v.array(
        v.object({
          daysAfterWindowEnd: v.number(),
          type: v.union(v.literal("percentage"), v.literal("fixed")),
          value: v.number(),
          amountArs: v.number(),
        }),
      ),
    ),
    interestTotalArs: v.optional(v.number()),
    totalAmountArs: v.optional(v.number()), // amountArs + interestTotalArs
    // Proof of payment
    proofStorageId: v.optional(v.id("_storage")),
    proofFileName: v.optional(v.string()),
    proofContentType: v.optional(v.string()),
    proofUploadedAt: v.optional(v.number()),
    // Review workflow
    status: v.union(
      v.literal("pending"), // Awaiting proof upload
      v.literal("in_review"), // Proof uploaded, waiting admin review
      v.literal("approved"), // Admin approved
      v.literal("declined"), // Admin declined, member can re-upload
    ),
    reviewedBy: v.optional(v.string()), // Clerk user ID of reviewer
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    // Provider links. Absent on transfer/cash/bonification rows.
    providerTransactionId: v.optional(v.id("memberPaymentTransactions")),
    checkoutSessionId: v.optional(v.id("memberPaymentCheckoutSessions")),
    // Groups the rows generated by one advance purchase (MercadoPago or a
    // single transfer proof) so they are reviewed and finalized together.
    advancePaymentGroupId: v.optional(v.string()),
    // Money snapshot for an approved provider payment, in whole ARS.
    grossAmountArs: v.optional(v.number()),
    providerFeeArs: v.optional(v.number()),
    platformFeeArs: v.optional(v.number()),
    gymNetAmountArs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_subscription_period", ["subscriptionId", "billingPeriod"])
    .index("by_advance_group", ["advancePaymentGroupId"])
    .index("by_provider_transaction", ["providerTransactionId"]),

  // Finance recurring rules - monthly expenses generated into ledger rows
  financeRecurringRules: defineTable({
    organizationId: v.id("organizations"),
    type: v.union(v.literal("income"), v.literal("expense")),
    title: v.string(),
    category: v.string(),
    amountArs: v.number(),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("card"),
        v.literal("other"),
      ),
    ),
    notes: v.optional(v.string()),
    frequency: v.literal("monthly"),
    dayOfMonth: v.number(),
    startPeriod: v.string(),
    endPeriod: v.optional(v.string()),
    nextDuePeriod: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("cancelled"),
    ),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_status_nextDuePeriod", ["status", "nextDuePeriod"]),

  // Finance transactions - non-membership income and expenses
  financeTransactions: defineTable({
    organizationId: v.id("organizations"),
    type: v.union(v.literal("income"), v.literal("expense")),
    title: v.string(),
    category: v.string(),
    amountArs: v.number(),
    occurredOn: v.string(),
    period: v.string(),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("card"),
        v.literal("other"),
      ),
    ),
    notes: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("recurring")),
    recurringRuleId: v.optional(v.id("financeRecurringRules")),
    status: v.union(v.literal("active"), v.literal("voided")),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    voidedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
  })
    .index("by_organization_period", ["organizationId", "period"])
    .index("by_organization_type_period", ["organizationId", "type", "period"])
    .index("by_recurring_period", ["recurringRuleId", "period"]),

  // Plan bonifications - admin-granted discounts/free plans for members
  planBonifications: defineTable({
    organizationId: v.id("organizations"),
    subscriptionId: v.id("memberPlanSubscriptions"),
    userId: v.string(), // Clerk user ID (denormalized for queries)
    planId: v.id("membershipPlans"), // Denormalized for queries
    // Discount configuration
    discountType: v.union(
      v.literal("percentage"),
      v.literal("fixed"),
      v.literal("full"),
    ),
    discountValue: v.number(), // 0-100 for %, ARS for fixed, ignored for full
    // Reason
    reason: v.union(
      v.literal("friend_and_family"),
      v.literal("trainer"),
      v.literal("employee"),
      v.literal("sponsor"),
      v.literal("other"),
    ),
    notes: v.optional(v.string()),
    // Lifecycle
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdBy: v.string(), // Clerk user ID of admin who created
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_subscription", ["subscriptionId"])
    .index("by_subscription_status", ["subscriptionId", "status"])
    .index("by_organization_user", ["organizationId", "userId"]),
});
