import { useQuery } from "convex/react";
import { api } from "@repo/convex";

export type SubscriptionGateStatus =
  | "loading"
  | "active"
  | "suspended"
  | "no_subscription";

/**
 * Hook that checks the current user's subscription status.
 * Returns a gate status that screens can use to decide whether to show
 * restricted content or a paywall.
 *
 * The subscription requirement only applies to users whose role is
 * "member". Staff (admins and trainers) are never gated, since they
 * don't hold plan subscriptions.
 *
 * When the organization has no active membership plans configured,
 * the gate is bypassed so members are not locked out of features
 * they have no way to unlock.
 */
export function useSubscriptionGate(): {
  status: SubscriptionGateStatus;
  /** True when the member can access workouts and planifications */
  canAccess: boolean;
} {
  const membership = useQuery(
    api.organizationMemberships.getCurrentMembership,
  );
  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription);
  const plans = useQuery(api.membershipPlans.getByOrganization, {});

  // Still loading
  if (
    membership === undefined ||
    subscription === undefined ||
    plans === undefined
  ) {
    return { status: "loading", canAccess: false };
  }

  // Only members are subject to the subscription gate. Staff (admins,
  // trainers) and anyone without a member role bypass enforcement.
  if (!membership || membership.role !== "member") {
    return { status: "active", canAccess: true };
  }

  // If the org has no active plans, bypass subscription enforcement
  if (plans.length === 0) {
    return { status: "active", canAccess: true };
  }

  // No subscription at all
  if (subscription === null) {
    return { status: "no_subscription", canAccess: false };
  }

  // Suspended
  if (subscription.status === "suspended") {
    return { status: "suspended", canAccess: false };
  }

  // Active (or any other non-cancelled status that getMySubscription returns)
  return { status: "active", canAccess: true };
}
