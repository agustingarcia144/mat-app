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

/**
 * The billing module that unlocks the points programme: earning, the catalog,
 * and redemptions.
 */
export const REWARDS_MODULE = "rewards";

/**
 * The billing module that unlocks getting through the door: the reception QR
 * scanner and the wallet pass that carries the member's code. The two are one
 * feature -- the pass is how a member obtains the code that gets scanned -- so
 * a single module gates both.
 *
 * Separate from REWARDS_MODULE because check-in is useful on its own: a gym can
 * run QR entry with no points programme at all, in which case a scan is
 * recorded and awards nothing.
 */
export const CHECK_IN_MODULE = "check_in";

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
  source: "qr_check_in" | "class_attendance" | "manual" | "membership_payment",
): boolean {
  if (!settings?.enabled) return false;
  return settings.eligibleSources.includes(source);
}

/**
 * Whether the rewards programme is live for an organization.
 *
 * Takes the entitlement as an argument so this module stays free of database
 * access; callers resolve it with `organizationHasModule(ctx, orgId,
 * REWARDS_MODULE)`. Losing the entitlement hides the programme but never
 * touches the stored settings, so an organization that gets it back resumes
 * with its configuration intact.
 *
 * Says nothing about QR check-in, which has its own module: see
 * `checkInCapabilityEnabled`.
 */
export function rewardCapabilityEnabled(
  settings: Doc<"organizationSettings"> | null,
  hasRewardsEntitlement: boolean,
): boolean {
  return hasRewardsEntitlement && settings?.rewards?.enabled === true;
}

/**
 * Whether QR check-in and the wallet pass are live for an organization.
 *
 * Mirrors `rewardCapabilityEnabled` but reads the wallet-card switch, which is
 * the settings flag a gym uses to turn member credentials on. Callers resolve
 * the entitlement with `organizationHasModule(ctx, orgId, CHECK_IN_MODULE)`.
 */
export function checkInCapabilityEnabled(
  settings: Doc<"organizationSettings"> | null,
  hasCheckInEntitlement: boolean,
): boolean {
  return (
    hasCheckInEntitlement && settings?.rewards?.walletCard?.enabled === true
  );
}
