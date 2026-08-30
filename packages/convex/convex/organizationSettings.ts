import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
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
  pointsPerMembershipMonth: 10,
  maxRewardedAttendancesPerDay: 1,
  eligibleSources: ["qr_check_in", "class_attendance"] as const,
  streaksEnabled: false,
  weeklyBonusEnabled: false,
} as const;

export const DEFAULT_WALLET_CARD_DESIGN = {
  programName: "Membresía y recompensas",
  showCardName: true,
  backgroundColor: "#121826",
  backgroundStyle: "solid" as const,
  gradientStartColor: "#121826",
  gradientEndColor: "#216ACF",
  gradientAngle: 135,
  showPoints: true,
  useOrganizationLogo: true,
} as const;

export type WalletCardDesign = {
  programName: string;
  showCardName?: boolean;
  backgroundColor: string;
  backgroundStyle?: "solid" | "gradient" | "image";
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngle?: number;
  showPoints?: boolean;
  useOrganizationLogo?: boolean;
  logoStorageId?: Id<"_storage">;
  heroImageStorageId?: Id<"_storage">;
  apple?: {
    logoText?: string;
    foregroundColor?: string;
    labelColor?: string;
  };
  google?: { programName?: string };
};

export type WalletCardSettings = {
  enabled: boolean;
  mode: "global" | "by_plan";
  defaultDesign: WalletCardDesign;
  planDesigns: Array<{
    planId: Id<"membershipPlans">;
    design: WalletCardDesign;
  }>;
};

export type RewardSettings = {
  enabled: boolean;
  programName: string;
  pointsName: string;
  pointsPerAttendance: number;
  pointsPerMembershipMonth: number;
  maxRewardedAttendancesPerDay: number;
  eligibleSources: Array<
    "qr_check_in" | "class_attendance" | "manual" | "membership_payment"
  >;
  streaksEnabled: boolean;
  streakIntervalDays?: number;
  streakBonusPoints?: number;
  weeklyBonusEnabled: boolean;
  weeklyAttendanceTarget?: number;
  weeklyBonusPoints?: number;
  terms?: string;
  walletCard: WalletCardSettings;
};

export function resolveRewardSettings(
  stored: Doc<"organizationSettings">["rewards"] | undefined,
): RewardSettings {
  const { duplicateWindowMinutes: _legacyDuplicateWindow, ...storedSettings } =
    stored ?? {};
  return {
    ...REWARD_DEFAULTS,
    eligibleSources: [...REWARD_DEFAULTS.eligibleSources],
    ...storedSettings,
    walletCard: resolveWalletCardSettings(stored?.walletCard),
  };
}

export function resolveWalletCardSettings(
  stored:
    | NonNullable<Doc<"organizationSettings">["rewards"]>["walletCard"]
    | undefined,
): WalletCardSettings {
  return {
    enabled: stored?.enabled ?? false,
    mode: stored?.mode ?? "global",
    defaultDesign: {
      ...DEFAULT_WALLET_CARD_DESIGN,
      ...(stored?.defaultDesign ?? {}),
    },
    planDesigns: [...(stored?.planDesigns ?? [])],
  };
}

