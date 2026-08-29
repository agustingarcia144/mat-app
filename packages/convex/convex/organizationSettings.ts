import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireCurrentOrganizationMembership,
  requireAdmin,
  tryActiveOrgContext,
} from "./permissions";

const DEFAULTS = {
  planificationsEnabled: true,
  classesEnabled: true,
  financeEnabled: true,
  memberAutoApproval: false,
};

export const REWARD_DEFAULTS = {
  enabled: false,
  programName: "Recompensas MAT",
  pointsName: "puntos",
  pointsPerAttendance: 10,
  maxRewardedAttendancesPerDay: 1,
  duplicateWindowMinutes: 30,
  eligibleSources: ["qr_check_in", "class_attendance"] as const,
  streaksEnabled: false,
  weeklyBonusEnabled: false,
} as const;

export type RewardSettings = {
  enabled: boolean;
  programName: string;
  pointsName: string;
  pointsPerAttendance: number;
  maxRewardedAttendancesPerDay: number;
  duplicateWindowMinutes: number;
  eligibleSources: Array<"qr_check_in" | "class_attendance" | "manual">;
  streaksEnabled: boolean;
  streakIntervalDays?: number;
  streakBonusPoints?: number;
  weeklyBonusEnabled: boolean;
  weeklyAttendanceTarget?: number;
  weeklyBonusPoints?: number;
  terms?: string;
};

export function resolveRewardSettings(
  stored: Doc<"organizationSettings">["rewards"] | undefined,
): RewardSettings {
  return {
    ...REWARD_DEFAULTS,
    eligibleSources: [...REWARD_DEFAULTS.eligibleSources],
    ...(stored ?? {}),
  };
}

export async function getRewardSettings(
  ctx: { db: any },
  organizationId: Id<"organizations">,
): Promise<RewardSettings> {
  const settings = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .first();
  return resolveRewardSettings(settings?.rewards);
}

/**
 * Member-payment defaults for organizations created before the feature (and
 * for rows that never opted in). Bank transfer stays on so existing gyms keep
 * working exactly as they did; MercadoPago is off until an admin connects an
 * account and enables it.
 */
export const MEMBER_PAYMENT_DEFAULTS = {
  bankTransferEnabled: true,
  mercadoPagoRecurringEnabled: false,
  mercadoPagoOneTimeEnabled: false,
  gracePeriodDays: 5,
  initialPaymentRequiresApproval: true,
} as const;

export type MemberPaymentSettings = {
  bankTransferEnabled: boolean;
  mercadoPagoRecurringEnabled: boolean;
  mercadoPagoOneTimeEnabled: boolean;
  gracePeriodDays: number;
  initialPaymentRequiresApproval: boolean;
};

export const MIN_GRACE_PERIOD_DAYS = 0;
export const MAX_GRACE_PERIOD_DAYS = 30;

/** Merge a stored (possibly absent) member-payment config with the defaults. */
export function resolveMemberPaymentSettings(
  stored: Doc<"organizationSettings">["memberPayments"] | undefined,
): MemberPaymentSettings {
  return { ...MEMBER_PAYMENT_DEFAULTS, ...(stored ?? {}) };
}

/**
 * Read the effective member-payment settings for an organization. Safe to call
 * from any backend function: it never requires a settings row to exist.
 */
export async function getMemberPaymentSettings(
  ctx: { db: any },
  organizationId: Id<"organizations">,
): Promise<MemberPaymentSettings> {
  const settings = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .first();

  return resolveMemberPaymentSettings(settings?.memberPayments);
}

const memberPaymentsValidator = v.object({
  bankTransferEnabled: v.boolean(),
  mercadoPagoRecurringEnabled: v.boolean(),
  mercadoPagoOneTimeEnabled: v.boolean(),
  gracePeriodDays: v.number(),
  initialPaymentRequiresApproval: v.boolean(),
});

const rewardsValidator = v.object({
  enabled: v.boolean(),
  programName: v.string(),
  pointsName: v.string(),
  pointsPerAttendance: v.number(),
  maxRewardedAttendancesPerDay: v.number(),
  duplicateWindowMinutes: v.number(),
  eligibleSources: v.array(
    v.union(
      v.literal("qr_check_in"),
      v.literal("class_attendance"),
      v.literal("manual"),
    ),
  ),
  streaksEnabled: v.boolean(),
  streakIntervalDays: v.optional(v.number()),
  streakBonusPoints: v.optional(v.number()),
  weeklyBonusEnabled: v.boolean(),
  weeklyAttendanceTarget: v.optional(v.number()),
  weeklyBonusPoints: v.optional(v.number()),
  terms: v.optional(v.string()),
});

