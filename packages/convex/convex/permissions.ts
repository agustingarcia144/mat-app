import { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;
type AppRole = "admin" | "trainer" | "member";
export type OrgErrorCode =
  | "NOT_AUTHENTICATED"
  | "ORG_REQUIRED"
  | "ORG_FORBIDDEN"
  | "ORG_NOT_SYNCED";

export class OrgAccessError extends Error {
  code: OrgErrorCode;

  constructor(code: OrgErrorCode, message: string) {
    super(message);
    this.name = "OrgAccessError";
    this.code = code;
  }
}

/**
 * Get current user's role in the active organization
 */
async function getUserRole(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<AppRole | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", identity.subject),
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();

  return membership?.role ?? null;
}

/**
 * Require membership in a specific organization.
 */
export async function requireOrganizationMembership(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<Doc<"organizationMemberships">> {
  const identity = await requireAuth(ctx);
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", identity.subject),
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();

  if (!membership) {
    throw new OrgAccessError(
      "ORG_FORBIDDEN",
      "Access denied: organization membership required",
    );
  }

  return membership;
}

/**
 * Require an active org context for the current user.
 * Priority:
 * 1) User's persisted activeOrganizationId in Convex
 * 2) Single active membership fallback
 */
export async function requireCurrentOrganizationMembership(
  ctx: Ctx,
): Promise<Doc<"organizationMemberships">> {
  const identity = await requireAuth(ctx);

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user", (q) => q.eq("userId", identity.subject))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  if (memberships.length === 0) {
    throw new OrgAccessError(
      "ORG_FORBIDDEN",
      "User is not an active member of any organization",
    );
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
    .first();

  const selectedOrganizationId = user?.activeOrganizationId ?? null;

  if (selectedOrganizationId) {
    const selectedOrg = await ctx.db.get(selectedOrganizationId);
    if (!selectedOrg) {
      throw new OrgAccessError(
        "ORG_NOT_SYNCED",
        "Selected organization no longer exists",
      );
    }

    const membership = memberships.find(
      (m) => m.organizationId === selectedOrg._id,
    );
    if (!membership) {
      throw new OrgAccessError(
        "ORG_FORBIDDEN",
        "Access denied for selected organization",
      );
    }
    return membership;
  }

  if (memberships.length === 1) {
    return memberships[0];
  }

  throw new OrgAccessError(
    "ORG_REQUIRED",
    "Multiple organizations detected. Select an active organization first.",
  );
}

/**
 * Check if user is admin or trainer in the organization
 */
export async function isAdminOrTrainer(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId);
  return role === "admin" || role === "trainer";
}

/**
 * Check if user is admin in the organization
 */
export async function isAdmin(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const role = await getUserRole(ctx, organizationId);
  return role === "admin";
}

/**
 * Throw error if user is not admin or trainer
 */
export async function requireAdminOrTrainer(
  ctx: Ctx,
  organizationId: Id<"organizations">,
) {
  const membership = await requireOrganizationMembership(ctx, organizationId);
  if (membership.role !== "admin" && membership.role !== "trainer") {
    throw new Error("Unauthorized: Admin or trainer role required");
  }
}

/**
 * Throw error if user is not admin.
 */
export async function requireAdmin(
  ctx: Ctx,
  organizationId: Id<"organizations">,
) {
  const membership = await requireOrganizationMembership(ctx, organizationId);
  if (membership.role !== "admin") {
    throw new Error("Unauthorized: Admin role required");
  }
}

/**
 * Throw error if user is not authenticated
 */
export async function requireAuth(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new OrgAccessError("NOT_AUTHENTICATED", "Not authenticated");
  }
  return identity;
}

export async function requireActiveOrgContext(ctx: Ctx) {
  const identity = await requireAuth(ctx);
  const membership = await requireCurrentOrganizationMembership(ctx);
  return {
    identity,
    membership,
    organizationId: membership.organizationId,
  };
}

