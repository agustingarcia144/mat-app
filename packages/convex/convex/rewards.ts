import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  organizationHasActivePlans,
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import {
  getRewardSettings,
  resolveRewardSettings,
  type RewardSettings,
} from "./organizationSettings";
import {
  getIsoWeekKey,
  getLocalDate,
  isRewardSourceEligible,
  normalizeRewardTimezone,
  previousLocalDate,
  REWARD_ACCESS_CODES,
  rewardCapabilityEnabled,
} from "./rewardsDomain";
import {
  getRewardsQrSecret,
  newCredentialId,
  parseAndVerifyRewardQr,
  signApplePassAuthenticationToken,
  signMobileQr,
} from "./rewardsQr";
import { randomHex } from "./memberPaymentsCrypto";
import { safeEqual } from "./memberPaymentsCrypto";

const MINUTE_MS = 60_000;
const MOBILE_QR_TTL_MS = 60_000;
const ACCESS_DECISION_TTL_MS = 10_000;

type AttendanceRewardSource = "qr_check_in" | "class_attendance" | "manual";

async function getSettingsDocument(
  ctx: { db: QueryCtx["db"] },
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
}

async function requireRewardsEnabled(
  ctx: { db: MutationCtx["db"] },
  organizationId: Id<"organizations">,
): Promise<RewardSettings> {
  const settingsDocument = await getSettingsDocument(ctx, organizationId);
  if (!rewardCapabilityEnabled(settingsDocument)) {
    throw new Error("REWARDS_DISABLED");
  }
  return resolveRewardSettings(settingsDocument?.rewards);
}