function validateRewardSettings(settings: RewardSettings): RewardSettings {
  const integerFields = [
    settings.pointsPerAttendance,
    settings.maxRewardedAttendancesPerDay,
    settings.duplicateWindowMinutes,
  ];
  if (
    integerFields.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error("Los valores de recompensas deben ser enteros positivos");
  }
  if (!settings.programName.trim() || !settings.pointsName.trim()) {
    throw new Error("El programa y los puntos deben tener un nombre");
  }
  if (settings.maxRewardedAttendancesPerDay > 20) {
    throw new Error("El máximo diario no puede superar 20 asistencias");
  }
  if (settings.duplicateWindowMinutes > 24 * 60) {
    throw new Error("La ventana de duplicados no puede superar 24 horas");
  }
  if (settings.eligibleSources.length === 0) {
    throw new Error("Seleccioná al menos una fuente de asistencia");
  }
  if (settings.streaksEnabled) {
    if (
      !settings.streakIntervalDays ||
      !Number.isSafeInteger(settings.streakIntervalDays) ||
      settings.streakIntervalDays < 2 ||
      !settings.streakBonusPoints ||
      !Number.isSafeInteger(settings.streakBonusPoints) ||
      settings.streakBonusPoints < 1
    ) {
      throw new Error("Configurá días y puntos válidos para la racha");
    }
  }
  if (settings.weeklyBonusEnabled) {
    if (
      !settings.weeklyAttendanceTarget ||
      !Number.isSafeInteger(settings.weeklyAttendanceTarget) ||
      settings.weeklyAttendanceTarget < 1 ||
      settings.weeklyAttendanceTarget > 7 ||
      !settings.weeklyBonusPoints ||
      !Number.isSafeInteger(settings.weeklyBonusPoints) ||
      settings.weeklyBonusPoints < 1
    ) {
      throw new Error("Configurá una meta y puntos semanales válidos");
    }
  }
  return {
    ...settings,
    programName: settings.programName.trim(),
    pointsName: settings.pointsName.trim(),
    terms: settings.terms?.trim() || undefined,
  };
}

function validateMemberPaymentSettings(settings: MemberPaymentSettings) {
  if (
    !Number.isInteger(settings.gracePeriodDays) ||
    settings.gracePeriodDays < MIN_GRACE_PERIOD_DAYS ||
    settings.gracePeriodDays > MAX_GRACE_PERIOD_DAYS
  ) {
    throw new Error(
      `El período de gracia debe ser un número entero de días entre ${MIN_GRACE_PERIOD_DAYS} y ${MAX_GRACE_PERIOD_DAYS}`,
    );
  }

  const anyMethodEnabled =
    settings.bankTransferEnabled ||
    settings.mercadoPagoRecurringEnabled ||
    settings.mercadoPagoOneTimeEnabled;

  if (!anyMethodEnabled) {
    throw new Error(
      "Tenés que dejar al menos un método de pago habilitado para tus socios",
    );
  }

  return settings;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) {
      return null;
    }

    const settings = await ctx.db
      .query("organizationSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", orgCtx.organizationId),
      )
      .first();

    if (!settings) {
      return {
        ...DEFAULTS,
        memberPayments: { ...MEMBER_PAYMENT_DEFAULTS },
        rewards: resolveRewardSettings(undefined),
        _id: null as null,
        organizationId: orgCtx.organizationId,
      };
    }

    // Always return a resolved memberPayments object so clients never have to
    // reimplement the legacy defaults.
    return {
      ...settings,
      memberPayments: resolveMemberPaymentSettings(settings.memberPayments),
      rewards: resolveRewardSettings(settings.rewards),
    };
  },
});

export const update = mutation({
  args: {
    planificationsEnabled: v.optional(v.boolean()),
    classesEnabled: v.optional(v.boolean()),
    financeEnabled: v.optional(v.boolean()),
    memberAutoApproval: v.optional(v.boolean()),
    memberPayments: v.optional(memberPaymentsValidator),
    rewards: v.optional(rewardsValidator),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const existing = await ctx.db
      .query("organizationSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .first();

    const memberPayments = args.memberPayments
      ? validateMemberPaymentSettings(args.memberPayments)
      : undefined;
    const rewards = args.rewards
      ? validateRewardSettings(args.rewards)
      : undefined;

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        // Leave the stored value untouched when the caller did not send one.
        memberPayments: memberPayments ?? existing.memberPayments,
        rewards: rewards ?? existing.rewards,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationSettings", {
        organizationId: membership.organizationId,
        planificationsEnabled:
          args.planificationsEnabled ?? DEFAULTS.planificationsEnabled,
        classesEnabled: args.classesEnabled ?? DEFAULTS.classesEnabled,
        financeEnabled: args.financeEnabled ?? DEFAULTS.financeEnabled,
        memberAutoApproval:
          args.memberAutoApproval ?? DEFAULTS.memberAutoApproval,
        memberPayments,
        rewards,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
