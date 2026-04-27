import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";

type InterestTier = {
  daysAfterWindowEnd: number;
  type: "percentage" | "fixed";
  value: number;
};

type AppliedTier = InterestTier & { amountArs: number };

async function getPaymentCoverage(
  ctx: { db: any },
  subscription: {
    _id: Id<"memberPlanSubscriptions">;
    organizationId: Id<"organizations">;
    userId: string;
    familyParentSubscriptionId?: Id<"memberPlanSubscriptions">;
  },
) {
  const billingSubscription = subscription.familyParentSubscriptionId
    ? await ctx.db.get(subscription.familyParentSubscriptionId)
    : subscription;

  if (!billingSubscription) {
    throw new Error("Suscripción principal no encontrada");
  }

  const childSubscriptions = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_family_parent", (q: any) =>
      q.eq("familyParentSubscriptionId", billingSubscription._id),
    )
    .collect();

  const coveredSubscriptions = [billingSubscription, ...childSubscriptions].filter(
    (item) => item.status !== "cancelled",
  );

  return {
    billingSubscription,
    coveredSubscriptions,
    coveredMemberCount: coveredSubscriptions.length,
  };
}

async function setFamilySubscriptionsStatus(
  ctx: { db: any },
  subscription: {
    _id: Id<"memberPlanSubscriptions">;
    organizationId: Id<"organizations">;
    userId: string;
    familyParentSubscriptionId?: Id<"memberPlanSubscriptions">;
  },
  status: "active" | "suspended",
  now: number,
) {
  const { coveredSubscriptions } = await getPaymentCoverage(ctx, subscription);

  for (const item of coveredSubscriptions) {
    await ctx.db.patch(item._id, {
      status,
      suspendedAt: status === "active" ? undefined : now,
      updatedAt: now,
    });
  }
}

function computeInterest(
  baseAmount: number,
  tiers: InterestTier[],
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number,
): { applied: AppliedTier[]; totalArs: number; totalAmount: number } {
  const [yearStr, monthStr] = billingPeriod.split("-");
  const windowEndMs = Date.UTC(
    parseInt(yearStr!, 10),
    parseInt(monthStr!, 10) - 1,
    paymentWindowEndDay,
  );
  const daysElapsed = Math.max(0, Math.floor((nowMs - windowEndMs) / 86400000));

  if (daysElapsed === 0 || tiers.length === 0) {
    return { applied: [], totalArs: 0, totalAmount: baseAmount };
  }

  const applied: AppliedTier[] = [];
  let totalArs = 0;

  for (const tier of tiers) {
    if (daysElapsed >= tier.daysAfterWindowEnd) {
      const amountArs =
        tier.type === "percentage"
          ? Math.round(baseAmount * (tier.value / 100))
          : Math.round(tier.value);
      applied.push({ ...tier, amountArs });
      totalArs += amountArs;
    }
  }

  return { applied, totalArs, totalAmount: baseAmount + totalArs };
}

/**
 * Get the current user's payment for the current billing period.
 */
export const getMyCurrentPeriodPayment = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;

    // Get current subscription
    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return null;

    const { billingSubscription, coveredMemberCount } =
      await getPaymentCoverage(ctx, subscription);
    const plan = await ctx.db.get(billingSubscription.planId);

    const d = new Date();
    const billingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const payment = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", billingSubscription._id)
          .eq("billingPeriod", billingPeriod),
      )
      .first();

    if (!payment) return null;

    return {
      ...payment,
      coveredMemberCount,
      coveredUserIds: coveredMemberCount > 1 ? billingSubscription.familyMemberUserIds : undefined,
      planInterestTiers: plan?.interestTiers ?? [],
      planPaymentWindowEndDay: plan?.paymentWindowEndDay ?? 28,
    };
  },
});

/**
 * Get a single payment by ID (admin/trainer or owner).
 */
export const getById = query({
  args: { paymentId: v.id("planPayments") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== membership.organizationId)
      return null;
    return payment;
  },
});

