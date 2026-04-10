import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from "./permissions";

const DEFAULT_JOIN_TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

type OrganizationMemberInviteCodeDetails = {
  code: string;
  joinToken: string;
  createdAt: number;
};

function normalizeInviteCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function getActiveCodeByOrganization(
  ctx: any,
  organizationId: Id<"organizations">,
): Promise<OrganizationMemberInviteCodeDetails | null> {
  const records = await ctx.db
    .query("organizationMemberInviteCodes")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .collect();

  const active = records
    .filter((record: any) => record.status === "active")
    .sort((a: any, b: any) => b.createdAt - a.createdAt);

  const first = active[0] as
    | (OrganizationMemberInviteCodeDetails & {
        joinToken: string;
      })
    | undefined;

  if (!first) return null;
  return {
    code: first.code,
    joinToken: first.joinToken,
    createdAt: first.createdAt,
  };
}

const createOrganizationMemberInviteCodeRecordInternalArgs = {
  organizationId: v.id("organizations"),
  code: v.string(),
  codeHash: v.string(),
  joinToken: v.string(),
  createdBy: v.string(),
  createdAt: v.number(),
};

export const createOrganizationMemberInviteCodeRecordInternal =
  internalMutation({
    args: createOrganizationMemberInviteCodeRecordInternalArgs,
    handler: async (ctx, args) => {
      await ctx.db.insert("organizationMemberInviteCodes", {
        organizationId: args.organizationId,
        code: args.code,
        codeHash: args.codeHash,
        joinToken: args.joinToken,
        status: "active",
        createdBy: args.createdBy,
        createdAt: args.createdAt,
        updatedAt: args.createdAt,
      });

      return {
        code: args.code,
        joinToken: args.joinToken,
        createdAt: args.createdAt,
      };
    },
  });

export const getCurrentAdminOrTrainerMembershipInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "admin" && membership.role !== "trainer") {
      throw new Error("Unauthorized: Admin or trainer role required");
    }
    return membership;
  },
});

export const getActiveMemberInviteCodeByHashInternal = internalQuery({
  args: {
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizationMemberInviteCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

export const getActiveMemberInviteCodeByOrganizationInternal = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<OrganizationMemberInviteCodeDetails | null> => {
    return await getActiveCodeByOrganization(ctx, args.organizationId);
  },
});

export const getMemberInviteCodeByCodeHashInternal = internalQuery({
  args: {
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizationMemberInviteCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .first();
  },
});

export const getOrCreateOrganizationMemberInviteCode = action({
  args: {},
  handler: async (ctx): Promise<OrganizationMemberInviteCodeDetails> => {
    const membership = await ctx.runQuery(
      internal.memberInviteCodes.getCurrentAdminOrTrainerMembershipInternal,
      {},
    );

    const existing = await ctx.runQuery(
      internal.memberInviteCodes
        .getActiveMemberInviteCodeByOrganizationInternal,
      { organizationId: membership.organizationId },
    );
    if (existing) {
      return {
        code: existing.code,
        joinToken: existing.joinToken,
        createdAt: existing.createdAt,
      };
    }

    let attempts = 0;
    while (attempts < 5) {
      attempts += 1;
      const generatedCode = await ctx.runAction(
        internal.memberInviteCodesNode.generateInviteCode,
        {},
      );
      const normalizedCode = normalizeInviteCode(generatedCode);
      const codeHash = await ctx.runAction(
        internal.memberInviteCodesNode.hashInviteCode,
        {
          code: normalizedCode,
        },
      );

      const existingHash = await ctx.runQuery(
        internal.memberInviteCodes.getMemberInviteCodeByCodeHashInternal,
        { codeHash },
      );
      if (existingHash) {
        continue;
      }

      const { token } = await ctx.runAction(
        internal.joinGymNode.createJoinToken,
        {
          organizationId: membership.organizationId,
          expiresInSeconds: DEFAULT_JOIN_TOKEN_TTL_SECONDS,
        },
      );

      const now = Date.now();
      return await ctx.runMutation(
        internal.memberInviteCodes
          .createOrganizationMemberInviteCodeRecordInternal,
        {
          organizationId: membership.organizationId,
          code: normalizedCode,
          codeHash,
          joinToken: token,
          createdBy: membership.userId,
          createdAt: now,
        },
      );
    }

    throw new Error(
      "No se pudo generar un código de invitación. Intenta nuevamente.",
    );
  },
});

export const getOrganizationMemberInviteCodeDetails = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const active = await getActiveCodeByOrganization(
      ctx,
      membership.organizationId,
    );
    if (!active) {
      return null;
    }

    return {
      code: active.code,
      joinToken: active.joinToken,
      createdAt: active.createdAt,
    };
  },
});

export const redeemMemberInviteCode: ReturnType<typeof action> = action({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Debes iniciar sesión para unirte a un gimnasio.");
    }

    const normalizedCode = normalizeInviteCode(args.code);
    if (!normalizedCode) {
      throw new Error("Código inválido.");
    }

    const codeHash = await ctx.runAction(
      internal.memberInviteCodesNode.hashInviteCode,
      {
        code: normalizedCode,
      },
    );

    const codeRecord = await ctx.runQuery(
      internal.memberInviteCodes.getActiveMemberInviteCodeByHashInternal,
      { codeHash },
    );
    if (!codeRecord) {
      throw new Error("Código inválido o deshabilitado.");
    }

    return await ctx.runMutation(internal.joinGym.submitJoinRequestInternal, {
      organizationId: codeRecord.organizationId,
      userId: identity.subject,
      source: "code",
    });
  },
});
