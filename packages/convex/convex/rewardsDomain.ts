import type { Doc } from "./_generated/dataModel";

export const REWARD_ACCESS_CODES = {
  allowed: "ACCESS_ALLOWED",
  inactiveMembership: "MEMBERSHIP_INACTIVE",
  subscriptionRequired: "SUBSCRIPTION_REQUIRED",
  subscriptionSuspended: "SUBSCRIPTION_SUSPENDED",
  subscriptionPending: "SUBSCRIPTION_PENDING_PAYMENT",
  programDisabled: "REWARDS_DISABLED",
  qrExpired: "QR_EXPIRED",
  qrRevoked: "QR_REVOKED",
  qrInvalid: "QR_INVALID",
  qrReplay: "QR_REPLAYED",
  wrongOrganization: "WRONG_ORGANIZATION",
  duplicate: "DUPLICATE_CHECK_IN",
} as const;

export type RewardAccessCode =
  (typeof REWARD_ACCESS_CODES)[keyof typeof REWARD_ACCESS_CODES];

export const DEFAULT_REWARD_TIMEZONE = "America/Argentina/Buenos_Aires";

export function normalizeRewardTimezone(timezone?: string): string {
  const candidate = timezone || DEFAULT_REWARD_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_REWARD_TIMEZONE;
  }
}

export function getLocalDate(timestamp: number, timezone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeRewardTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function getIsoWeekKey(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousLocalDate(localDate: string, days = 1): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function isRewardSourceEligible(
  settings: Doc<"organizationSettings">["rewards"] | undefined,
  source: "qr_check_in" | "class_attendance" | "manual",
): boolean {
  if (!settings?.enabled) return false;
  return settings.eligibleSources.includes(source);
}

export function rewardCapabilityEnabled(
  settings: Doc<"organizationSettings"> | null,
): boolean {
  // Future ULTRA integration point: add the billing entitlement check here,
  // leaving every caller and all reward data unchanged.
  return settings?.rewards?.enabled === true;
}
