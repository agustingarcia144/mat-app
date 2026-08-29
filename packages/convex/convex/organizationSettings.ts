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
        _id: null as null,
        organizationId: orgCtx.organizationId,
      };
    }

    // Always return a resolved memberPayments object so clients never have to
    // reimplement the legacy defaults.
    return {
      ...settings,
      memberPayments: resolveMemberPaymentSettings(settings.memberPayments),
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

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        // Leave the stored value untouched when the caller did not send one.
        memberPayments: memberPayments ?? existing.memberPayments,
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
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