async function getOrCreateAccount(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
) {
  const existing = await ctx.db
    .query("rewardAccounts")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .first();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("rewardAccounts", {
    organizationId,
    userId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const account = await ctx.db.get(id);
  if (!account) throw new Error("No se pudo crear la cuenta de recompensas");
  return account;
}

async function enqueueWalletUpdates(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
  reason: string,
) {
  const passes = await ctx.db
    .query("walletPasses")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .collect();
  const now = Date.now();
  for (const pass of passes.filter((item) => item.status === "active")) {
    const bucket = Math.floor(now / MINUTE_MS);
    const idempotencyKey = `wallet:${pass.provider}:${pass._id}:${reason}:${bucket}`;
    const existing = await ctx.db
      .query("walletSyncOperations")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("walletSyncOperations", {
        organizationId,
        userId,
        provider: pass.provider,
        operationType: "update",
        idempotencyKey,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function writeLedgerEntry(
  ctx: MutationCtx,
  params: {
    account: Doc<"rewardAccounts">;
    points: number;
    type: Doc<"rewardLedger">["type"];
    reason: string;
    idempotencyKey: string;
    sourceType?: string;
    sourceId?: string;
    actorUserId?: string;
    localDate?: string;
    ruleSnapshot?: Doc<"rewardLedger">["ruleSnapshot"];
    metadata?: unknown;
  },
) {
  const duplicate = await ctx.db
    .query("rewardLedger")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", params.idempotencyKey),
    )
    .first();
  if (duplicate) return duplicate;
  const nextBalance = params.account.balance + params.points;
  if (nextBalance < 0 && params.type === "redemption") {
    throw new Error("INSUFFICIENT_REWARD_BALANCE");
  }
  const now = Date.now();
  const entryId = await ctx.db.insert("rewardLedger", {
    organizationId: params.account.organizationId,
    accountId: params.account._id,
    userId: params.account.userId,
    points: params.points,
    balanceAfter: nextBalance,
    type: params.type,
    reason: params.reason,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    idempotencyKey: params.idempotencyKey,
    localDate: params.localDate ?? params.ruleSnapshot?.localDate,
    actorUserId: params.actorUserId,
    ruleSnapshot: params.ruleSnapshot,
    metadata: params.metadata,
    createdAt: now,
  });
  await ctx.db.patch(params.account._id, {
    balance: nextBalance,
    lifetimeEarned:
      params.account.lifetimeEarned +
      (params.type === "earn" && params.points > 0 ? params.points : 0),
    lifetimeRedeemed:
      params.account.lifetimeRedeemed +
      (params.type === "redemption" ? Math.abs(params.points) : 0),
    updatedAt: now,
  });
  await enqueueWalletUpdates(
    ctx,
    params.account.organizationId,
    params.account.userId,
    "balance",
  );
  const entry = await ctx.db.get(entryId);
  if (!entry) throw new Error("No se pudo guardar el movimiento");
  return entry;
}

async function getAttendanceEarnEntries(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">,
  userId: string,
  localDate?: string,
) {
  const entries = localDate
    ? await ctx.db
        .query("rewardLedger")
        .withIndex("by_organization_user_local_date", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("userId", userId)
            .eq("localDate", localDate),
        )
        .collect()
    : await ctx.db
        .query("rewardLedger")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", organizationId).eq("userId", userId),
        )
        .collect();
  const reversedSourceIds = new Set(
    entries
      .filter(
        (entry) =>
          entry.type === "reversal" && entry.sourceType === "check_in_void",
      )
      .map(
        (entry) =>
          (
            entry.metadata as
              | { reversedAttendanceSourceId?: string }
              | undefined
          )?.reversedAttendanceSourceId,
      )
      .filter((value): value is string => Boolean(value)),
  );
  return entries.filter(
    (entry) =>
      entry.type === "earn" &&
      entry.sourceType === "attendance" &&
      (!entry.sourceId || !reversedSourceIds.has(entry.sourceId)),
  );
}

async function awardConfiguredBonuses(
  ctx: MutationCtx,
  params: {
    account: Doc<"rewardAccounts">;
    settings: RewardSettings;
    localDate: string;
    actorUserId?: string;
  },
) {
  let pointsAwarded = 0;
  const entries = await getAttendanceEarnEntries(
    ctx,
    params.account.organizationId,
    params.account.userId,
  );
  const distinctDates = new Set(
    entries.map((entry) => entry.ruleSnapshot?.localDate).filter(Boolean),
  );
  const allLedgerEntries = await ctx.db
    .query("rewardLedger")
    .withIndex("by_organization_user", (q) =>
      q
        .eq("organizationId", params.account.organizationId)
        .eq("userId", params.account.userId),
    )
    .collect();
  const reversedBonusIds = new Set(
    allLedgerEntries
      .filter(
        (entry) =>
          entry.type === "reversal" &&
          entry.sourceType === "attendance_bonus_void",
      )
      .map(
        (entry) =>
          (entry.metadata as { reversedBonusEntryId?: string } | undefined)
            ?.reversedBonusEntryId ?? entry.sourceId,
      )
      .filter((value): value is string => Boolean(value)),
  );
  const activeBonusEntries = allLedgerEntries.filter(
    (entry) =>
      entry.type === "earn" &&
      (entry.sourceType === "streak_bonus" ||
        entry.sourceType === "weekly_bonus") &&
      !reversedBonusIds.has(String(entry._id)),
  );

  if (
    params.settings.streaksEnabled &&
    params.settings.streakIntervalDays &&
    params.settings.streakBonusPoints
  ) {
    let consecutiveDays = 0;
    while (
      distinctDates.has(previousLocalDate(params.localDate, consecutiveDays))
    ) {
      consecutiveDays += 1;
    }
    if (
      consecutiveDays >= params.settings.streakIntervalDays &&
      consecutiveDays % params.settings.streakIntervalDays === 0 &&
      !activeBonusEntries.some(
        (entry) =>
          entry.sourceType === "streak_bonus" &&
          entry.sourceId === params.localDate,
      )
    ) {
      const generation =
        allLedgerEntries.filter(
          (entry) =>
            entry.type === "earn" &&
            entry.sourceType === "streak_bonus" &&
            entry.sourceId === params.localDate,
        ).length + 1;
      const current = (await ctx.db.get(params.account._id)) ?? params.account;
      const bonusEntry = await writeLedgerEntry(ctx, {
        account: current,
        points: params.settings.streakBonusPoints,
        type: "earn",
        reason: "Bono por racha de asistencia",
        sourceType: "streak_bonus",
        sourceId: params.localDate,
        idempotencyKey: `reward:streak:${params.account.organizationId}:${params.account.userId}:${params.localDate}:${generation}`,
        actorUserId: params.actorUserId,
        metadata: {
          streakDays: consecutiveDays,
          intervalDays: params.settings.streakIntervalDays,
        },
      });
      pointsAwarded += bonusEntry.points;
    }
  }

  if (
    params.settings.weeklyBonusEnabled &&
    params.settings.weeklyAttendanceTarget &&
    params.settings.weeklyBonusPoints
  ) {
    const weekKey = getIsoWeekKey(params.localDate);
    const weeklyDates = new Set(
      [...distinctDates].filter(
        (date): date is string =>
          Boolean(date) && getIsoWeekKey(date!) === weekKey,
      ),
    );
    if (
      weeklyDates.size >= params.settings.weeklyAttendanceTarget &&
      !activeBonusEntries.some(
        (entry) =>
          entry.sourceType === "weekly_bonus" && entry.sourceId === weekKey,
      )
    ) {
      const generation =
        allLedgerEntries.filter(
          (entry) =>
            entry.type === "earn" &&
            entry.sourceType === "weekly_bonus" &&
            entry.sourceId === weekKey,
        ).length + 1;
      const current = (await ctx.db.get(params.account._id)) ?? params.account;
      const bonusEntry = await writeLedgerEntry(ctx, {
        account: current,
        points: params.settings.weeklyBonusPoints,
        type: "earn",
        reason: "Bono por objetivo semanal",
        sourceType: "weekly_bonus",
        sourceId: weekKey,
        idempotencyKey: `reward:weekly:${params.account.organizationId}:${params.account.userId}:${weekKey}:${generation}`,
        actorUserId: params.actorUserId,
        metadata: { attendanceTarget: params.settings.weeklyAttendanceTarget },
      });
      pointsAwarded += bonusEntry.points;
    }
  }
  return pointsAwarded;
}

/** Shared by QR entrances and class-reservation attendance mutations. */
export async function awardAttendanceReward(
  ctx: MutationCtx,
  params: {
    organizationId: Id<"organizations">;
    userId: string;
    source: AttendanceRewardSource;
    sourceId: string;
    occurredAt: number;
    actorUserId?: string;
  },
): Promise<{
  pointsAwarded: number;
  attendancePointsAwarded: number;
  bonusPointsAwarded: number;
  balance: number;
  alreadyAwarded: boolean;
}> {
  const settingsDocument = await getSettingsDocument(
    ctx,
    params.organizationId,
  );
  const settings = resolveRewardSettings(settingsDocument?.rewards);
  if (
    !rewardCapabilityEnabled(settingsDocument) ||
    !isRewardSourceEligible(settingsDocument?.rewards, params.source)
  ) {
    const account = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("userId", params.userId),
      )
      .first();
    return {
      pointsAwarded: 0,
      attendancePointsAwarded: 0,
      bonusPointsAwarded: 0,
      balance: account?.balance ?? 0,
      alreadyAwarded: true,
    };
  }
  const organization = await ctx.db.get(params.organizationId);
  const timezone = normalizeRewardTimezone(organization?.timezone);
  const localDate = getLocalDate(params.occurredAt, timezone);
  let account = await getOrCreateAccount(
    ctx,
    params.organizationId,
    params.userId,
  );
  if (account.status !== "active") {
    return {
      pointsAwarded: 0,
      attendancePointsAwarded: 0,
      bonusPointsAwarded: 0,
      balance: account.balance,
      alreadyAwarded: true,
    };
  }
  const todayEntries = (
    await getAttendanceEarnEntries(
      ctx,
      params.organizationId,
      params.userId,
      localDate,
    )
  ).filter((entry) => entry.ruleSnapshot?.localDate === localDate);
  if (todayEntries.length >= settings.maxRewardedAttendancesPerDay) {
    return {
      pointsAwarded: 0,
      attendancePointsAwarded: 0,
      bonusPointsAwarded: 0,
      balance: account.balance,
      alreadyAwarded: true,
    };
  }
  const entry = await writeLedgerEntry(ctx, {
    account,
    points: settings.pointsPerAttendance,
    type: "earn",
    reason: "Asistencia al gimnasio",
    sourceType: "attendance",
    sourceId: params.sourceId,
    idempotencyKey: `reward:attendance:${params.organizationId}:${params.userId}:${params.source}:${params.sourceId}`,
    actorUserId: params.actorUserId,
    ruleSnapshot: {
      pointsPerAttendance: settings.pointsPerAttendance,
      maxRewardedAttendancesPerDay: settings.maxRewardedAttendancesPerDay,
      localDate,
      timezone,
      eligibleSource: params.source,
    },
  });
  account = (await ctx.db.get(account._id)) ?? account;
  const bonusPointsAwarded = await awardConfiguredBonuses(ctx, {
    account,
    settings,
    localDate,
    actorUserId: params.actorUserId,
  });
  const current = await ctx.db.get(account._id);
  return {
    pointsAwarded: entry.points + bonusPointsAwarded,
    attendancePointsAwarded: entry.points,
    bonusPointsAwarded,
    balance: current?.balance ?? entry.balanceAfter,
    alreadyAwarded: false,
  };
}

async function getMemberAccessDecision(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
) {
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .first();
  if (!membership || membership.status !== "active") {
    return {
      allowed: false as const,
      code: REWARD_ACCESS_CODES.inactiveMembership,
    };
  }
  if (membership.role !== "member") {
    return {
      allowed: true as const,
      code: REWARD_ACCESS_CODES.allowed,
      membership,
    };
  }
  if (!(await organizationHasActivePlans(ctx, organizationId))) {
    return {
      allowed: true as const,
      code: REWARD_ACCESS_CODES.allowed,
      membership,
    };
  }
  const subscriptions = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .collect();
  const active = subscriptions.find((item) => item.status === "active");
  if (active) {
    return {
      allowed: true as const,
      code: REWARD_ACCESS_CODES.allowed,
      membership,
    };
  }
  const scheduledCancellation = subscriptions.find(
    (item) =>
      item.status === "cancelled" &&
      item.accessEndsAt !== undefined &&
      item.accessEndsAt > Date.now(),
  );
  if (scheduledCancellation) {
    return {
      allowed: true as const,
      code: REWARD_ACCESS_CODES.allowed,
      membership,
    };
  }
  const current = subscriptions.find((item) => item.status !== "cancelled");
  if (current?.status === "suspended") {
    return {
      allowed: false as const,
      code: REWARD_ACCESS_CODES.subscriptionSuspended,
    };
  }
  if (current?.status === "pending_payment") {
    return {
      allowed: false as const,
      code: REWARD_ACCESS_CODES.subscriptionPending,
    };
  }
  return {
    allowed: false as const,
    code: REWARD_ACCESS_CODES.subscriptionRequired,
  };
}

async function linkEligibleReservation(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: string,
  now: number,
) {
  const candidates = await ctx.db
    .query("classReservations")
    .withIndex("by_organization_user_start_time", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("userId", userId)
        .gte("scheduleStartTime", now - 8 * 60 * MINUTE_MS)
        .lte("scheduleStartTime", now + 2 * 60 * MINUTE_MS),
    )
    .collect();
  const eligible: Doc<"classReservations">[] = [];
  for (const reservation of candidates.filter(
    (item) => item.status === "confirmed",
  )) {
    const schedule = await ctx.db.get(reservation.scheduleId);
    if (
      schedule &&
      now >= schedule.startTime - 20 * MINUTE_MS &&
      now <= schedule.endTime + 6 * 60 * MINUTE_MS
    ) {
      eligible.push(reservation);
    }
  }
  if (eligible.length !== 1)
    return { reservationId: undefined, choices: eligible };
  const reservation = eligible[0];
  await ctx.db.patch(reservation._id, {
    status: "attended",
    checkedInAt: now,
    updatedAt: now,
  });
  return {
    reservationId: reservation._id,
    choices: [] as Doc<"classReservations">[],
  };
}

export const getMyRewards = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;
    const settingsDocument = await getSettingsDocument(
      ctx,
      orgCtx.organizationId,
    );
    const organization = await ctx.db.get(orgCtx.organizationId);
    const account = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", orgCtx.organizationId)
          .eq("userId", orgCtx.identity.subject),
      )
      .first();
    const ledger = account
      ? await ctx.db
          .query("rewardLedger")
          .withIndex("by_account", (q) => q.eq("accountId", account._id))
          .order("desc")
          .take(50)
      : [];
    const attendanceEntries = account
      ? await getAttendanceEarnEntries(
          ctx,
          orgCtx.organizationId,
          orgCtx.identity.subject,
        )
      : [];
    const attendanceDates = new Set(
      attendanceEntries
        .map((entry) => entry.ruleSnapshot?.localDate)
        .filter((value): value is string => Boolean(value)),
    );
    const timezone = normalizeRewardTimezone(organization?.timezone);
    const today = getLocalDate(Date.now(), timezone);
    let streakCursor = attendanceDates.has(today)
      ? today
      : previousLocalDate(today);
    let currentStreakDays = 0;
    while (attendanceDates.has(streakCursor)) {
      currentStreakDays += 1;
      streakCursor = previousLocalDate(streakCursor);
    }
    const settings = resolveRewardSettings(settingsDocument?.rewards);
    const weeklyAttendances = [...attendanceDates].filter(
      (date) => getIsoWeekKey(date) === getIsoWeekKey(today),
    ).length;
    const access = await getMemberAccessDecision(
      ctx,
      orgCtx.organizationId,
      orgCtx.identity.subject,
    );
    const rewards = await ctx.db
      .query("rewardDefinitions")
      .withIndex("by_organization_enabled", (q) =>
        q.eq("organizationId", orgCtx.organizationId).eq("enabled", true),
      )
      .collect();
    const redemptions = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", orgCtx.organizationId)
          .eq("userId", orgCtx.identity.subject),
      )
      .order("desc")
      .take(25);
    return {
      enabled: rewardCapabilityEnabled(settingsDocument),
      configured: Boolean(settingsDocument?.rewards),
      settings,
      access: { allowed: access.allowed, code: access.code },
      progress: {
        currentStreakDays,
        weeklyAttendances,
        weeklyTarget: settings.weeklyBonusEnabled
          ? settings.weeklyAttendanceTarget
          : undefined,
        streakTarget: settings.streaksEnabled
          ? settings.streakIntervalDays
          : undefined,
        nextStreakBonusIn:
          settings.streaksEnabled && settings.streakIntervalDays
            ? currentStreakDays === 0
              ? settings.streakIntervalDays
              : currentStreakDays % settings.streakIntervalDays === 0
                ? 0
                : settings.streakIntervalDays -
                  (currentStreakDays % settings.streakIntervalDays)
            : undefined,
      },
      organization: organization
        ? {
            _id: organization._id,
            name: organization.name,
            logoUrl: organization.logoUrl,
          }
        : null,
      account: account ?? {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        status: "active" as const,
      },
      ledger,
      rewards,
      redemptions,
      wallet: {
        qrConfigured: Boolean(getRewardsQrSecret()),
        appleConfigured: Boolean(
          process.env.APPLE_WALLET_PASS_TYPE_ID &&
          process.env.APPLE_WALLET_TEAM_ID &&
          process.env.APPLE_WALLET_WEB_SERVICE_URL &&
          process.env.APPLE_WALLET_WWDR_CERT &&
          process.env.APPLE_WALLET_SIGNER_CERT &&
          process.env.APPLE_WALLET_SIGNER_KEY,
        ),
        googleConfigured: Boolean(
          process.env.GOOGLE_WALLET_ISSUER_ID &&
          process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
          process.env.GOOGLE_WALLET_PRIVATE_KEY,
        ),
      },
    };
  },
});

