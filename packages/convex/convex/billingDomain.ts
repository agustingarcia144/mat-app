/**
 * Pure billing-domain calculations shared by member subscriptions, plan
 * payments and the Mercado Pago member-payment integration.
 *
 * Everything in this module is deterministic and side-effect free: no Convex
 * context, no `Date.now()`, no I/O. That keeps it unit-testable and keeps a
 * single definition of the cycle/date/amount rules that used to be duplicated
 * across `memberPlanSubscriptions.ts` and `planPayments.ts`.
 *
 * Date convention (unchanged from the original implementations): calendar days
 * are resolved in the organization timezone, but the resulting cycle
 * boundaries are stored as `Date.UTC(year, month - 1, day)` — a timezone-free
 * "civil date at midnight UTC" marker, not a real instant in the gym's local
 * time. Comparisons must therefore also be made against UTC civil dates.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PAYMENT_TIMEZONE = "America/Argentina/Buenos_Aires";

export type BillingMode = "calendar" | "join_date";

/**
 * Local access states. Provider states (authorized, retrying, ...) never
 * appear here — they live on the recurring agreement or the transaction.
 */
export type MemberSubscriptionStatus =
  | "pending_payment"
  | "active"
  | "suspended"
  | "cancelled";

export type PlanCycleConfig = {
  billingMode?: BillingMode;
  paymentWindowEndDay?: number;
};

export type BillingCycle = {
  billingPeriod: string;
  cycleStartAt: number;
  cycleEndAt: number;
  dueAt: number;
};

export type InterestTier = {
  daysAfterWindowEnd: number;
  type: "percentage" | "fixed";
  value: number;
};

export type AppliedInterestTier = InterestTier & { amountArs: number };

export type InterestResult = {
  applied: AppliedInterestTier[];
  totalArs: number;
  totalAmount: number;
};

export function getPaymentTimezone(timezone?: string) {
  return timezone && timezone.trim() !== ""
    ? timezone.trim()
    : DEFAULT_PAYMENT_TIMEZONE;
}

