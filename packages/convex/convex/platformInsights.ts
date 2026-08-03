import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isStaffRole, requireSuperAdmin } from "./permissions";
import { toBillingStatus } from "./organizationBilling";

/**
 * Platform-wide organization insights for super admins.
 *
 * NOTE: this walks every organization and every membership in a single query.
 * At the current scale (tens of gyms) that is well within Convex's per-query
 * read limits. If the platform grows, move to a paginated org list or keep
 * denormalized member counters on `organizations` instead.
 */
export const listOrganizations = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const plans = await ctx.db.query("appBillingPlans").collect();
    const plansById = new Map<Id<"appBillingPlans">, Doc<"appBillingPlans">>(
      plans.map((plan) => [plan._id, plan]),
    );

    const organizations = await ctx.db.query("organizations").collect();

    const rows = await Promise.all(
      organizations.map(async (organization) => {
        const subscription = await ctx.db
          .query("organizationBillingSubscriptions")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organization._id),
          )
          .order("desc")
          .first();

        const memberships = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organization._id),
          )
          .collect();

        let totalMembers = 0;
        let activeMembers = 0;
        let staffCount = 0;
        let lastActiveAt: number | null = null;

        for (const membership of memberships) {
          if (membership.role === "member") {
            totalMembers += 1;
            if (membership.status === "active") activeMembers += 1;
          } else if (isStaffRole(membership.role)) {
            if (membership.status === "active") staffCount += 1;
          }

          if (
            typeof membership.lastActiveAt === "number" &&
            (lastActiveAt === null || membership.lastActiveAt > lastActiveAt)
          ) {
            lastActiveAt = membership.lastActiveAt;
          }
        }

        const plan = subscription
          ? (plansById.get(subscription.billingPlanId) ?? null)
          : null;

        return {
          organizationId: organization._id,
          name: organization.name,
          slug: organization.slug,
          email: organization.email ?? null,
          phone: organization.phone ?? null,
          logoUrl: organization.logoUrl ?? null,
          createdAt: organization.createdAt,

          planKey: plan?.key ?? null,
          planName: plan?.name ?? null,
          source: subscription?.source ?? null,
          billingStatus: toBillingStatus(subscription),
          entitlementStatus: subscription?.entitlementStatus ?? null,
          subscriptionStatus: subscription?.status ?? null,
          trialEndsAt: subscription?.trialEndsAt ?? null,
          currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
          lastPaymentStatus: subscription?.lastPaymentStatus ?? null,
          payerEmail: subscription?.mercadoPagoPayerEmail ?? null,

          totalMembers,
          activeMembers,
          staffCount,
          lastActiveAt,
        };
      }),
    );

    // `organizations` has no index on createdAt, so order in memory.
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