export const issueMyMobileQr = mutation({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "member") throw new Error("MEMBER_REQUIRED");
    await requireRewardsEnabled(ctx, membership.organizationId);
    if (!getRewardsQrSecret())
      throw new Error("REWARDS_QR_CONFIGURATION_REQUIRED");
    let credential = await ctx.db
      .query("memberQrCredentials")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", membership.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!credential) {
      const now = Date.now();
      const id = await ctx.db.insert("memberQrCredentials", {
        organizationId: membership.organizationId,
        userId: membership.userId,
        credentialId: newCredentialId(),
        version: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      credential = await ctx.db.get(id);
    }
    if (!credential) throw new Error("QR_CREDENTIAL_CREATION_FAILED");
    const expiresAt = Date.now() + MOBILE_QR_TTL_MS;
    const signed = await signMobileQr(credential.credentialId, expiresAt);
    return { payload: signed.payload, expiresAt };
  },
});

export const prepareMyWalletPass = internalMutation({
  args: { provider: v.union(v.literal("apple"), v.literal("google")) },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "member") throw new Error("MEMBER_REQUIRED");
    const settings = await requireRewardsEnabled(
      ctx,
      membership.organizationId,
    );
    if (!getRewardsQrSecret())
      throw new Error("REWARDS_QR_CONFIGURATION_REQUIRED");
    let credential = await ctx.db
      .query("memberQrCredentials")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", membership.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    const now = Date.now();
    if (!credential) {
      const credentialRowId = await ctx.db.insert("memberQrCredentials", {
        organizationId: membership.organizationId,
        userId: membership.userId,
        credentialId: newCredentialId(),
        version: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      credential = await ctx.db.get(credentialRowId);
    }
    if (!credential) throw new Error("QR_CREDENTIAL_CREATION_FAILED");
    const account = await getOrCreateAccount(
      ctx,
      membership.organizationId,
      membership.userId,
    );
    const organization = await ctx.db.get(membership.organizationId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", membership.userId))
      .first();
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
    const existing = await ctx.db
      .query("walletPasses")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", membership.userId),
      )
      .filter((q) => q.eq(q.field("provider"), args.provider))
      .first();
    const providerObjectId =
      existing?.providerObjectId ??
      `mat.${newCredentialId().replace(/[^A-Za-z0-9_.-]/g, "_")}`;
    if (existing) {
      await ctx.db.patch(existing._id, {
        credentialId: credential.credentialId,
        status: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("walletPasses", {
        organizationId: membership.organizationId,
        userId: membership.userId,
        credentialId: credential.credentialId,
        provider: args.provider,
        providerObjectId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    const access = await getMemberAccessDecision(
      ctx,
      membership.organizationId,
      membership.userId,
    );
    return {
      organizationId: membership.organizationId,
      organizationName: organization.name,
      organizationLogoUrl: organization.logoUrl,
      userId: membership.userId,
      memberName:
        user?.fullName ??
        (`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
          "Socio MAT"),
      memberImageUrl: user?.imageUrl,
      balance: account.balance,
      membershipStatus: access.allowed
        ? "Activa"
        : access.code === REWARD_ACCESS_CODES.subscriptionSuspended
          ? "Suspendida"
          : "Sin acceso",
      pointsName: settings.pointsName,
      credentialId: credential.credentialId,
      providerObjectId,
    };
  },
});

export const getWalletPassDataInternal = internalQuery({
  args: {
    provider: v.union(v.literal("apple"), v.literal("google")),
    providerObjectId: v.string(),
  },
  handler: async (ctx, args) => {
    const walletPass = await ctx.db
      .query("walletPasses")
      .withIndex("by_provider_object", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerObjectId", args.providerObjectId),
      )
      .first();
    if (!walletPass || walletPass.status !== "active") return null;
    const [organization, user, account, credential, settingsDocument] =
      await Promise.all([
        ctx.db.get(walletPass.organizationId),
        ctx.db
          .query("users")
          .withIndex("by_externalId", (q) =>
            q.eq("externalId", walletPass.userId),
          )
          .first(),
        ctx.db
          .query("rewardAccounts")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", walletPass.organizationId)
              .eq("userId", walletPass.userId),
          )
          .first(),
        ctx.db
          .query("memberQrCredentials")
          .withIndex("by_credential_id", (q) =>
            q.eq("credentialId", walletPass.credentialId),
          )
          .first(),
        getSettingsDocument(ctx, walletPass.organizationId),
      ]);
    if (!organization || !credential || credential.status !== "active")
      return null;
    const access = await getMemberAccessDecision(
      ctx,
      walletPass.organizationId,
      walletPass.userId,
    );
    return {
      walletPass,
      organizationName: organization.name,
      organizationLogoUrl: organization.logoUrl,
      memberName:
        user?.fullName ??
        (`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
          "Socio MAT"),
      balance: account?.balance ?? 0,
      pointsName: resolveRewardSettings(settingsDocument?.rewards).pointsName,
      membershipStatus: access.allowed
        ? "Activa"
        : access.code === REWARD_ACCESS_CODES.subscriptionSuspended
          ? "Suspendida"
          : "Sin acceso",
      credentialId: credential.credentialId,
    };
  },
});

export const getWalletPassForMemberInternal = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    provider: v.union(v.literal("apple"), v.literal("google")),
  },
  handler: async (ctx, args) => {
    const walletPass = await ctx.db
      .query("walletPasses")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("provider"), args.provider))
      .first();
    if (!walletPass || walletPass.status !== "active") return null;
    const [organization, user, account, credential, settingsDocument] =
      await Promise.all([
        ctx.db.get(args.organizationId),
        ctx.db
          .query("users")
          .withIndex("by_externalId", (q) => q.eq("externalId", args.userId))
          .first(),
        ctx.db
          .query("rewardAccounts")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("userId", args.userId),
          )
          .first(),
        ctx.db
          .query("memberQrCredentials")
          .withIndex("by_credential_id", (q) =>
            q.eq("credentialId", walletPass.credentialId),
          )
          .first(),
        getSettingsDocument(ctx, args.organizationId),
      ]);
    if (!organization || !credential || credential.status !== "active")
      return null;
    const access = await getMemberAccessDecision(
      ctx,
      args.organizationId,
      args.userId,
    );
    return {
      walletPass,
      organizationName: organization.name,
      memberName:
        user?.fullName ??
        (`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
          "Socio MAT"),
      balance: account?.balance ?? 0,
      pointsName: resolveRewardSettings(settingsDocument?.rewards).pointsName,
      membershipStatus: access.allowed
        ? "Activa"
        : access.code === REWARD_ACCESS_CODES.subscriptionSuspended
          ? "Suspendida"
          : "Sin acceso",
      credentialId: credential.credentialId,
    };
  },
});

export const validateApplePassAuthentication = internalQuery({
  args: { serialNumber: v.string(), authenticationToken: v.string() },
  handler: async (ctx, args) => {
    const pass = await ctx.db
      .query("walletPasses")
      .withIndex("by_provider_object", (q) =>
        q.eq("provider", "apple").eq("providerObjectId", args.serialNumber),
      )
      .first();
    if (!pass || pass.status !== "active") return false;
    const expected = await signApplePassAuthenticationToken(args.serialNumber);
    return safeEqual(expected, args.authenticationToken);
  },
});

export const saveAppleRegistration = internalMutation({
  args: {
    deviceLibraryIdentifier: v.string(),
    passTypeIdentifier: v.string(),
    serialNumber: v.string(),
    pushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appleWalletRegistrations")
      .withIndex("by_device_pass", (q) =>
        q
          .eq("deviceLibraryIdentifier", args.deviceLibraryIdentifier)
          .eq("passTypeIdentifier", args.passTypeIdentifier)
          .eq("serialNumber", args.serialNumber),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        pushToken: args.pushToken,
        updatedAt: now,
      });
      return { created: false };
    }
    await ctx.db.insert("appleWalletRegistrations", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true };
  },
});

export const deleteAppleRegistration = internalMutation({
  args: {
    deviceLibraryIdentifier: v.string(),
    passTypeIdentifier: v.string(),
    serialNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appleWalletRegistrations")
      .withIndex("by_device_pass", (q) =>
        q
          .eq("deviceLibraryIdentifier", args.deviceLibraryIdentifier)
          .eq("passTypeIdentifier", args.passTypeIdentifier)
          .eq("serialNumber", args.serialNumber),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const deleteAppleRegistrationsByPushTokens = internalMutation({
  args: { pushTokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.pushTokens.length === 0) return { deleted: 0 };
    const targets = new Set(args.pushTokens);
    const registrations = await ctx.db
      .query("appleWalletRegistrations")
      .collect();
    let deleted = 0;
    for (const registration of registrations) {
      if (!targets.has(registration.pushToken)) continue;
      await ctx.db.delete(registration._id);
      deleted += 1;
    }
    return { deleted };
  },
});

export const listApplePassesForDevice = internalQuery({
  args: { deviceLibraryIdentifier: v.string(), passTypeIdentifier: v.string() },
  handler: async (ctx, args) => {
    const registrations = await ctx.db
      .query("appleWalletRegistrations")
      .filter((q) =>
        q.and(
          q.eq(
            q.field("deviceLibraryIdentifier"),
            args.deviceLibraryIdentifier,
          ),
          q.eq(q.field("passTypeIdentifier"), args.passTypeIdentifier),
        ),
      )
      .collect();
    return {
      serialNumbers: registrations.map((item) => item.serialNumber),
      lastUpdated: String(
        Math.max(0, ...registrations.map((item) => item.updatedAt)),
      ),
    };
  },
});

export const markWalletPassSynced = internalMutation({
  args: {
    provider: v.union(v.literal("apple"), v.literal("google")),
    providerObjectId: v.string(),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pass = await ctx.db
      .query("walletPasses")
      .withIndex("by_provider_object", (q) =>
        q
          .eq("provider", args.provider)
          .eq("providerObjectId", args.providerObjectId),
      )
      .first();
    if (!pass) return;
    await ctx.db.patch(pass._id, {
      lastSyncedAt: args.errorCode ? pass.lastSyncedAt : Date.now(),
      lastErrorCode: args.errorCode,
      updatedAt: Date.now(),
    });
  },
});

export const claimWalletSyncOperations = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("walletSyncOperations")
      .withIndex("by_status_next_attempt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(Math.max(1, Math.min(args.limit, 50)));
    const claimed = [];
    for (const operation of pending) {
      await ctx.db.patch(operation._id, {
        status: "running",
        attemptCount: operation.attemptCount + 1,
        updatedAt: now,
      });
      claimed.push({
        ...operation,
        status: "running" as const,
        attemptCount: operation.attemptCount + 1,
      });
    }
    return claimed;
  },
});

export const finishWalletSyncOperation = internalMutation({
  args: {
    id: v.id("walletSyncOperations"),
    succeeded: v.boolean(),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.id);
    if (!operation) return;
    const now = Date.now();
    if (args.succeeded) {
      await ctx.db.patch(operation._id, {
        status: "succeeded",
        lastErrorCode: undefined,
        updatedAt: now,
      });
      const pass = await ctx.db
        .query("walletPasses")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", operation.organizationId)
            .eq("userId", operation.userId),
        )
        .filter((q) => q.eq(q.field("provider"), operation.provider))
        .first();
      if (pass) {
        await ctx.db.patch(pass._id, {
          lastSyncedAt: now,
          lastErrorCode: undefined,
          updatedAt: now,
        });
      }
      return;
    }
    const terminal = operation.attemptCount >= 6;
    const backoffMs = Math.min(
      60 * MINUTE_MS,
      2 ** operation.attemptCount * MINUTE_MS,
    );
    await ctx.db.patch(operation._id, {
      status: terminal ? "failed" : "pending",
      nextAttemptAt: now + backoffMs,
      lastErrorCode: args.errorCode?.slice(0, 120) ?? "WALLET_SYNC_FAILED",
      updatedAt: now,
    });
  },
});

export const listAppleRegistrationsForSerial = internalQuery({
  args: { serialNumber: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("appleWalletRegistrations")
      .filter((q) => q.eq(q.field("serialNumber"), args.serialNumber))
      .collect(),
});

export const purgeExpiredQrTokens = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const expired = await ctx.db
      .query("consumedQrTokens")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(Math.max(1, Math.min(args.limit, 500)));
    for (const token of expired) await ctx.db.delete(token._id);
    return { deleted: expired.length };
  },
});

export const enqueueStaleWalletPassUpdates = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const passes = await ctx.db
      .query("walletPasses")
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(Math.max(1, Math.min(args.limit, 500)));
    const appleConfigured = Boolean(
      process.env.APPLE_WALLET_PASS_TYPE_ID &&
      process.env.APPLE_WALLET_SIGNER_CERT &&
      process.env.APPLE_WALLET_SIGNER_KEY,
    );
    const googleConfigured = Boolean(
      process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_WALLET_PRIVATE_KEY,
    );
    let enqueued = 0;
    for (const pass of passes) {
      if (
        (pass.provider === "apple" && !appleConfigured) ||
        (pass.provider === "google" && !googleConfigured)
      ) {
        continue;
      }
      const bucket = Math.floor(now / (60 * MINUTE_MS));
      const idempotencyKey = `wallet:scheduled:${pass._id}:${bucket}`;
      const existing = await ctx.db
        .query("walletSyncOperations")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", idempotencyKey),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("walletSyncOperations", {
        organizationId: pass.organizationId,
        userId: pass.userId,
        provider: pass.provider,
        operationType: "update",
        idempotencyKey,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      enqueued += 1;
    }
    return { enqueued };
  },
});

export const scanQr = mutation({
  args: { payload: v.string() },
  handler: async (ctx, args) => {
    const staff = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, staff.organizationId);
    const now = Date.now();
    const rateLimit = await ctx.db
      .query("rewardScanRateLimits")
      .withIndex("by_organization_actor", (q) =>
        q
          .eq("organizationId", staff.organizationId)
          .eq("actorUserId", staff.userId),
      )
      .first();
    if (rateLimit && now - rateLimit.windowStartedAt < MINUTE_MS) {
      if (rateLimit.attempts >= 120) throw new Error("SCAN_RATE_LIMITED");
      await ctx.db.patch(rateLimit._id, {
        attempts: rateLimit.attempts + 1,
        updatedAt: now,
      });
    } else if (rateLimit) {
      await ctx.db.patch(rateLimit._id, {
        windowStartedAt: now,
        attempts: 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("rewardScanRateLimits", {
        organizationId: staff.organizationId,
        actorUserId: staff.userId,
        windowStartedAt: now,
        attempts: 1,
        updatedAt: now,
      });
    }
    const parsed = await parseAndVerifyRewardQr(args.payload);
    if (!parsed) {
      return {
        allowed: false,
        actuateAccess: false,
        code: REWARD_ACCESS_CODES.qrInvalid,
        decisionId: randomHex(16),
        decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      };
    }
    const credential = await ctx.db
      .query("memberQrCredentials")
      .withIndex("by_credential_id", (q) =>
        q.eq("credentialId", parsed.credentialId),
      )
      .first();
    if (!credential || credential.status !== "active") {
      return {
        allowed: false,
        actuateAccess: false,
        code: REWARD_ACCESS_CODES.qrRevoked,
        decisionId: randomHex(16),
        decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      };
    }
    if (credential.organizationId !== staff.organizationId) {
      return {
        allowed: false,
        actuateAccess: false,
        code: REWARD_ACCESS_CODES.wrongOrganization,
        decisionId: randomHex(16),
        decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      };
    }
    const settings = await getRewardSettings(ctx, staff.organizationId);
    if (!settings.enabled) {
      return {
        allowed: false,
        actuateAccess: false,
        code: REWARD_ACCESS_CODES.programDisabled,
        decisionId: randomHex(16),
        decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      };
    }
    if (parsed.kind === "mobile") {
      if (parsed.expiresAt < now) {
        return {
          allowed: false,
          actuateAccess: false,
          code: REWARD_ACCESS_CODES.qrExpired,
          decisionId: randomHex(16),
          decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
        };
      }
      const consumed = await ctx.db
        .query("consumedQrTokens")
        .withIndex("by_token_id", (q) => q.eq("tokenId", parsed.tokenId))
        .first();
      if (consumed) {
        return {
          allowed: false,
          actuateAccess: false,
          code: REWARD_ACCESS_CODES.qrReplay,
          decisionId: randomHex(16),
          decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
        };
      }
    }
    const access = await getMemberAccessDecision(
      ctx,
      staff.organizationId,
      credential.userId,
    );
    const decisionId = randomHex(16);
    const organization = await ctx.db.get(staff.organizationId);
    const localDate = getLocalDate(now, organization?.timezone);
    if (!access.allowed) {
      await ctx.db.insert("memberCheckIns", {
        organizationId: staff.organizationId,
        userId: credential.userId,
        localDate,
        checkedInAt: now,
        source: parsed.kind === "mobile" ? "mobile_qr" : "wallet_qr",
        status: "denied",
        reasonCode: access.code,
        decisionId,
        actorUserId: staff.userId,
        pointsAwarded: 0,
        createdAt: now,
        updatedAt: now,
      });
      return {
        allowed: false,
        actuateAccess: false,
        code: access.code,
        decisionId,
        decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      };
    }
    const duplicateSince = now - settings.duplicateWindowMinutes * MINUTE_MS;
    const previous = await ctx.db
      .query("memberCheckIns")
      .withIndex("by_organization_user_time", (q) =>
        q
          .eq("organizationId", staff.organizationId)
          .eq("userId", credential.userId)
          .gte("checkedInAt", duplicateSince),
      )
      .filter((q) => q.eq(q.field("status"), "allowed"))
      .order("desc")
      .first();
    if (previous) {
      if (parsed.kind === "mobile") {
        await ctx.db.insert("consumedQrTokens", {
          tokenId: parsed.tokenId,
          organizationId: staff.organizationId,
          userId: credential.userId,
          consumedAt: now,
          expiresAt: parsed.expiresAt,
        });
      }
      await ctx.db.patch(credential._id, { lastUsedAt: now, updatedAt: now });
      const user = await ctx.db
        .query("users")
        .withIndex("by_externalId", (q) =>
          q.eq("externalId", credential.userId),
        )
        .first();
      const account = await ctx.db
        .query("rewardAccounts")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", staff.organizationId)
            .eq("userId", credential.userId),
        )
        .first();
      return {
        allowed: true,
        actuateAccess: false,
        duplicate: true,
        code: REWARD_ACCESS_CODES.duplicate,
        decisionId: previous.decisionId,
        decisionExpiresAt: previous.checkedInAt + ACCESS_DECISION_TTL_MS,
        checkedInAt: previous.checkedInAt,
        pointsAwarded: 0,
        balance: account?.balance ?? 0,
        member: user
          ? {
              name:
                user.fullName ??
                `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
              imageUrl: user.imageUrl,
            }
          : { name: "Socio", imageUrl: undefined },
      };
    }
    if (parsed.kind === "mobile") {
      await ctx.db.insert("consumedQrTokens", {
        tokenId: parsed.tokenId,
        organizationId: staff.organizationId,
        userId: credential.userId,
        consumedAt: now,
        expiresAt: parsed.expiresAt,
      });
    }
    const reservation = await linkEligibleReservation(
      ctx,
      staff.organizationId,
      credential.userId,
      now,
    );
    const reward = await awardAttendanceReward(ctx, {
      organizationId: staff.organizationId,
      userId: credential.userId,
      source: "qr_check_in",
      sourceId: decisionId,
      occurredAt: now,
      actorUserId: staff.userId,
    });
    const checkInId = await ctx.db.insert("memberCheckIns", {
      organizationId: staff.organizationId,
      userId: credential.userId,
      localDate,
      checkedInAt: now,
      source: parsed.kind === "mobile" ? "mobile_qr" : "wallet_qr",
      status: "allowed",
      reasonCode: REWARD_ACCESS_CODES.allowed,
      decisionId,
      actorUserId: staff.userId,
      reservationId: reservation.reservationId,
      pointsAwarded: reward.attendancePointsAwarded,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(credential._id, { lastUsedAt: now, updatedAt: now });
    if (access.membership._id) {
      await ctx.db.patch(access.membership._id, {
        lastActiveAt: now,
        updatedAt: now,
      });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", credential.userId))
      .first();
    return {
      allowed: true,
      actuateAccess: true,
      duplicate: false,
      code: REWARD_ACCESS_CODES.allowed,
      decisionId,
      decisionExpiresAt: now + ACCESS_DECISION_TTL_MS,
      checkInId,
      checkedInAt: now,
      pointsAwarded: reward.pointsAwarded,
      bonusPointsAwarded: reward.bonusPointsAwarded,
      alreadyAwarded: reward.alreadyAwarded,
      balance: reward.balance,
      reservationId: reservation.reservationId,
      reservationChoices: await Promise.all(
        reservation.choices.map(async (item) => ({
          id: item._id,
          className: (await ctx.db.get(item.classId))?.name ?? "Clase",
          startTime:
            (await ctx.db.get(item.scheduleId))?.startTime ??
            item.scheduleStartTime,
        })),
      ),
      member: user
        ? {
            name:
              user.fullName ??
              `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
            imageUrl: user.imageUrl,
          }
        : { name: "Socio", imageUrl: undefined },
    };
  },
});

export const linkReservationToCheckIn = mutation({
  args: {
    checkInId: v.id("memberCheckIns"),
    reservationId: v.id("classReservations"),
  },
  handler: async (ctx, args) => {
    const staff = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, staff.organizationId);
    const [checkIn, reservation] = await Promise.all([
      ctx.db.get(args.checkInId),
      ctx.db.get(args.reservationId),
    ]);
    if (
      !checkIn ||
      checkIn.organizationId !== staff.organizationId ||
      checkIn.status !== "allowed"
    ) {
      throw new Error("Ingreso no encontrado");
    }
    if (
      !reservation ||
      reservation.organizationId !== staff.organizationId ||
      reservation.userId !== checkIn.userId ||
      reservation.status !== "confirmed"
    ) {
      throw new Error("La reserva no es válida para este ingreso");
    }
    const schedule = await ctx.db.get(reservation.scheduleId);
    const now = Date.now();
    if (
      !schedule ||
      now < schedule.startTime - 20 * MINUTE_MS ||
      now > schedule.endTime + 6 * 60 * MINUTE_MS
    ) {
      throw new Error("La reserva está fuera de la ventana de ingreso");
    }
    await ctx.db.patch(reservation._id, {
      status: "attended",
      checkedInAt: checkIn.checkedInAt,
      updatedAt: now,
    });
    await ctx.db.patch(checkIn._id, {
      reservationId: reservation._id,
      updatedAt: now,
    });
    await awardAttendanceReward(ctx, {
      organizationId: staff.organizationId,
      userId: checkIn.userId,
      source: "class_attendance",
      sourceId: String(reservation._id),
      occurredAt: checkIn.checkedInAt,
      actorUserId: staff.userId,
    });
    return { linked: true };
  },
});

export const getAdminDashboard = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    const settingsDocument = await getSettingsDocument(
      ctx,
      membership.organizationId,
    );
    const [definitions, redemptions, checkIns, accounts] = await Promise.all([
      ctx.db
        .query("rewardDefinitions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
      ctx.db
        .query("rewardRedemptions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("memberCheckIns")
        .withIndex("by_organization_time", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("rewardAccounts")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect(),
    ]);
    const definitionById = new Map(
      definitions.map((definition) => [String(definition._id), definition]),
    );
    const userIds = new Set([
      ...redemptions.map((item) => item.userId),
      ...checkIns.map((item) => item.userId),
      ...accounts.map((item) => item.userId),
    ]);
    const users = await Promise.all(
      [...userIds].map(
        async (userId) =>
          [
            userId,
            await ctx.db
              .query("users")
              .withIndex("by_externalId", (q) => q.eq("externalId", userId))
              .first(),
          ] as const,
      ),
    );
    const userById = new Map(users);
    const displayName = (userId: string) => {
      const user = userById.get(userId);
      return (
        user?.fullName ??
        `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ??
        userId
      );
    };
    return {
      settings: resolveRewardSettings(settingsDocument?.rewards),
      definitions,
      accounts: accounts.map((item) => ({
        ...item,
        memberName: displayName(item.userId) || item.userId,
        memberImageUrl: userById.get(item.userId)?.imageUrl,
      })),
      redemptions: redemptions.map((item) => ({
        ...item,
        memberName: displayName(item.userId) || item.userId,
        rewardName:
          definitionById.get(String(item.rewardDefinitionId))?.name ??
          "Recompensa",
      })),
      checkIns: checkIns.map((item) => ({
        ...item,
        memberName: displayName(item.userId) || item.userId,
        memberImageUrl: userById.get(item.userId)?.imageUrl,
      })),
      stats: {
        membersEnrolled: accounts.length,
        pointsOutstanding: accounts.reduce(
          (sum, item) => sum + item.balance,
          0,
        ),
        pointsEarned: accounts.reduce(
          (sum, item) => sum + item.lifetimeEarned,
          0,
        ),
        pointsRedeemed: accounts.reduce(
          (sum, item) => sum + item.lifetimeRedeemed,
          0,
        ),
      },
    };
  },
});

export const auditAccountBalances = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    const accounts = await ctx.db
      .query("rewardAccounts")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();
    const discrepancies = [];
    for (const account of accounts) {
      const ledger = await ctx.db
        .query("rewardLedger")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();
      const ledgerBalance = ledger.reduce(
        (sum, entry) => sum + entry.points,
        0,
      );
      if (ledgerBalance !== account.balance) {
        discrepancies.push({
          accountId: account._id,
          userId: account.userId,
          storedBalance: account.balance,
          ledgerBalance,
          difference: account.balance - ledgerBalance,
        });
      }
    }
    return { checked: accounts.length, discrepancies };
  },
});