/** Same as requireActiveOrgContext but returns null on OrgAccessError (e.g. purged user, signed out). */
export async function tryActiveOrgContext(
  ctx: Ctx,
): Promise<Awaited<ReturnType<typeof requireActiveOrgContext>> | null> {
  try {
    return await requireActiveOrgContext(ctx);
  } catch (e) {
    if (e instanceof OrgAccessError) {
      return null;
    }
    throw e;
  }
}

/**
 * Check whether the organization has at least one active membership plan.
 * When no plans are configured, subscription enforcement is bypassed so
 * members are not locked out of features they have no way to unlock.
 */
export async function organizationHasActivePlans(
  ctx: Ctx,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const activePlan = await ctx.db
    .query("membershipPlans")
    .withIndex("by_organization_active", (q) =>
      q.eq("organizationId", organizationId).eq("isActive", true),
    )
    .first();
  return activePlan !== null;
}

/**
 * Check if a member has an active (non-suspended, non-cancelled) subscription
 * in the given organization. Admins and trainers are always considered active.
 * If the organization has no active membership plans, subscription enforcement
 * is bypassed so members are not blocked from features they cannot unlock.
 * Returns { hasActiveSubscription, subscriptionStatus } so callers can decide
 * whether to block and what message to show.
 */
export async function checkSubscriptionStatus(
  ctx: Ctx,
  organizationId: Id<"organizations">,
  userId: string,
): Promise<{
  hasActiveSubscription: boolean;
  subscriptionStatus: "active" | "suspended" | "cancelled" | "none";
}> {
  // Admins and trainers bypass subscription checks
  const isStaff = await isAdminOrTrainer(ctx, organizationId);
  if (isStaff) {
    return { hasActiveSubscription: true, subscriptionStatus: "active" };
  }

  // If the org has no active plans, bypass subscription enforcement
  const hasPlans = await organizationHasActivePlans(ctx, organizationId);
  if (!hasPlans) {
    return { hasActiveSubscription: true, subscriptionStatus: "active" };
  }

  const subscription = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .filter((q) => q.neq(q.field("status"), "cancelled"))
    .first();

  if (!subscription) {
    return { hasActiveSubscription: false, subscriptionStatus: "none" };
  }

  return {
    hasActiveSubscription: subscription.status === "active",
    subscriptionStatus: subscription.status,
  };
}

/**
 * Throw an error if the member does not have an active subscription.
 * Admins and trainers bypass this check.
 *
 * ⚠️  HOTFIX 2026-04-13: Subscription enforcement temporarily disabled.
 *     The mobile app build with plan subscription support is in App Store
 *     review. Until it goes live, members cannot subscribe to plans and
 *     would be locked out of workouts. Re-enable enforcement once the
 *     mobile build is approved and available in production.
 *     TODO: Remove the early return below to restore enforcement.
 */
export async function requireActiveSubscription(
  ctx: Ctx,
  organizationId: Id<"organizations">,
  userId: string,
): Promise<void> {
  // HOTFIX: bypass subscription enforcement until mobile app is live
  return;

  const { hasActiveSubscription, subscriptionStatus } =
    await checkSubscriptionStatus(ctx, organizationId, userId);

  if (!hasActiveSubscription) {
    if (subscriptionStatus === "suspended") {
      throw new Error(
        "Tu plan está suspendido por falta de pago. Realizá el pago para poder acceder a los entrenamientos.",
      );
    }
    throw new Error(
      "Necesitás un plan activo para acceder a los entrenamientos. Activá un plan desde la pestaña Plan.",
    );
  }
}

/**
 * Get active organization for the current user
 */
export async function getActiveOrganization(
  ctx: Ctx,
): Promise<Id<"organizations"> | null> {
  try {
    const membership = await requireCurrentOrganizationMembership(ctx);
    return membership.organizationId;
  } catch {
    return null;
  }
}
