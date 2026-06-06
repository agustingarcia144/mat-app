import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import { computeBonificationAmount } from "./planBonifications";

type InterestTier = {
  daysAfterWindowEnd: number;
  type: "percentage" | "fixed";
  value: number;
};

type AppliedTier = InterestTier & { amountArs: number };
type BillingMode = "calendar" | "join_date";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAYMENT_TIMEZONE = "America/Argentina/Buenos_Aires";

function getPaymentTimezone(timezone?: string) {
  return timezone && timezone.trim() !== ""
    ? timezone.trim()
    : DEFAULT_PAYMENT_TIMEZONE;
}

function getZonedDateParts(timestamp: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    year: parseInt(partMap.year!, 10),
    month: parseInt(partMap.month!, 10),
    day: parseInt(partMap.day!, 10),
  };
}

function getDaysAfterPaymentWindow(
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number,
  timezone: string,
  dueAt?: number,
) {
  const [yearStr, monthStr] = billingPeriod.split("-");
  const billingYear = parseInt(yearStr!, 10);
  const billingMonth = parseInt(monthStr!, 10);
  const nowParts = getZonedDateParts(nowMs, timezone);

  const dueParts = dueAt ? getZonedDateParts(dueAt, timezone) : null;
  const windowEndDateMs = dueParts
    ? Date.UTC(dueParts.year, dueParts.month - 1, dueParts.day)
    : Date.UTC(billingYear, billingMonth - 1, paymentWindowEndDay);
  const currentLocalDateMs = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day,
  );

  return Math.max(
    0,
    Math.floor((currentLocalDateMs - windowEndDateMs) / DAY_MS),
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, monthsToAdd: number) {
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function getBillingCycle(
  plan: { billingMode?: BillingMode; paymentWindowEndDay?: number },
  activatedAt: number,
  referenceAt: number,
  timezone: string,
) {
  const mode = plan.billingMode ?? "calendar";
  const ref = getZonedDateParts(referenceAt, timezone);

  if (mode === "join_date") {
    const activated = getZonedDateParts(activatedAt, timezone);
    const anchorDay = activated.day;
    const currentAnchorDay = Math.min(
      anchorDay,
      daysInMonth(ref.year, ref.month),
    );
    const startMonth =
      ref.day >= currentAnchorDay
        ? { year: ref.year, month: ref.month }
        : addMonths(ref.year, ref.month, -1);
    const endMonth = addMonths(startMonth.year, startMonth.month, 1);
    const cycleStartDay = Math.min(
      anchorDay,
      daysInMonth(startMonth.year, startMonth.month),
    );
    const cycleEndDay = Math.min(
      anchorDay,
      daysInMonth(endMonth.year, endMonth.month),
    );

    return {
      billingPeriod: `${startMonth.year}-${String(startMonth.month).padStart(2, "0")}`,
      cycleStartAt: Date.UTC(
        startMonth.year,
        startMonth.month - 1,
        cycleStartDay,
      ),
      cycleEndAt: Date.UTC(endMonth.year, endMonth.month - 1, cycleEndDay),
      dueAt: Date.UTC(startMonth.year, startMonth.month - 1, cycleStartDay),
    };
  }

  return {
    billingPeriod: `${ref.year}-${String(ref.month).padStart(2, "0")}`,
    cycleStartAt: Date.UTC(ref.year, ref.month - 1, 1),
    cycleEndAt: Date.UTC(ref.year, ref.month, 1),
    dueAt: Date.UTC(ref.year, ref.month - 1, plan.paymentWindowEndDay ?? 28),
  };
}

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

  const coveredSubscriptions = [
    billingSubscription,
    ...childSubscriptions,
  ].filter((item) => item.status !== "cancelled");
  const activeMemberUserIds = await getActiveMemberUserIds(
    ctx,
    billingSubscription.organizationId,
  );
  const chargeableSubscriptions = coveredSubscriptions.filter((item) =>
    activeMemberUserIds.has(item.userId),
  );

  return {
    billingSubscription,
    coveredSubscriptions: chargeableSubscriptions,
    coveredMemberCount: chargeableSubscriptions.length,
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
  timezone: string,
  dueAt?: number,
): { applied: AppliedTier[]; totalArs: number; totalAmount: number } {
  const daysElapsed = getDaysAfterPaymentWindow(
    billingPeriod,
    paymentWindowEndDay,
    nowMs,
    timezone,
    dueAt,
  );

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

function getInterestFields(interest: {
  applied: AppliedTier[];
  totalArs: number;
  totalAmount: number;
}) {
  return {
    interestApplied: interest.applied.length ? interest.applied : undefined,
    interestTotalArs: interest.totalArs > 0 ? interest.totalArs : undefined,
    totalAmountArs: interest.totalAmount,
  };
}

async function computePaymentInterest(
  ctx: { db: any },
  payment: {
    organizationId: Id<"organizations">;
    subscriptionId: Id<"memberPlanSubscriptions">;
    amountArs: number;
    paymentMethod?: string;
    isBonification?: boolean;
    billingPeriod: string;
    dueAt?: number;
  },
  paidAtMs: number,
) {
  const subscription = await ctx.db.get(payment.subscriptionId);
  const [plan, organization] = await Promise.all([
    subscription
      ? ctx.db.get(subscription.planId as Id<"membershipPlans">)
      : null,
    ctx.db.get(payment.organizationId),
  ]);
  const coverage = subscription
    ? await getPaymentCoverage(ctx, subscription)
    : null;
  const baseAmount =
    !payment.isBonification &&
    payment.paymentMethod !== "bonification" &&
    payment.amountArs <= 0 &&
    plan &&
    (coverage?.coveredMemberCount ?? 1) > 0
      ? plan.priceArs * (coverage?.coveredMemberCount ?? 1)
      : payment.amountArs;

  if (!plan?.interestTiers?.length) {
    return { applied: [], totalArs: 0, totalAmount: baseAmount };
  }

  return computeInterest(
    baseAmount,
    plan.interestTiers as InterestTier[],
    payment.billingPeriod,
    plan.paymentWindowEndDay,
    paidAtMs,
    getPaymentTimezone(organization?.timezone),
    payment.dueAt,
  );
}

async function getActiveMemberUserIds(
  ctx: { db: any },
  organizationId: Id<"organizations">,
): Promise<Set<string>> {
  const activeMemberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .filter((q: any) =>
      q.and(q.eq(q.field("role"), "member"), q.eq(q.field("status"), "active")),
    )
    .collect();

  return new Set<string>(
    activeMemberships.map((membership: any) => String(membership.userId)),
  );
}

function isChargeablePayment(
  payment: { userId: string; status: string },
  activeMemberUserIds: Set<string>,
) {
  return (
    payment.status === "approved" || activeMemberUserIds.has(payment.userId)
  );
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
    const [plan, organization] = await Promise.all([
      ctx.db.get(billingSubscription.planId as Id<"membershipPlans">),
      ctx.db.get(membership.organizationId),
    ]);

    const timezone = getPaymentTimezone(organization?.timezone);
    const now = Date.now();
    const cycle = plan
      ? getBillingCycle(plan, billingSubscription.activatedAt, now, timezone)
      : null;
    if (!plan || !cycle) return null;

    const billingPeriod =
      cycle?.billingPeriod ??
      (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

    const currentPeriodPayment = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", billingSubscription._id)
          .eq("billingPeriod", billingPeriod),
      )
      .first();

    let payment: any = currentPeriodPayment;
    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", billingSubscription._id).eq("status", "active"),
      )
      .first();
    const bonifiedAmountPerMember = activeBonification
      ? computeBonificationAmount(
          plan.priceArs,
          activeBonification.discountType,
          activeBonification.discountValue,
        )
      : null;

    if (!payment && bonifiedAmountPerMember === 0) return null;

    const virtualAmountArs =
      (bonifiedAmountPerMember ?? plan.priceArs) * coveredMemberCount;

    if (!payment) {
      payment = {
        organizationId: membership.organizationId,
        userId: billingSubscription.userId,
        subscriptionId: billingSubscription._id,
        planId: billingSubscription.planId,
        billingPeriod,
        billingCycleStartAt: cycle.cycleStartAt,
        billingCycleEndAt: cycle.cycleEndAt,
        dueAt: cycle.dueAt,
        amountArs: virtualAmountArs,
        totalAmountArs: virtualAmountArs,
        bonificationId: activeBonification?._id,
        isBonification: Boolean(activeBonification),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      ...payment,
      payableAmountArs:
        !payment.isBonification &&
        payment.paymentMethod !== "bonification" &&
        payment.amountArs <= 0 &&
        plan &&
        coveredMemberCount > 0
          ? plan.priceArs * coveredMemberCount
          : (payment.totalAmountArs ?? payment.amountArs),
      coveredMemberCount,
      coveredUserIds:
        coveredMemberCount > 1
          ? billingSubscription.familyMemberUserIds
          : undefined,
      planInterestTiers: plan?.interestTiers ?? [],
      planPaymentWindowEndDay: plan?.paymentWindowEndDay ?? 28,
      planPaymentTimezone: timezone,
      planBillingMode: plan?.billingMode ?? "calendar",
      planDueAt: payment.dueAt ?? cycle?.dueAt,
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

    const [subscription, plan] = await Promise.all([
      ctx.db.get(payment.subscriptionId),
      ctx.db.get(payment.planId as Id<"membershipPlans">),
    ]);
    const coverage = subscription
      ? await getPaymentCoverage(ctx, subscription)
      : null;
    const payableAmountArs =
      !payment.isBonification &&
      payment.paymentMethod !== "bonification" &&
      payment.amountArs <= 0 &&
      plan &&
      (coverage?.coveredMemberCount ?? 1) > 0
        ? plan.priceArs * (coverage?.coveredMemberCount ?? 1)
        : (payment.totalAmountArs ?? payment.amountArs);

    if (payment.status === "in_review" && payment.proofUploadedAt) {
      const interest = await computePaymentInterest(
        ctx,
        payment,
        payment.proofUploadedAt,
      );
      return {
        ...payment,
        payableAmountArs,
        ...getInterestFields(interest),
      };
    }

    return { ...payment, payableAmountArs };
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

    const { billingSubscription, coveredMemberCount } =
      await getPaymentCoverage(ctx, subscription);
    const plan = await ctx.db.get(
      billingSubscription.planId as Id<"membershipPlans">,
    );

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
    return payments
      .map((payment) => ({
        ...payment,
        payableAmountArs:
          !payment.isBonification &&
          payment.paymentMethod !== "bonification" &&
          payment.amountArs <= 0 &&
          plan &&
          coveredMemberCount > 0
            ? plan.priceArs * coveredMemberCount
            : (payment.totalAmountArs ?? payment.amountArs),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
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

    const activeMemberUserIds = await getActiveMemberUserIds(
      ctx,
      membership.organizationId,
    );

    const payments = (
      await ctx.db
        .query("planPayments")
        .withIndex("by_organization_status", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("status", "in_review"),
        )
        .collect()
    ).filter((payment) => isChargeablePayment(payment, activeMemberUserIds));

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

    const activeMemberUserIds = await getActiveMemberUserIds(
      ctx,
      membership.organizationId,
    );

    const payments = (
      args.status
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
            .collect()
    ).filter((payment) => isChargeablePayment(payment, activeMemberUserIds));

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
      activeMemberUserIds,
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
      getActiveMemberUserIds(ctx, membership.organizationId),
    ]);

    const chargeablePayments = payments.filter((payment) =>
      isChargeablePayment(payment, activeMemberUserIds),
    );

    const activeBonificationBySubscriptionId = new Map(
      activeBonifications.map((bonification) => [
        String(bonification.subscriptionId),
        bonification,
      ]),
    );

    const planIds = new Set<string>();
    for (const payment of chargeablePayments)
      planIds.add(String(payment.planId));
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
      (subscription) =>
        subscription.status !== "cancelled" &&
        activeMemberUserIds.has(subscription.userId),
    );
    const currentBillingPeriod = getCurrentBillingPeriod();

    const currentPayments = chargeablePayments.filter(
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
    const countedPendingBillingSubscriptionIds = new Set<string>();

    for (const subscription of activeSubscriptions) {
      const billingKey = String(
        subscription.familyParentSubscriptionId ?? subscription._id,
      );
      familyGroupSizes.set(
        billingKey,
        (familyGroupSizes.get(billingKey) ?? 0) + 1,
      );
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
      const activeBonification = activeBonificationBySubscriptionId.get(
        billingSubscriptionId,
      );
      const effectivePlanPrice = activeBonification
        ? computeBonificationAmount(
            planPrice,
            activeBonification.discountType,
            activeBonification.discountValue,
          )
        : planPrice;
      const isFullyBonified = activeBonification && effectivePlanPrice === 0;
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

      if (activeBonification) {
        bonificationCount += 1;
        bonificationValueArs += planPrice;
        planEntry.bonifiedMembers += 1;
        bonificationDiscountArs += planPrice - effectivePlanPrice;
      }

      if (!isFullyBonified) {
        expectedRevenueArs += effectivePlanPrice;
        planEntry.expectedRevenueArs += effectivePlanPrice;
      }

      if (currentPayment?.status === "approved") {
        if (!isFullyBonified) {
          approvedCount += 1;
          planEntry.approvedMembers += 1;
          approvedRevenueArs += approvedAmountPerMember;
          interestRevenueArs += interestAmountPerMember;
          planEntry.approvedRevenueArs += approvedAmountPerMember;
        }
      } else if (
        !isFullyBonified &&
        !countedPendingBillingSubscriptionIds.has(billingSubscriptionId)
      ) {
        countedPendingBillingSubscriptionIds.add(billingSubscriptionId);
        if (!currentPayment) {
          missingCount += 1;
        } else if (currentPayment.status === "in_review") {
          inReviewCount += 1;
        } else if (currentPayment.status === "pending") {
          pendingCount += 1;
        } else if (currentPayment.status === "declined") {
          declinedCount += 1;
        }
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
    const paymentsWithMethod = chargeablePayments.filter((payment) =>
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

    const reviewDurations = chargeablePayments
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
      ...chargeablePayments.map((payment) => payment.billingPeriod),
      ...financeTransactions.map((transaction) => transaction.period),
    ]).slice(0, 12);

    const monthlyOverview = recentPeriods.map((period) => {
      const periodPayments = chargeablePayments.filter(
        (payment) => payment.billingPeriod === period,
      );
      const nonBonificationPayments = periodPayments.filter(
        (p) => !p.isBonification,
      );
      const bonificationPayments = periodPayments.filter(
        (p) => p.isBonification,
      );
      const isCurrentPeriod = period === currentBillingPeriod;
      const paymentRowsExpectedAmount = nonBonificationPayments.reduce(
        (sum, payment) => sum + (payment.totalAmountArs ?? payment.amountArs),
        0,
      );
      const approvedPaymentRows = nonBonificationPayments.filter(
        (payment) => payment.status === "approved",
      );
      const paymentRowsApprovedAmount = approvedPaymentRows.reduce(
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
      const expectedAmount = isCurrentPeriod
        ? expectedRevenueArs
        : paymentRowsExpectedAmount;
      const approvedAmount = isCurrentPeriod
        ? approvedRevenueArs
        : paymentRowsApprovedAmount;
      const approvedPayments = isCurrentPeriod
        ? approvedCount
        : approvedPaymentRows.length;
      const pendingPayments = isCurrentPeriod
        ? pendingCount + missingCount
        : nonBonificationPayments.filter(
            (payment) => payment.status === "pending",
          ).length;
      const inReviewPayments = isCurrentPeriod
        ? inReviewCount
        : nonBonificationPayments.filter(
            (payment) => payment.status === "in_review",
          ).length;
      const declinedPayments = isCurrentPeriod
        ? declinedCount
        : nonBonificationPayments.filter(
            (payment) => payment.status === "declined",
          ).length;
      const interestAmountArs = isCurrentPeriod
        ? interestRevenueArs
        : approvedPaymentRows.reduce(
            (sum, payment) => sum + (payment.interestTotalArs ?? 0),
            0,
          );
      const totalIncomeArs = approvedAmount + otherIncomeArs;

      return {
        billingPeriod: period,
        totalPayments: periodPayments.length,
        approvedPayments,
        inReviewPayments,
        declinedPayments,
        pendingPayments,
        bonificationPayments: bonificationPayments.length,
        bonificationAmountArs,
        interestAmountArs,
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
            selectedOverview.pendingPayments +
            selectedOverview.inReviewPayments -
            ((previousOverview?.pendingPayments ?? 0) +
              (previousOverview?.inReviewPayments ?? 0)),
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
            ? Math.round((selectedNetResultArs / selectedIncomeArs) * 1000) / 10
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
    paymentId: v.optional(v.id("planPayments")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    let payment = args.paymentId ? await ctx.db.get(args.paymentId) : null;

    if (payment) {
      if (payment.organizationId !== membership.organizationId) {
        throw new Error("Pago no encontrado");
      }
      const paymentSubscription = await ctx.db.get(payment.subscriptionId);
      if (!paymentSubscription) {
        throw new Error("Suscripción no encontrada");
      }
      const { coveredSubscriptions } = await getPaymentCoverage(
        ctx,
        paymentSubscription,
      );
      if (
        payment.userId !== identity.subject &&
        !coveredSubscriptions.some((item) => item.userId === identity.subject)
      ) {
        throw new Error("No podés subir comprobante para otro usuario");
      }
      if (payment.status !== "pending" && payment.status !== "declined") {
        throw new Error("No se puede subir comprobante en este estado");
      }
      const existingPayment = payment;
      const activeBonification = await ctx.db
        .query("planBonifications")
        .withIndex("by_subscription_status", (q) =>
          q
            .eq("subscriptionId", existingPayment.subscriptionId)
            .eq("status", "active"),
        )
        .first();
      if (activeBonification) {
        const bonifiedPlan = await ctx.db.get(activeBonification.planId);
        const effectiveAmount = bonifiedPlan
          ? computeBonificationAmount(
              bonifiedPlan.priceArs,
              activeBonification.discountType,
              activeBonification.discountValue,
            )
          : 0;
        if (effectiveAmount === 0) {
          throw new Error(
            "Tu plan tiene una bonificación activa. No necesitás subir comprobante.",
          );
        }
      }
    } else {
      const subscription = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", identity.subject),
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .first();

      if (!subscription) {
        throw new Error("No tenés un plan activo para pagar");
      }

      const { billingSubscription, coveredMemberCount, coveredSubscriptions } =
        await getPaymentCoverage(ctx, subscription);
      if (
        !coveredSubscriptions.some((item) => item.userId === identity.subject)
      ) {
        throw new Error("No podés subir comprobante para otro usuario");
      }

      const [plan, organization] = await Promise.all([
        ctx.db.get(billingSubscription.planId as Id<"membershipPlans">),
        ctx.db.get(membership.organizationId),
      ]);
      if (!plan) {
        throw new Error("Plan no encontrado");
      }

      const now = Date.now();
      const timezone = getPaymentTimezone(organization?.timezone);
      const cycle = getBillingCycle(
        plan,
        billingSubscription.activatedAt,
        now,
        timezone,
      );

      payment = await ctx.db
        .query("planPayments")
        .withIndex("by_subscription_period", (q) =>
          q
            .eq("subscriptionId", billingSubscription._id)
            .eq("billingPeriod", cycle.billingPeriod),
        )
        .first();

      if (payment) {
        if (payment.status !== "pending" && payment.status !== "declined") {
          throw new Error("No se puede subir comprobante en este estado");
        }
      } else {
        const activeBonification = await ctx.db
          .query("planBonifications")
          .withIndex("by_subscription_status", (q) =>
            q
              .eq("subscriptionId", billingSubscription._id)
              .eq("status", "active"),
          )
          .first();
        const effectiveAmountPerMember = activeBonification
          ? computeBonificationAmount(
              plan.priceArs,
              activeBonification.discountType,
              activeBonification.discountValue,
            )
          : plan.priceArs;
        if (effectiveAmountPerMember === 0) {
          throw new Error(
            "Tu plan tiene una bonificación activa. No necesitás subir comprobante.",
          );
        }

        const amountArs = effectiveAmountPerMember * coveredMemberCount;
        const interest = computeInterest(
          amountArs,
          (plan.interestTiers ?? []) as InterestTier[],
          cycle.billingPeriod,
          plan.paymentWindowEndDay,
          now,
          timezone,
          cycle.dueAt,
        );
        await ctx.db.insert("planPayments", {
          organizationId: membership.organizationId,
          userId: billingSubscription.userId,
          subscriptionId: billingSubscription._id,
          planId: billingSubscription.planId,
          billingPeriod: cycle.billingPeriod,
          billingCycleStartAt: cycle.cycleStartAt,
          billingCycleEndAt: cycle.cycleEndAt,
          dueAt: cycle.dueAt,
          amountArs,
          paymentMethod: "proof_upload",
          bonificationId: activeBonification?._id,
          isBonification: Boolean(activeBonification),
          proofStorageId: args.storageId,
          proofFileName: args.fileName,
          proofContentType: args.contentType,
          proofUploadedAt: now,
          status: "in_review",
          ...getInterestFields(interest),
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
    }

    if (!payment) {
      throw new Error("Pago no encontrado");
    }

    // Delete old proof file if re-uploading
    if (payment.proofStorageId) {
      try {
        await ctx.storage.delete(payment.proofStorageId);
      } catch {
        // Ignore if file already deleted
      }
    }

    const now = Date.now();
    const interest = await computePaymentInterest(ctx, payment, now);

    await ctx.db.patch(payment._id, {
      proofStorageId: args.storageId,
      proofFileName: args.fileName,
      proofContentType: args.contentType,
      proofUploadedAt: now,
      status: "in_review",
      paymentMethod: payment.paymentMethod ?? "proof_upload",
      ...getInterestFields(interest),
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
    const interest = await computePaymentInterest(
      ctx,
      payment,
      payment.proofUploadedAt ?? now,
    );
    await ctx.db.patch(args.paymentId, {
      status: "approved",
      ...getInterestFields(interest),
      reviewedBy: identity.subject,
      reviewedAt: now,
      reviewNotes: args.notes?.trim() || undefined,
      updatedAt: now,
    });

    await setFamilySubscriptionsStatus(ctx, subscription, "active", now);

    await ctx.scheduler.runAfter(
      0,
      internal.pushNotifications.sendPaymentReviewNotification,
      {
        paymentId: args.paymentId,
        status: "approved",
      },
    );
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

    await ctx.scheduler.runAfter(
      0,
      internal.pushNotifications.sendPaymentReviewNotification,
      {
        paymentId: args.paymentId,
        status: "declined",
      },
    );
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

    const { billingSubscription, coveredMemberCount } =
      await getPaymentCoverage(ctx, selectedSubscription);

    const subscription = billingSubscription;
    const plan = await ctx.db.get(subscription.planId as Id<"membershipPlans">);
    if (!plan) throw new Error("Plan no encontrado");

    // Block manual payments only for fully bonified subscriptions (100% discount)
    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", subscription._id).eq("status", "active"),
      )
      .first();
    if (activeBonification) {
      const effectiveAmount = computeBonificationAmount(
        plan.priceArs,
        activeBonification.discountType,
        activeBonification.discountValue,
      );
      if (effectiveAmount === 0) {
        throw new Error(
          "Esta suscripción tiene una bonificación activa. Revocá la bonificación primero para registrar pagos manuales.",
        );
      }
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
        ctx.db.get(payment.planId as Id<"membershipPlans">),
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
        payableAmountArs:
          !payment.isBonification &&
          payment.paymentMethod !== "bonification" &&
          payment.amountArs <= 0 &&
          plan &&
          (coverage?.coveredMemberCount ?? 1) > 0
            ? plan.priceArs * (coverage?.coveredMemberCount ?? 1)
            : (payment.totalAmountArs ?? payment.amountArs),
      };
    }),
  );
}