export const saveRewardDefinition = mutation({
  args: {
    id: v.optional(v.id("rewardDefinitions")),
    name: v.string(),
    description: v.optional(v.string()),
    pointsCost: v.number(),
    fulfillmentInstructions: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    availableQuantity: v.optional(v.number()),
    perMemberLimit: v.optional(v.number()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    if (
      !args.name.trim() ||
      !Number.isSafeInteger(args.pointsCost) ||
      args.pointsCost < 1
    ) {
      throw new Error("Ingresá un nombre y un costo válido");
    }
    if (
      (args.availableQuantity !== undefined &&
        (!Number.isSafeInteger(args.availableQuantity) ||
          args.availableQuantity < 0)) ||
      (args.perMemberLimit !== undefined &&
        (!Number.isSafeInteger(args.perMemberLimit) || args.perMemberLimit < 1))
    ) {
      throw new Error(
        "El stock y el límite por socio deben ser enteros válidos",
      );
    }
    if (args.imageUrl?.trim()) {
      try {
        const imageUrl = new URL(args.imageUrl.trim());
        if (imageUrl.protocol !== "https:") throw new Error();
      } catch {
        throw new Error("La imagen debe usar una URL HTTPS válida");
      }
    }
    const now = Date.now();
    const values = {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      pointsCost: args.pointsCost,
      type: "manual_perk" as const,
      fulfillmentInstructions:
        args.fulfillmentInstructions?.trim() || undefined,
      imageUrl: args.imageUrl?.trim() || undefined,
      availableQuantity: args.availableQuantity,
      perMemberLimit: args.perMemberLimit,
      enabled: args.enabled,
      updatedAt: now,
    };
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.organizationId !== membership.organizationId) {
        throw new Error("Recompensa no encontrada");
      }
      await ctx.db.patch(args.id, values);
      return args.id;
    }
    return await ctx.db.insert("rewardDefinitions", {
      organizationId: membership.organizationId,
      ...values,
      createdBy: membership.userId,
      createdAt: now,
    });
  },
});

