// Shared TypeScript types and interfaces
// Example: export type User = { id: string; name: string }

export type InterestTierType = "percentage" | "fixed";

export type InterestTier = {
  daysAfterWindowEnd: number; // how many days after paymentWindowEndDay this tier activates (min 1)
  type: InterestTierType;
  value: number; // percentage (e.g. 3 for 3%) or fixed ARS amount (e.g. 5000)
};

export type AppliedInterestTier = InterestTier & {
  amountArs: number; // calculated charge in ARS for this tier
};

export type InterestResult = {
  applied: AppliedInterestTier[];
  totalArs: number;
  totalAmount: number; // base + totalArs
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getZonedDateParts(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [monthStr, dayStr, yearStr] = formatter
    .format(new Date(timestamp))
    .replace(/[^\d/]/g, "")
    .split("/");

  return {
    year: parseInt(yearStr!, 10),
    month: parseInt(monthStr!, 10),
    day: parseInt(dayStr!, 10),
  };
}

function getDaysAfterPaymentWindow(
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number,
  timeZone: string,
) {
  const [yearStr, monthStr] = billingPeriod.split("-");
  const billingYear = parseInt(yearStr!, 10);
  const billingMonth = parseInt(monthStr!, 10);
  const nowParts = getZonedDateParts(nowMs, timeZone);

  const windowEndDateMs = Date.UTC(
    billingYear,
    billingMonth - 1,
    paymentWindowEndDay,
  );
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

/**
 * Calculate cumulative interest for a payment.
 * All tiers whose daysAfterWindowEnd <= daysElapsed are applied and stacked.
 *
 * @param baseAmount   Plan price in ARS
 * @param tiers        Tiers configured on the plan (any order)
 * @param billingPeriod  "YYYY-MM"
 * @param paymentWindowEndDay  Day of month the payment window closes (1-28)
 * @param nowMs        Current timestamp in ms (defaults to Date.now())
 * @param timeZone     IANA timezone used to compare local calendar days
 */
export function calculateInterest(
  baseAmount: number,
  tiers: InterestTier[],
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number = Date.now(),
  timeZone: string = "America/Argentina/Buenos_Aires",
): InterestResult {
  const daysElapsed = getDaysAfterPaymentWindow(
    billingPeriod,
    paymentWindowEndDay,
    nowMs,
    timeZone,
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

/**
 * Member type used for organization membership tables
 */
export type Member = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  imageUrl?: string;
  username?: string;
  role: string;
  status: string;
  createdAt: Date | string | number;
  birthDate?: Date | string | number;
  joinedAt?: Date | string | number;
};

/**
 * Type for membership data returned from Convex query
 */
export type MembershipData = {
  userId: string;
  role: string;
  status: string;
  createdAt: number;
  joinedAt: number;
  // User fields from users table
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  imageUrl?: string;
  username?: string;
  birthDate?: number | string | Date;
};

/**
 * Class types for class reservation system
 */
export type RecurrencePattern = {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: number[]; // 0-6
  endDate?: number;
};

export type Class = {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  capacity: number;
  trainerId?: string;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  bookingWindowDays: number;
  cancellationWindowHours: number;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ClassSchedule = {
  _id: string;
  classId: string;
  organizationId: string;
  startTime: number;
  endTime: number;
  capacity: number;
  currentReservations: number;
  status: "scheduled" | "cancelled" | "completed";
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type ClassReservation = {
  _id: string;
  scheduleId: string;
  classId: string;
  organizationId: string;
  userId: string;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  cancelledAt?: number;
  checkedInAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Advance payment discount tier configured on a membership plan.
 */
export type AdvancePaymentDiscount = {
  months: number; // e.g. 3, 6, 12
  discountPercentage: number; // 0-100
};

/**
 * Payment and subscription types
 */
export type SubscriptionStatus = "active" | "suspended" | "cancelled";
export type PaymentStatus = "pending" | "in_review" | "approved" | "declined";
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "proof_upload"
  | "bonification";

/**
 * Finance ledger types
 */
export type FinanceTransactionType = "income" | "expense";
export type FinanceTransactionStatus = "active" | "voided";
export type FinanceTransactionSource = "manual" | "recurring";
export type FinancePaymentMethod = "cash" | "bank_transfer" | "card" | "other";
export type FinanceRecurringRuleStatus = "active" | "paused" | "cancelled";

/**
 * Bonification types
 */
export type BonificationDiscountType = "percentage" | "fixed" | "full";
export type BonificationReason =
  | "friend_and_family"
  | "trainer"
  | "employee"
  | "sponsor"
  | "other";
export type BonificationStatus = "active" | "revoked";