/**
 * Get the current user's payment history.
 */
export const getMyPayments = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return [];

    const { identity, membership } = orgCtx;

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return [];

    const { billingSubscription } = await getPaymentCoverage(ctx, subscription);

    const payments = await ctx.db
      .query("planPayments")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", billingSubscription.userId),
      )
      .filter((q) => q.eq(q.field("subscriptionId"), billingSubscription._id))
      .collect();

    // Sort newest first
    return payments.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get all payments pending review (admin/trainer).
 */
export const getPendingByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const payments = await ctx.db
      .query("planPayments")
      .withIndex("by_organization_status", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("status", "in_review"),
      )
      .collect();

    return await enrichPayments(ctx, payments);
  },
});

/**
 * Get all payments for the org, optionally filtered by status (admin/trainer).
 */
export const getByOrganization = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_review"),
        v.literal("approved"),
        v.literal("declined"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const payments = args.status
      ? await ctx.db
          .query("planPayments")
          .withIndex("by_organization_status", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("planPayments")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .collect();

    const enriched = await enrichPayments(ctx, payments);
    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

function getCurrentBillingPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function roundPercentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function sortBillingPeriodsDesc(periods: string[]) {
  return Array.from(new Set(periods)).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
}

export const getOrganizationMetrics = query({
  args: {
    selectedPeriod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const [
      payments,
      subscriptions,
      activeBonifications,
      financeTransactions,
    ] = await Promise.all([
      ctx.db
        .query("planPayments")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
      ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
      ctx.db
        .query("planBonifications")
        .withIndex("by_organization_status", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("financeTransactions")
        .withIndex("by_organization_period", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect(),
    ]);

    // Build a set of bonified subscription IDs for fast lookup
    const bonifiedSubscriptionIds = new Set(
      activeBonifications.map((b) => String(b.subscriptionId)),
    );

    const planIds = new Set<string>();
    for (const payment of payments) planIds.add(String(payment.planId));
    for (const subscription of subscriptions) {
      planIds.add(String(subscription.planId));
    }

    const plans = new Map<string, any>();
    await Promise.all(
      Array.from(planIds).map(async (planId) => {
        const plan = await ctx.db.get(planId as any);
        if (plan) plans.set(planId, plan);
      }),
    );

    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.status !== "cancelled",
    );
    const currentBillingPeriod = getCurrentBillingPeriod();

    const currentPayments = payments.filter(
      (payment) => payment.billingPeriod === currentBillingPeriod,
    );

    const paymentBySubscription = new Map<
      string,
      (typeof currentPayments)[number]
    >();
    for (const payment of currentPayments) {
      const key = String(payment.subscriptionId);
      const previous = paymentBySubscription.get(key);
      if (!previous || payment.updatedAt > previous.updatedAt) {
        paymentBySubscription.set(key, payment);
      }
    }

    const familyGroupSizes = new Map<string, number>();
    for (const subscription of activeSubscriptions) {
      const billingKey = String(
        subscription.familyParentSubscriptionId ?? subscription._id,
      );
      familyGroupSizes.set(billingKey, (familyGroupSizes.get(billingKey) ?? 0) + 1);
    }

    let expectedRevenueArs = 0;
    let approvedRevenueArs = 0;
    let interestRevenueArs = 0;
    let approvedCount = 0;
    let inReviewCount = 0;
    let pendingCount = 0;
    let declinedCount = 0;
    let missingCount = 0;
    let suspendedCount = 0;
    // Bonification-specific counters
    let bonificationCount = 0;
    let bonificationValueArs = 0; // Total plan value that was waived/discounted
    let bonificationDiscountArs = 0; // Total discount amount given

    const planBreakdown = new Map<
      string,
      {
        planId: string;
        planName: string;
        members: number;
        approvedMembers: number;
        expectedRevenueArs: number;
        approvedRevenueArs: number;
        bonifiedMembers: number;
      }
    >();

    for (const subscription of activeSubscriptions) {
      const plan = plans.get(String(subscription.planId));
      const planName = plan?.name ?? "Plan eliminado";
      const planPrice = plan?.priceArs ?? 0;
      const billingSubscriptionId = String(
        subscription.familyParentSubscriptionId ?? subscription._id,
      );
      const currentPayment = paymentBySubscription.get(billingSubscriptionId);
      const isBonified = bonifiedSubscriptionIds.has(billingSubscriptionId);
      const familyGroupSize = familyGroupSizes.get(billingSubscriptionId) ?? 1;
      const approvedAmountPerMember = currentPayment
        ? Math.round(
            (currentPayment.totalAmountArs ?? currentPayment.amountArs) /
              familyGroupSize,
          )
        : 0;
      const interestAmountPerMember = currentPayment
        ? Math.round((currentPayment.interestTotalArs ?? 0) / familyGroupSize)
        : 0;

      if (subscription.status === "suspended") suspendedCount += 1;

      const planEntry = planBreakdown.get(String(subscription.planId)) ?? {
        planId: String(subscription.planId),
        planName,
        members: 0,
        approvedMembers: 0,
        expectedRevenueArs: 0,
        approvedRevenueArs: 0,
        bonifiedMembers: 0,
      };

      planEntry.members += 1;

      if (isBonified) {
        // Bonified subscriptions: excluded from expected revenue
        bonificationCount += 1;
        bonificationValueArs += planPrice;
        planEntry.bonifiedMembers += 1;

        if (currentPayment?.isBonification) {
          const paidAmount =
            currentPayment.totalAmountArs ?? currentPayment.amountArs;
          bonificationDiscountArs += planPrice - paidAmount;
        }
      } else {
        // Normal subscriptions: included in expected revenue
        expectedRevenueArs += planPrice;
        planEntry.expectedRevenueArs += planPrice;
      }

      if (!currentPayment) {
        if (!isBonified) missingCount += 1;
      } else if (currentPayment.status === "approved") {
        if (!currentPayment.isBonification) {
          approvedCount += 1;
          planEntry.approvedMembers += 1;
          approvedRevenueArs += approvedAmountPerMember;
          interestRevenueArs += interestAmountPerMember;
          planEntry.approvedRevenueArs += approvedAmountPerMember;
        }
      } else if (currentPayment.status === "in_review") {
        inReviewCount += 1;
      } else if (currentPayment.status === "pending") {
        pendingCount += 1;
      } else if (currentPayment.status === "declined") {
        declinedCount += 1;
      }

      planBreakdown.set(String(subscription.planId), planEntry);
    }

    const totalTrackedMembers = activeSubscriptions.length;
    const unpaidCount = pendingCount + declinedCount + missingCount;

    const collectionRatePct = roundPercentage(
      approvedRevenueArs,
      expectedRevenueArs,
    );
    const approvalRatePct = roundPercentage(approvedCount, totalTrackedMembers);
    const inReviewRatePct = roundPercentage(inReviewCount, totalTrackedMembers);
    const unpaidRatePct = roundPercentage(unpaidCount, totalTrackedMembers);
    const suspendedRatePct = roundPercentage(
      suspendedCount,
      totalTrackedMembers,
    );

    const methodCounts = new Map<string, number>();
    const paymentsWithMethod = payments.filter((payment) =>
      Boolean(payment.paymentMethod),
    );
    for (const payment of paymentsWithMethod) {
      const method = payment.paymentMethod ?? "Sin metodo";
      methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
    }

    const paymentMethods = Array.from(methodCounts.entries())
      .map(([method, count]) => ({
        method,
        count,
        percentage: roundPercentage(count, paymentsWithMethod.length),
      }))
      .sort((a, b) => b.count - a.count);

    const reviewDurations = payments
      .filter(
        (payment) =>
          typeof payment.proofUploadedAt === "number" &&
          typeof payment.reviewedAt === "number" &&
          payment.reviewedAt >= payment.proofUploadedAt,
      )
      .map(
        (payment) => (payment.reviewedAt! - payment.proofUploadedAt!) / 3600000,
      );

    const averageReviewHours =
      reviewDurations.length > 0
        ? Math.round(
            (reviewDurations.reduce((sum, value) => sum + value, 0) /
              reviewDurations.length) *
              10,
          ) / 10
        : null;

    const recentPeriods = sortBillingPeriodsDesc([
      currentBillingPeriod,
      ...payments.map((payment) => payment.billingPeriod),
      ...financeTransactions.map((transaction) => transaction.period),
    ]).slice(0, 12);

    const monthlyOverview = recentPeriods.map((period) => {
      const periodPayments = payments.filter(
        (payment) => payment.billingPeriod === period,
      );
      const nonBonificationPayments = periodPayments.filter(
        (p) => !p.isBonification,
      );
      const bonificationPayments = periodPayments.filter(
        (p) => p.isBonification,
      );
      const expectedAmount = nonBonificationPayments.reduce(
        (sum, payment) => sum + (payment.totalAmountArs ?? payment.amountArs),
        0,
      );
      const approvedPayments = nonBonificationPayments.filter(
        (payment) => payment.status === "approved",
      );
      const approvedAmount = approvedPayments.reduce(
        (sum, payment) => sum + (payment.totalAmountArs ?? payment.amountArs),
        0,
      );
      const bonificationAmountArs = bonificationPayments.reduce(
        (sum, payment) => sum + (payment.totalAmountArs ?? payment.amountArs),
        0,
      );
      const periodFinanceTransactions = financeTransactions.filter(
        (transaction) => transaction.period === period,
      );
      const otherIncomeArs = periodFinanceTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + transaction.amountArs, 0);
      const expenseArs = periodFinanceTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.amountArs, 0);
      const totalIncomeArs = approvedAmount + otherIncomeArs;

      return {
        billingPeriod: period,
        totalPayments: periodPayments.length,
        approvedPayments: approvedPayments.length,
        inReviewPayments: periodPayments.filter(
          (payment) => payment.status === "in_review",
        ).length,
        declinedPayments: periodPayments.filter(
          (payment) => payment.status === "declined",
        ).length,
        pendingPayments: periodPayments.filter(
          (payment) => payment.status === "pending",
        ).length,
        bonificationPayments: bonificationPayments.length,
        bonificationAmountArs,
        interestAmountArs: approvedPayments.reduce(
          (sum, payment) => sum + (payment.interestTotalArs ?? 0),
          0,
        ),
        expectedAmountArs: expectedAmount,
        approvedAmountArs: approvedAmount,
        otherIncomeArs,
        totalIncomeArs,
        expenseArs,
        netResultArs: totalIncomeArs - expenseArs,
        collectionRatePct: roundPercentage(approvedAmount, expectedAmount),
      };
    });

    const selectedPeriod =
      args.selectedPeriod && recentPeriods.includes(args.selectedPeriod)
        ? args.selectedPeriod
        : currentBillingPeriod;
    const selectedIndex = recentPeriods.indexOf(selectedPeriod);
    const previousPeriod =
      selectedIndex >= 0 ? (recentPeriods[selectedIndex + 1] ?? null) : null;

    const selectedOverview =
      monthlyOverview.find(
        (period) => period.billingPeriod === selectedPeriod,
      ) ?? null;
    const previousOverview = previousPeriod
      ? (monthlyOverview.find(
          (period) => period.billingPeriod === previousPeriod,
        ) ?? null)
      : null;

    const comparison = selectedOverview
      ? {
          approvedAmountDeltaArs:
            selectedOverview.approvedAmountArs -
            (previousOverview?.approvedAmountArs ?? 0),
          totalIncomeDeltaArs:
            selectedOverview.totalIncomeArs -
            (previousOverview?.totalIncomeArs ?? 0),
          expenseDeltaArs:
            selectedOverview.expenseArs - (previousOverview?.expenseArs ?? 0),
          netResultDeltaArs:
            selectedOverview.netResultArs -
            (previousOverview?.netResultArs ?? 0),
          collectionRateDeltaPct:
            selectedOverview.collectionRatePct -
            (previousOverview?.collectionRatePct ?? 0),
          approvedPaymentsDelta:
            selectedOverview.approvedPayments -
            (previousOverview?.approvedPayments ?? 0),
          pendingPaymentsDelta:
            selectedOverview.pendingPayments -
            (previousOverview?.pendingPayments ?? 0),
        }
      : null;

    const selectedExpenseTransactions = financeTransactions.filter(
      (transaction) =>
        transaction.period === selectedPeriod && transaction.type === "expense",
    );
    const selectedIncomeArs = selectedOverview?.totalIncomeArs ?? 0;
    const selectedExpenseArs = selectedOverview?.expenseArs ?? 0;
    const selectedNetResultArs = selectedIncomeArs - selectedExpenseArs;
    const hasExpenseData = selectedExpenseTransactions.length > 0;

    return {
      currentPeriod: currentBillingPeriod,
      selectedPeriod,
      previousPeriod,
      availablePeriods: recentPeriods,
      overview: {
        trackedMembers: totalTrackedMembers,
        expectedRevenueArs,
        approvedRevenueArs,
        outstandingRevenueArs: Math.max(
          expectedRevenueArs - approvedRevenueArs,
          0,
        ),
        interestRevenueArs,
        approvedCount,
        inReviewCount,
        pendingCount,
        declinedCount,
        missingCount,
        unpaidCount,
        suspendedCount,
        collectionRatePct,
        approvalRatePct,
        inReviewRatePct,
        unpaidRatePct,
        suspendedRatePct,
        averageReviewHours,
        bonificationCount,
        bonificationValueArs,
        bonificationDiscountArs,
      },
      selectedOverview,
      previousOverview,
      comparison,
      financialBalance: {
        membershipIncomeArs: selectedOverview?.approvedAmountArs ?? 0,
        otherIncomeArs: selectedOverview?.otherIncomeArs ?? 0,
        incomeArs: selectedIncomeArs,
        interestIncomeArs: selectedOverview?.interestAmountArs ?? 0,
        expenseArs: selectedExpenseArs,
        netResultArs: selectedNetResultArs,
        profitabilityPct:
          hasExpenseData && selectedIncomeArs > 0
            ? Math.round((selectedNetResultArs / selectedIncomeArs) * 1000) /
              10
            : null,
        hasExpenseData,
      },
      paymentMethods,
      planBreakdown: Array.from(planBreakdown.values())
        .map((plan) => ({
          ...plan,
          collectionRatePct: roundPercentage(
            plan.approvedRevenueArs,
            plan.expectedRevenueArs,
          ),
        }))
        .sort((a, b) => b.expectedRevenueArs - a.expectedRevenueArs),
      monthlyOverview,
    };
  },
});

/**
 * Get the download URL for a proof file.
 */
export const getProofUrl = query({
  args: {
    paymentId: v.id("planPayments"),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== membership.organizationId) {
      return null;
    }

    if (!payment.proofStorageId) return null;

    try {
      const url = await ctx.storage.getUrl(payment.proofStorageId);
      if (!url) return null;
      return { url, contentType: payment.proofContentType ?? null };
    } catch {
      return null;
    }
  },
});