export function getZonedDateParts(timestamp: number, timezone: string) {
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

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(year: number, month: number, monthsToAdd: number) {
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function formatBillingPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseBillingPeriod(billingPeriod: string) {
  const [yearStr, monthStr] = billingPeriod.split("-");
  return {
    year: parseInt(yearStr!, 10),
    month: parseInt(monthStr!, 10),
  };
}

/**
 * Clamp an anchor day (1-31) to a month that may be shorter. A member who
 * joined on the 31st bills on the 30th in November and the 28th/29th in
 * February, then returns to the 31st in longer months.
 */
export function clampAnchorDay(anchorDay: number, year: number, month: number) {
  return Math.min(anchorDay, daysInMonth(year, month));
}

/**
 * First due date for a join-date plan: one month after activation, anchored to
 * the activation day of month.
 */
export function getFirstJoinDateBillingDueAt(
  activatedAt: number,
  timezone: string,
) {
  const activated = getZonedDateParts(activatedAt, timezone);
  const firstDueMonth = addMonths(activated.year, activated.month, 1);
  const firstDueDay = clampAnchorDay(
    activated.day,
    firstDueMonth.year,
    firstDueMonth.month,
  );
  return Date.UTC(firstDueMonth.year, firstDueMonth.month - 1, firstDueDay);
}

/**
 * The billing cycle that contains `referenceAt`.
 *
 * - `calendar`: the natural calendar month, due on `paymentWindowEndDay`.
 * - `join_date`: an anchored cycle running from the activation day of one
 *   month to the same day of the next, due at the cycle start.
 */
export function getBillingCycle(
  plan: PlanCycleConfig,
  activatedAt: number,
  referenceAt: number,
  timezone: string,
): BillingCycle {
  const mode = plan.billingMode ?? "calendar";
  const ref = getZonedDateParts(referenceAt, timezone);

  if (mode === "join_date") {
    const activated = getZonedDateParts(activatedAt, timezone);
    const anchorDay = activated.day;
    const currentAnchorDay = clampAnchorDay(anchorDay, ref.year, ref.month);
    const startMonth =
      ref.day >= currentAnchorDay
        ? { year: ref.year, month: ref.month }
        : addMonths(ref.year, ref.month, -1);

    return buildJoinDateCycle(anchorDay, startMonth.year, startMonth.month);
  }

  return {
    billingPeriod: formatBillingPeriod(ref.year, ref.month),
    cycleStartAt: Date.UTC(ref.year, ref.month - 1, 1),
    cycleEndAt: Date.UTC(ref.year, ref.month, 1),
    dueAt: Date.UTC(ref.year, ref.month - 1, plan.paymentWindowEndDay ?? 28),
  };
}

/** Build the anchored join-date cycle that starts in the given month. */
export function buildJoinDateCycle(
  anchorDay: number,
  startYear: number,
  startMonth: number,
): BillingCycle {
  const endMonth = addMonths(startYear, startMonth, 1);
  const cycleStartDay = clampAnchorDay(anchorDay, startYear, startMonth);
  const cycleEndDay = clampAnchorDay(anchorDay, endMonth.year, endMonth.month);
  const cycleStartAt = Date.UTC(startYear, startMonth - 1, cycleStartDay);

  return {
    billingPeriod: formatBillingPeriod(startYear, startMonth),
    cycleStartAt,
    cycleEndAt: Date.UTC(endMonth.year, endMonth.month - 1, cycleEndDay),
    dueAt: cycleStartAt,
  };
}

/**
 * The consecutive cycles an advance payment of `months` covers, starting with
 * the cycle that contains `referenceAt`.
 *
 * Join-date plans get anchored cycles (the previous implementation always used
 * calendar-month boundaries here, which produced coverage that did not line up
 * with the cycles renewals actually generate).
 */
export function getAdvanceBillingCycles(
  plan: PlanCycleConfig,
  activatedAt: number,
  referenceAt: number,
  months: number,
  timezone: string,
): BillingCycle[] {
  if (months <= 0) return [];

  const first = getBillingCycle(plan, activatedAt, referenceAt, timezone);
  const cycles: BillingCycle[] = [first];

  if ((plan.billingMode ?? "calendar") === "join_date") {
    const anchorDay = getZonedDateParts(activatedAt, timezone).day;
    const firstMonth = parseBillingPeriod(first.billingPeriod);
    for (let index = 1; index < months; index += 1) {
      const month = addMonths(firstMonth.year, firstMonth.month, index);
      cycles.push(buildJoinDateCycle(anchorDay, month.year, month.month));
    }
    return cycles;
  }

  const firstMonth = parseBillingPeriod(first.billingPeriod);
  for (let index = 1; index < months; index += 1) {
    const month = addMonths(firstMonth.year, firstMonth.month, index);
    cycles.push({
      billingPeriod: formatBillingPeriod(month.year, month.month),
      cycleStartAt: Date.UTC(month.year, month.month - 1, 1),
      cycleEndAt: Date.UTC(month.year, month.month, 1),
      dueAt: Date.UTC(
        month.year,
        month.month - 1,
        plan.paymentWindowEndDay ?? 28,
      ),
    });
  }

  return cycles;
}

/**
 * Whole days elapsed since the payment window closed, in the organization
 * timezone. Returns 0 while the window is still open.
 */
export function getDaysAfterPaymentWindow(
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number,
  timezone: string,
  dueAt?: number,
) {
  const { year: billingYear, month: billingMonth } =
    parseBillingPeriod(billingPeriod);
  const nowParts = getZonedDateParts(nowMs, timezone);

  // dueAt is stored as Date.UTC(year, month-1, day) so use UTC components directly.
  // Using timezone-converted parts would shift the day in negative-offset timezones (e.g. ART UTC-3),
  // making midnight UTC resolve to the previous local day and shortening the payment window by one day.
  const windowEndDateMs =
    dueAt !== undefined
      ? Date.UTC(
          new Date(dueAt).getUTCFullYear(),
          new Date(dueAt).getUTCMonth(),
          new Date(dueAt).getUTCDate(),
        )
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

/** Cumulative late-fee tiers that have activated by `nowMs`. */
export function computeInterest(
  baseAmount: number,
  tiers: InterestTier[],
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number,
  timezone: string,
  dueAt?: number,
): InterestResult {
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

  const applied: AppliedInterestTier[] = [];
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

/** Per-member price after an active bonification, if any. */
export function computeBonifiedPricePerMember(
  planPriceArs: number,
  bonification?: {
    discountType: "percentage" | "fixed" | "full";
    discountValue: number;
  } | null,
): number {
  if (!bonification) return planPriceArs;
  if (bonification.discountType === "full") return 0;
  if (bonification.discountType === "percentage") {
    return Math.round(planPriceArs * (1 - bonification.discountValue / 100));
  }
  return Math.max(0, planPriceArs - bonification.discountValue);
}

/**
 * Amount actually owed for one cycle by a (possibly family) subscription.
 * Bonification applies per member, then the family multiplier.
 */
export function computeEffectiveCycleAmountArs(params: {
  planPriceArs: number;
  memberCount: number;
  bonification?: {
    discountType: "percentage" | "fixed" | "full";
    discountValue: number;
  } | null;
}): number {
  const perMember = computeBonifiedPricePerMember(
    params.planPriceArs,
    params.bonification,
  );
  return perMember * Math.max(0, params.memberCount);
}

/** Total for an advance purchase of `months` cycles at `discountPercentage`. */
export function computeAdvanceTotalArs(params: {
  planPriceArs: number;
  memberCount: number;
  months: number;
  discountPercentage: number;
  bonification?: {
    discountType: "percentage" | "fixed" | "full";
    discountValue: number;
  } | null;
}) {
  const perMember = computeBonifiedPricePerMember(
    params.planPriceArs,
    params.bonification,
  );
  const discountedPerMember = Math.round(
    perMember * (1 - params.discountPercentage / 100),
  );
  const perCycleArs = discountedPerMember * Math.max(0, params.memberCount);

  return {
    discountedPricePerMemberArs: discountedPerMember,
    perCycleArs,
    totalArs: perCycleArs * Math.max(0, params.months),
  };
}

/**
 * Grace deadline for a failed renewal. Anchored to the original due/failure
 * time so provider retries can never push the deadline forward.
 */
export function computeGraceUntil(
  firstFailureAt: number,
  gracePeriodDays: number,
) {
  return firstFailureAt + Math.max(0, Math.floor(gracePeriodDays)) * DAY_MS;
}

/**
 * When access ends after a voluntary cancellation: the end of the coverage the
 * member already paid for, plus the gym's grace period.
 */
export function computeCancellationAccessEndsAt(
  currentPeriodEndAt: number,
  gracePeriodDays: number,
) {
  return currentPeriodEndAt + Math.max(0, Math.floor(gracePeriodDays)) * DAY_MS;
}

/**
 * MAT's commission on a gross member payment, in whole ARS.
 * 1 basis point = 0.01%. Rounds half away from zero on .5 so the fee never
 * silently rounds to zero on small amounts.
 */
export function computeCommissionArs(
  grossArs: number,
  platformFeeBps: number,
): number {
  if (!Number.isFinite(grossArs) || !Number.isFinite(platformFeeBps)) return 0;
  if (grossArs <= 0 || platformFeeBps <= 0) return 0;
  return Math.round((grossArs * platformFeeBps) / 10_000);
}

/** Gym net for an approved payment once provider and MAT fees are known. */
export function computeGymNetArs(params: {
  grossArs: number;
  providerFeeArs?: number;
  platformFeeArs?: number;
}) {
  return Math.max(
    0,
    params.grossArs - (params.providerFeeArs ?? 0) - (params.platformFeeArs ?? 0),
  );
}

/**
 * Split one advance payment across the cycles it covers.
 *
 * The parts are whole pesos and sum to exactly `totalArs`; the remainder lands
 * on the first cycle. Dividing and rounding each cycle independently would
 * leave the covered months adding up to a different figure than the member
 * actually paid.
 */
export function splitAmountAcrossCycles(
  totalArs: number,
  cycleCount: number,
): number[] {
  if (cycleCount <= 0) return [];
  const base = Math.floor(totalArs / cycleCount);
  const remainder = totalArs - base * cycleCount;
  return Array.from({ length: cycleCount }, (_, index) =>
    index === 0 ? base + remainder : base,
  );
}
