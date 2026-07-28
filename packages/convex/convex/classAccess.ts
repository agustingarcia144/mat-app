import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tryActiveOrgContext } from "./permissions";

type Ctx = QueryCtx | MutationCtx;

export type ClassAccess = {
  /** False when the plan grants no class access at all. */
  classesEnabled: boolean;
  /** Class templates the member may attend. `null` means every class. */
  allowedClassIds: Id<"classes">[] | null;
};

const FULL_ACCESS: ClassAccess = { classesEnabled: true, allowedClassIds: null };

/**
 * Resolve which classes a member's plan grants access to.
 *
 * Configured per plan: `classesEnabled` is the master switch and
 * `allowedClassIds` narrows it to specific classes. Plans that set neither keep
 * the previous behaviour. Staff and members without a subscription get full
 * access.
 *
 * Note the role check is on the *target* user, not the caller — staff assign
 * fixed slots on behalf of members and must still respect the member's plan.
 *
 * Payment status is deliberately not handled here: an unpaid member is already
 * suspended and blocked by `requireActiveSubscription`.
 */
export async function getClassAccessForUser(
  ctx: Ctx,
  organizationId: Id<"organizations">,
  userId: string,
): Promise<ClassAccess> {
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .first();

  // Only members hold plan subscriptions; staff are never restricted.
  if (!membership || membership.role !== "member") return FULL_ACCESS;

  const subscription = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .filter((q) => q.neq(q.field("status"), "cancelled"))
    .first();

  if (!subscription) return FULL_ACCESS;

  const plan = await ctx.db.get(subscription.planId);
  if (!plan) return FULL_ACCESS;

  if (plan.classesEnabled === false) {
    return { classesEnabled: false, allowedClassIds: [] };
  }

  return {
    classesEnabled: true,
    allowedClassIds: plan.allowedClassIds?.length ? plan.allowedClassIds : null,
  };
}

/** Throw when the member's plan does not include the class. */
export async function assertClassAllowed(
  ctx: Ctx,
  organizationId: Id<"organizations">,
  userId: string,
  classId: Id<"classes">,
  actor: "member" | "staff",
): Promise<void> {
  const { classesEnabled, allowedClassIds } = await getClassAccessForUser(
    ctx,
    organizationId,
    userId,
  );

  if (!classesEnabled) {
    throw new Error(
      actor === "staff"
        ? "El plan del socio no incluye acceso a clases."
        : "Tu plan no incluye acceso a clases.",
    );
  }

  if (allowedClassIds && !allowedClassIds.includes(classId)) {
    throw new Error(
      actor === "staff"
        ? "El plan del socio no incluye esta clase."
        : "Esta clase no está incluida en tu plan.",
    );
  }
}

/**
 * Class access for the signed-in member. Powers the mobile classes screen,
 * which hides classes outside the member's plan.
 */
export const getMyClassAccess = query({
  args: {},
  handler: async (ctx): Promise<ClassAccess> => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return FULL_ACCESS;

    return await getClassAccessForUser(
      ctx,
      orgCtx.membership.organizationId,
      orgCtx.identity.subject,
    );
  },
});