/**
 * Generate an upload URL for proof of payment.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Upload proof of payment. Sets the payment status to in_review.
 * Allowed when status is 'pending' or 'declined' (re-upload).
 */
export const uploadProof = mutation({
  args: {
    paymentId: v.id("planPayments"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) {
      throw new Error("Pago no encontrado");
    }
    if (payment.userId !== identity.subject) {
      throw new Error("No podés subir comprobante para otro usuario");
    }
    if (payment.status !== "pending" && payment.status !== "declined") {
      throw new Error("No se puede subir comprobante en este estado");
    }

    // Block proof upload for bonified subscriptions
    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", payment.subscriptionId).eq("status", "active"),
      )
      .first();
    if (activeBonification) {
      throw new Error(
        "Tu plan tiene una bonificación activa. No necesitás subir comprobante.",
      );
    }

    // Delete old proof file if re-uploading
    if (payment.proofStorageId) {
      try {
        await ctx.storage.delete(payment.proofStorageId);
      } catch {
        // Ignore if file already deleted
      }
    }

    // Calculate interest at upload time
    const subscription = await ctx.db.get(payment.subscriptionId);
    const plan = subscription ? await ctx.db.get(subscription.planId) : null;

    const now = Date.now();
    const interest = plan?.interestTiers?.length
      ? computeInterest(
          payment.amountArs,
          plan.interestTiers as InterestTier[],
          payment.billingPeriod,
          plan.paymentWindowEndDay,
          now,
        )
      : { applied: [], totalArs: 0, totalAmount: payment.amountArs };

    await ctx.db.patch(args.paymentId, {
      proofStorageId: args.storageId,
      proofFileName: args.fileName,
      proofContentType: args.contentType,
      proofUploadedAt: now,
      status: "in_review",
      interestApplied: interest.applied.length ? interest.applied : undefined,
      interestTotalArs: interest.totalArs > 0 ? interest.totalArs : undefined,
      totalAmountArs: interest.totalAmount,
      // Clear previous review data on re-upload
      reviewedBy: undefined,
      reviewedAt: undefined,
      reviewNotes: undefined,
      updatedAt: now,
    });
  },
});

