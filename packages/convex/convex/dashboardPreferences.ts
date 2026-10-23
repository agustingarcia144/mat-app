import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  isStaffRole,
  requireCurrentOrganizationMembership,
} from "./permissions";
import { dashboardLayoutValidator } from "./dashboardLayoutValidator";
import { normalizeDashboardLayout } from "../../core/src/utils/dashboard";

export const get = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (
      membership.organizationId !== organizationId ||
      !isStaffRole(membership.role)
    )
      return null;
    // Super admins can have synthetic access without a membership to personalize.
    const record = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", membership.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    return {
      layout: normalizeDashboardLayout(record?.dashboardLayout),
      canCustomize: Boolean(record),
    };
  },
});

export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    layout: dashboardLayoutValidator,
  },
  handler: async (ctx, { organizationId, layout }) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (
      membership.organizationId !== organizationId ||
      !isStaffRole(membership.role)
    ) {
      throw new Error("No tenés acceso para personalizar este inicio.");
    }
    const ids = [...layout.left, ...layout.right];
    if (new Set(ids).size !== ids.length)
      throw new Error("Las secciones no pueden repetirse.");
    const record = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", membership.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!record)
      throw new Error("Necesitás una membresía activa para guardar tu inicio.");
    await ctx.db.patch(record._id, {
      dashboardLayout: normalizeDashboardLayout(layout),
      updatedAt: Date.now(),
    });
  },
});