export const redeem = mutation({
  args: { rewardDefinitionId: v.id("rewardDefinitions") },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "member") throw new Error("MEMBER_REQUIRED");
    await requireRewardsEnabled(ctx, membership.organizationId);
    const definition = await ctx.db.get(args.rewardDefinitionId);
    if (
      !definition ||
      definition.organizationId !== membership.organizationId ||
      !definition.enabled
    ) {
      throw new Error("La recompensa no está disponible");
    }
    if (
      definition.availableQuantity !== undefined &&
      definition.availableQuantity < 1
    ) {
      throw new Error("La recompensa no tiene stock disponible");
    }
    const previous = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", membership.userId),
      )
      .collect();
    if (
      definition.perMemberLimit !== undefined &&
      previous.filter(
        (item) =>
          item.rewardDefinitionId === definition._id &&
          item.status !== "cancelled",
      ).length >= definition.perMemberLimit
    ) {
      throw new Error("Alcanzaste el límite para esta recompensa");
    }
    const account = await getOrCreateAccount(
      ctx,
      membership.organizationId,
      membership.userId,
    );
    const redemptionKey = randomHex(16);
    const ledger = await writeLedgerEntry(ctx, {
      account,
      points: -definition.pointsCost,
      type: "redemption",
      reason: `Canje: ${definition.name}`,
      sourceType: "reward_redemption",
      sourceId: redemptionKey,
      idempotencyKey: `reward:redemption:${membership.organizationId}:${redemptionKey}`,
      actorUserId: membership.userId,
      metadata: { rewardDefinitionId: definition._id },
    });
    const now = Date.now();
    const redemptionId = await ctx.db.insert("rewardRedemptions", {
      organizationId: membership.organizationId,
      accountId: account._id,
      rewardDefinitionId: definition._id,
      userId: membership.userId,
      pointsCost: definition.pointsCost,
      status: "requested",
      ledgerEntryId: ledger._id,
      createdAt: now,
      updatedAt: now,
    });
    if (definition.availableQuantity !== undefined) {
      await ctx.db.patch(definition._id, {
        availableQuantity: definition.availableQuantity - 1,
        updatedAt: now,
      });
    }
    return redemptionId;
  },
});