/**
 * Admin approves a payment. Reactivates suspended subscriptions.
 */
export const approve = mutation({
  args: {
    paymentId: v.id("planPayments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error("Pago no encontrado");
    }
    if (payment.status !== "in_review") {
      throw new Error("Este pago no está en revisión");
    }

    const subscription = await ctx.db.get(payment.subscriptionId);
    if (!subscription) {
      throw new Error("Suscripción no encontrada");
    }

    const now = Date.now();
    await ctx.db.patch(args.paymentId, {
      status: "approved",
      reviewedBy: identity.subject,
      reviewedAt: now,
      reviewNotes: args.notes?.trim() || undefined,
      updatedAt: now,
    });

    await setFamilySubscriptionsStatus(ctx, subscription, "active", now);
  },
});

/**
 * Admin declines a payment. Member can re-upload.
 */
export const decline = mutation({
  args: {
    paymentId: v.id("planPayments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error("Pago no encontrado");
    }
    if (payment.status !== "in_review") {
      throw new Error("Este pago no está en revisión");
    }

    const now = Date.now();
    await ctx.db.patch(args.paymentId, {
      status: "declined",
      reviewedBy: identity.subject,
      reviewedAt: now,
      reviewNotes: args.notes?.trim() || undefined,
      updatedAt: now,
    });
  },
});

