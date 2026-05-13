import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
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
        _id: null as null,
        organizationId: orgCtx.organizationId,
      };
    }
    return settings;
  },
});

export const update = mutation({
  args: {
    planificationsEnabled: v.optional(v.boolean()),
    classesEnabled: v.optional(v.boolean()),
    financeEnabled: v.optional(v.boolean()),
    memberAutoApproval: v.optional(v.boolean()),
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

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("organizationSettings", {
        organizationId: membership.organizationId,
        planificationsEnabled: args.planificationsEnabled ?? DEFAULTS.planificationsEnabled,
        classesEnabled: args.classesEnabled ?? DEFAULTS.classesEnabled,
        financeEnabled: args.financeEnabled ?? DEFAULTS.financeEnabled,
        memberAutoApproval: args.memberAutoApproval ?? DEFAULTS.memberAutoApproval,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