export function resolveWalletCardDesign(
  settings: WalletCardSettings,
  planId?: Id<"membershipPlans">,
): WalletCardDesign {
  if (settings.mode === "by_plan" && planId) {
    const override = settings.planDesigns.find(
      (item) => item.planId === planId,
    );
    if (override) return override.design;
  }
  return settings.defaultDesign;
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

const walletCardDesignValidator = v.object({
  programName: v.string(),
  showCardName: v.optional(v.boolean()),
  backgroundColor: v.string(),
  backgroundStyle: v.optional(
    v.union(v.literal("solid"), v.literal("gradient"), v.literal("image")),
  ),
  gradientStartColor: v.optional(v.string()),
  gradientEndColor: v.optional(v.string()),
  gradientAngle: v.optional(v.number()),
  showPoints: v.optional(v.boolean()),
  useOrganizationLogo: v.optional(v.boolean()),
  logoStorageId: v.optional(v.id("_storage")),
  heroImageStorageId: v.optional(v.id("_storage")),
  apple: v.optional(
    v.object({
      logoText: v.optional(v.string()),
      foregroundColor: v.optional(v.string()),
      labelColor: v.optional(v.string()),
    }),
  ),
  google: v.optional(
    v.object({
      programName: v.optional(v.string()),
    }),
  ),
});

const rewardsValidator = v.object({
  enabled: v.boolean(),
  programName: v.string(),
  pointsName: v.string(),
  pointsPerAttendance: v.number(),
  pointsPerMembershipMonth: v.optional(v.number()),
  maxRewardedAttendancesPerDay: v.number(),
  // Accepted only so settings saved before daily duplicate detection remain
  // readable. It is intentionally ignored and no longer returned to clients.
  duplicateWindowMinutes: v.optional(v.number()),
  eligibleSources: v.array(
    v.union(
      v.literal("qr_check_in"),
      v.literal("class_attendance"),
      v.literal("manual"),
      v.literal("membership_payment"),
    ),
  ),
  streaksEnabled: v.boolean(),
  streakIntervalDays: v.optional(v.number()),
  streakBonusPoints: v.optional(v.number()),
  weeklyBonusEnabled: v.boolean(),
  weeklyAttendanceTarget: v.optional(v.number()),
  weeklyBonusPoints: v.optional(v.number()),
  terms: v.optional(v.string()),
  walletCard: v.optional(
    v.object({
      enabled: v.optional(v.boolean()),
      mode: v.union(v.literal("global"), v.literal("by_plan")),
      defaultDesign: walletCardDesignValidator,
      planDesigns: v.array(
        v.object({
          planId: v.id("membershipPlans"),
          design: walletCardDesignValidator,
        }),
      ),
    }),
  ),
});

function normalizeWalletCardDesign(design: WalletCardDesign): WalletCardDesign {
  const colorFields = [
    design.backgroundColor,
    design.gradientStartColor,
    design.gradientEndColor,
    design.apple?.foregroundColor,
    design.apple?.labelColor,
  ].filter((value): value is string => Boolean(value));
  if (colorFields.some((value) => !/^#[0-9a-f]{6}$/i.test(value))) {
    throw new Error("Los colores de Wallet deben usar el formato #RRGGBB");
  }
  const programName = design.programName.trim();
  if (!programName || programName.length > 40) {
    throw new Error(
      "El nombre de la tarjeta debe tener entre 1 y 40 caracteres",
    );
  }
  const gradientAngle = design.gradientAngle ?? 135;
  if (
    !Number.isFinite(gradientAngle) ||
    gradientAngle < 0 ||
    gradientAngle > 360
  ) {
    throw new Error("El ángulo del degradado debe estar entre 0 y 360 grados");
  }
  return {
    ...design,
    programName,
    showCardName: design.showCardName ?? true,
    backgroundColor: design.backgroundColor.toUpperCase(),
    backgroundStyle: design.backgroundStyle ?? "solid",
    gradientStartColor: (
      design.gradientStartColor ?? design.backgroundColor
    ).toUpperCase(),
    gradientEndColor: (design.gradientEndColor ?? "#216ACF").toUpperCase(),
    gradientAngle,
    showPoints: design.showPoints ?? true,
    useOrganizationLogo: design.useOrganizationLogo ?? true,
    apple: design.apple
      ? {
          logoText: design.apple.logoText?.trim().slice(0, 40) || undefined,
          foregroundColor: design.apple.foregroundColor?.toUpperCase(),
          labelColor: design.apple.labelColor?.toUpperCase(),
        }
      : undefined,
    google: design.google
      ? {
          programName:
            design.google.programName?.trim().slice(0, 40) || undefined,
        }
      : undefined,
  };
}

function validateRewardSettings(
  settings: Omit<RewardSettings, "walletCard" | "pointsPerMembershipMonth"> & {
    pointsPerMembershipMonth?: number;
    duplicateWindowMinutes?: number;
    walletCard?: Omit<WalletCardSettings, "enabled"> & {
      enabled?: boolean;
    };
  },
): RewardSettings {
  const integerFields = [
    settings.pointsPerAttendance,
    settings.pointsPerMembershipMonth ??
      REWARD_DEFAULTS.pointsPerMembershipMonth,
    settings.maxRewardedAttendancesPerDay,
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
  if (settings.eligibleSources.length === 0) {
    throw new Error("Seleccioná al menos una fuente de puntos");
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
  const walletCard = resolveWalletCardSettings(settings.walletCard);
  const seenPlans = new Set<string>();
  for (const item of walletCard.planDesigns) {
    if (seenPlans.has(String(item.planId))) {
      throw new Error("Cada plan puede tener una sola tarjeta de Wallet");
    }
    seenPlans.add(String(item.planId));
  }
  const { duplicateWindowMinutes: _legacyDuplicateWindow, ...cleanSettings } =
    settings;
  return {
    ...cleanSettings,
    programName: settings.programName.trim(),
    pointsName: settings.pointsName.trim(),
    pointsPerMembershipMonth:
      settings.pointsPerMembershipMonth ??
      REWARD_DEFAULTS.pointsPerMembershipMonth,
    terms: settings.terms?.trim() || undefined,
    walletCard: {
      ...walletCard,
      defaultDesign: normalizeWalletCardDesign(walletCard.defaultDesign),
      planDesigns: walletCard.planDesigns.map((item) => ({
        ...item,
        design: normalizeWalletCardDesign(item.design),
      })),
    },
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
    if (rewards) {
      for (const item of rewards.walletCard.planDesigns) {
        const plan = await ctx.db.get(item.planId);
        if (!plan || plan.organizationId !== membership.organizationId) {
          throw new Error("Una tarjeta referencia un plan de otro gimnasio");
        }
      }
    }

    const walletDesignChanged =
      rewards !== undefined &&
      JSON.stringify(resolveRewardSettings(existing?.rewards).walletCard) !==
        JSON.stringify(rewards.walletCard);
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
    if (walletDesignChanged) {
      const passes = await ctx.db
        .query("walletPasses")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect();
      for (const pass of passes.filter((item) => item.status === "active")) {
        const idempotencyKey = `wallet:${pass.provider}:${pass._id}:design:${now}`;
        // Apple uses this timestamp as the opaque pass update tag after APNs
        // wakes Wallet and it asks which registered serials changed.
        await ctx.db.patch(pass._id, { updatedAt: now });
        await ctx.db.insert("walletSyncOperations", {
          organizationId: membership.organizationId,
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
      }
      if (passes.some((item) => item.status === "active")) {
        await ctx.scheduler.runAfter(
          0,
          internal.walletActions.runWalletSyncOperations,
          { limit: 50 },
        );
      }
    }
  },
});