/**
 * Admin deletes a payment record (e.g. approved by mistake).
 * Removes the associated proof file from storage if present.
 */
export const remove = mutation({
  args: { paymentId: v.id("planPayments") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error("Pago no encontrado");
    }

    // Delete the proof file from storage if one was uploaded
    if (payment.proofStorageId) {
      try {
        await ctx.storage.delete(payment.proofStorageId);
      } catch {
        // Ignore if already deleted
      }
    }

    await ctx.db.delete(args.paymentId);
  },
});

/**
 * Admin/trainer records a payment on behalf of a member (cash or bank transfer).
 * The payment is created as approved immediately — no review step needed.
 * For bank transfers the admin may optionally attach proof.
 */
export const recordPayment = mutation({
  args: {
    subscriptionId: v.id("memberPlanSubscriptions"),
    billingPeriod: v.string(), // "YYYY-MM"
    paymentMethod: v.union(v.literal("cash"), v.literal("bank_transfer")),
    amountArs: v.optional(v.number()), // Override; defaults to plan price
    notes: v.optional(v.string()),
    // Optional proof (bank transfer only)
    proofStorageId: v.optional(v.id("_storage")),
    proofFileName: v.optional(v.string()),
    proofContentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const selectedSubscription = await ctx.db.get(args.subscriptionId);
    if (
      !selectedSubscription ||
      selectedSubscription.organizationId !== membership.organizationId
    ) {
      throw new Error("Suscripción no encontrada");
    }

    const { billingSubscription, coveredMemberCount } = await getPaymentCoverage(
      ctx,
      selectedSubscription,
    );

    const subscription = billingSubscription;
    const plan = await ctx.db.get(subscription.planId);
    if (!plan) throw new Error("Plan no encontrado");

    // Block manual payments for bonified subscriptions
    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", subscription._id).eq("status", "active"),
      )
      .first();
    if (activeBonification) {
      throw new Error(
        "Esta suscripción tiene una bonificación activa. Revocá la bonificación primero para registrar pagos manuales.",
      );
    }

    // Validate billing period format
    if (!/^\d{4}-\d{2}$/.test(args.billingPeriod)) {
      throw new Error("Período de facturación inválido (esperado YYYY-MM)");
    }

    // Check for duplicate payment in the same period
    const existing = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", subscription._id)
          .eq("billingPeriod", args.billingPeriod),
      )
      .first();
    if (existing && existing.status === "approved") {
      throw new Error("Ya existe un pago aprobado para este período");
    }

    const now = Date.now();
    const defaultAmountArs = plan.priceArs * coveredMemberCount;
    const amountArs = args.amountArs ?? defaultAmountArs;

    if (existing) {
      // Update the existing pending/declined/in_review payment
      await ctx.db.patch(existing._id, {
        status: "approved",
        amountArs,
        totalAmountArs: amountArs,
        paymentMethod: args.paymentMethod,
        recordedBy: identity.subject,
        reviewedBy: identity.subject,
        reviewedAt: now,
        reviewNotes: args.notes?.trim() || undefined,
        proofStorageId: args.proofStorageId,
        proofFileName: args.proofFileName,
        proofContentType: args.proofContentType,
        proofUploadedAt: args.proofStorageId ? now : undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("planPayments", {
        organizationId: membership.organizationId,
        userId: subscription.userId,
        subscriptionId: subscription._id,
        planId: subscription.planId,
        billingPeriod: args.billingPeriod,
        amountArs,
        totalAmountArs: amountArs,
        paymentMethod: args.paymentMethod,
        recordedBy: identity.subject,
        status: "approved",
        reviewedBy: identity.subject,
        reviewedAt: now,
        reviewNotes: args.notes?.trim() || undefined,
        proofStorageId: args.proofStorageId,
        proofFileName: args.proofFileName,
        proofContentType: args.proofContentType,
        proofUploadedAt: args.proofStorageId ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    await setFamilySubscriptionsStatus(ctx, subscription, "active", now);
  },
});

/**
 * Enrich payments with user and plan details.
 */
async function enrichPayments(ctx: { db: any }, payments: any[]) {
  return await Promise.all(
    payments.map(async (payment) => {
      const subscription = await ctx.db.get(payment.subscriptionId);
      const coverage = subscription
        ? await getPaymentCoverage(ctx, subscription)
        : null;
      const [plan, user] = await Promise.all([
        ctx.db.get(payment.planId),
        ctx.db
          .query("users")
          .withIndex("by_externalId", (q: any) =>
            q.eq("externalId", payment.userId),
          )
          .first(),
      ]);
      const coveredMemberNames = coverage
        ? await Promise.all(
            coverage.coveredSubscriptions.map(async (item) => {
              const relatedUser = await ctx.db
                .query("users")
                .withIndex("by_externalId", (q: any) =>
                  q.eq("externalId", item.userId),
                )
                .first();
              return relatedUser?.fullName ?? relatedUser?.email ?? item.userId;
            }),
          )
        : [user?.fullName ?? user?.email ?? payment.userId];
      return {
        ...payment,
        planName: plan?.name ?? "Plan eliminado",
        userFullName: user?.fullName ?? user?.email ?? payment.userId,
        coveredMemberCount: coverage?.coveredMemberCount ?? 1,
        coveredMemberNames,
      };
    }),
  );
}