export const updateRedemptionStatus = mutation({
  args: {
    id: v.id("rewardRedemptions"),
    status: v.union(
      v.literal("ready"),
      v.literal("fulfilled"),
      v.literal("cancelled"),
    ),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);
    const redemption = await ctx.db.get(args.id);
    if (
      !redemption ||
      redemption.organizationId !== membership.organizationId
    ) {
      throw new Error("Canje no encontrado");
    }
    if (
      redemption.status === "fulfilled" ||
      redemption.status === "cancelled"
    ) {
      throw new Error("El canje ya está cerrado");
    }
    const now = Date.now();
    if (args.status === "cancelled") {
      if (!args.cancellationReason?.trim()) throw new Error("Indicá el motivo");
      const account = await ctx.db.get(redemption.accountId);
      if (!account) throw new Error("Cuenta no encontrada");
      const ledger = await writeLedgerEntry(ctx, {
        account,
        points: redemption.pointsCost,
        type: "reversal",
        reason: "Devolución por canje cancelado",
        sourceType: "redemption_cancellation",
        sourceId: String(redemption._id),
        idempotencyKey: `reward:redemption-cancel:${redemption._id}`,
        actorUserId: membership.userId,
      });
      const definition = await ctx.db.get(redemption.rewardDefinitionId);
      if (definition?.availableQuantity !== undefined) {
        await ctx.db.patch(definition._id, {
          availableQuantity: definition.availableQuantity + 1,
          updatedAt: now,
        });
      }
      await ctx.db.patch(redemption._id, {
        status: "cancelled",
        cancellationLedgerEntryId: ledger._id,
        cancelledAt: now,
        cancelledBy: membership.userId,
        cancellationReason: args.cancellationReason.trim(),
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch(redemption._id, {
      status: args.status,
      fulfilledAt: args.status === "fulfilled" ? now : undefined,
      fulfilledBy: args.status === "fulfilled" ? membership.userId : undefined,
      updatedAt: now,
    });
  },
});

export const adjustBalance = mutation({
  args: { userId: v.string(), points: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    await requireRewardsEnabled(ctx, membership.organizationId);
    if (
      !Number.isSafeInteger(args.points) ||
      args.points === 0 ||
      !args.reason.trim()
    ) {
      throw new Error("Ingresá puntos enteros y un motivo");
    }
    const target = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .first();
    if (!target || target.role !== "member")
      throw new Error("Socio no encontrado");
    const account = await getOrCreateAccount(
      ctx,
      membership.organizationId,
      args.userId,
    );
    return await writeLedgerEntry(ctx, {
      account,
      points: args.points,
      type: "adjustment",
      reason: args.reason.trim(),
      sourceType: "admin_adjustment",
      idempotencyKey: `reward:adjustment:${membership.organizationId}:${randomHex(16)}`,
      actorUserId: membership.userId,
    });
  },
});

export const rotateCredential = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    const target = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .first();
    if (!target || target.role !== "member") {
      throw new Error("Socio no encontrado");
    }
    const credentials = await ctx.db
      .query("memberQrCredentials")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .collect();
    const now = Date.now();
    for (const credential of credentials.filter(
      (item) => item.status === "active",
    )) {
      await ctx.db.patch(credential._id, {
        status: "revoked",
        revokedAt: now,
        revokedBy: membership.userId,
        updatedAt: now,
      });
    }
    const credentialId = newCredentialId();
    await ctx.db.insert("memberQrCredentials", {
      organizationId: membership.organizationId,
      userId: args.userId,
      credentialId,
      version: Math.max(0, ...credentials.map((item) => item.version)) + 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const walletPasses = await ctx.db
      .query("walletPasses")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .collect();
    for (const pass of walletPasses) {
      await ctx.db.patch(pass._id, { credentialId, updatedAt: now });
    }
    await enqueueWalletUpdates(
      ctx,
      membership.organizationId,
      args.userId,
      "credential",
    );
    return { credentialId };
  },
});

export const voidCheckIn = mutation({
  args: { id: v.id("memberCheckIns"), reason: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    const checkIn = await ctx.db.get(args.id);
    if (!checkIn || checkIn.organizationId !== membership.organizationId) {
      throw new Error("Asistencia no encontrada");
    }
    if (checkIn.status !== "allowed")
      throw new Error("La asistencia ya está anulada");
    if (!args.reason.trim()) throw new Error("Indicá el motivo");
    const now = Date.now();
    await ctx.db.patch(checkIn._id, {
      status: "voided",
      voidedAt: now,
      voidedBy: membership.userId,
      voidReason: args.reason.trim(),
      updatedAt: now,
    });
    // Only reverse the daily attendance earning when no other valid entrance
    // remains. Class attendance is separate valid evidence and is preserved.
    const remaining = await ctx.db
      .query("memberCheckIns")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", checkIn.userId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("localDate"), checkIn.localDate),
          q.eq(q.field("status"), "allowed"),
        ),
      )
      .first();
    const classReservations = await ctx.db
      .query("classReservations")
      .withIndex("by_organization_user_start_time", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", checkIn.userId),
      )
      .filter((q) => q.eq(q.field("status"), "attended"))
      .collect();
    const organization = await ctx.db.get(membership.organizationId);
    const hasClassEvidence = classReservations.some(
      (reservation) =>
        getLocalDate(
          reservation.checkedInAt ??
            reservation.scheduleStartTime ??
            reservation.createdAt,
          organization?.timezone,
        ) === checkIn.localDate,
    );
    if (!remaining && !hasClassEvidence) {
      let account = await ctx.db
        .query("rewardAccounts")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", checkIn.userId),
        )
        .first();
      if (account) {
        if (checkIn.pointsAwarded > 0) {
          await writeLedgerEntry(ctx, {
            account,
            points: -checkIn.pointsAwarded,
            type: "reversal",
            reason: "Anulación de asistencia",
            sourceType: "check_in_void",
            sourceId: String(checkIn._id),
            idempotencyKey: `reward:check-in-void:${checkIn._id}`,
            actorUserId: membership.userId,
            localDate: checkIn.localDate,
            metadata: {
              reversedAttendanceSourceId: checkIn.decisionId,
              checkInId: checkIn._id,
            },
          });
        }

        const ledgerEntries = await ctx.db
          .query("rewardLedger")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("userId", checkIn.userId),
          )
          .collect();
        const reversedBonusIds = new Set(
          ledgerEntries
            .filter(
              (entry) =>
                entry.type === "reversal" &&
                entry.sourceType === "attendance_bonus_void",
            )
            .map(
              (entry) =>
                (
                  entry.metadata as
                    | { reversedBonusEntryId?: string }
                    | undefined
                )?.reversedBonusEntryId ?? entry.sourceId,
            )
            .filter((value): value is string => Boolean(value)),
        );
        const bonusEntries = ledgerEntries.filter(
          (entry) =>
            entry.type === "earn" &&
            (entry.sourceType === "streak_bonus" ||
              entry.sourceType === "weekly_bonus") &&
            !reversedBonusIds.has(String(entry._id)),
        );
        const allCheckIns = await ctx.db
          .query("memberCheckIns")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("userId", checkIn.userId),
          )
          .filter((q) => q.eq(q.field("status"), "allowed"))
          .collect();
        const validDates = new Set(allCheckIns.map((item) => item.localDate));
        for (const reservation of classReservations) {
          validDates.add(
            getLocalDate(
              reservation.checkedInAt ??
                reservation.scheduleStartTime ??
                reservation.createdAt,
              organization?.timezone,
            ),
          );
        }
        for (const bonus of bonusEntries) {
          const intervalDays = Number(
            (bonus.metadata as { intervalDays?: number } | undefined)
              ?.intervalDays,
          );
          const streakStart =
            bonus.sourceId && Number.isFinite(intervalDays)
              ? previousLocalDate(bonus.sourceId, intervalDays - 1)
              : undefined;
          const reverseStreak =
            bonus.sourceType === "streak_bonus" &&
            Boolean(streakStart) &&
            Boolean(bonus.sourceId) &&
            checkIn.localDate >= streakStart! &&
            checkIn.localDate <= bonus.sourceId!;
          const target = Number(
            (bonus.metadata as { attendanceTarget?: number } | undefined)
              ?.attendanceTarget,
          );
          const reverseWeekly =
            bonus.sourceType === "weekly_bonus" &&
            bonus.sourceId === getIsoWeekKey(checkIn.localDate) &&
            Number.isFinite(target) &&
            [...validDates].filter(
              (date) => getIsoWeekKey(date) === bonus.sourceId,
            ).length < target;
          if (!reverseStreak && !reverseWeekly) continue;
          account = (await ctx.db.get(account._id)) ?? account;
          await writeLedgerEntry(ctx, {
            account,
            points: -bonus.points,
            type: "reversal",
            reason: "Anulación de bono por asistencia",
            sourceType: "attendance_bonus_void",
            sourceId: String(bonus._id),
            idempotencyKey: `reward:bonus-void:${bonus._id}`,
            actorUserId: membership.userId,
            localDate: checkIn.localDate,
            metadata: {
              reversedBonusEntryId: String(bonus._id),
              checkInId: checkIn._id,
            },
          });
        }
      }
    }
  },
});
