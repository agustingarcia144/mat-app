import { useQuery } from "convex/react";
import { api } from "@repo/convex";

export type SubscriptionGateStatus =
  | "loading"
  | "active"
  | "suspended"
  | "pending_payment"
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
 *
 * This gate is a convenience for the UI, not a security boundary: every
 * query and mutation behind it re-checks access on the server.
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

  // A plan was chosen but never paid for. Choosing a plan — and even
  // authorizing an automatic debit — grants nothing until the first payment
  // is approved, so this is treated as locked, not as a lesser kind of active.
  if (subscription.status === "pending_payment") {
    return { status: "pending_payment", canAccess: false };
  }

  // Suspended
  if (subscription.status === "suspended") {
    return { status: "suspended", canAccess: false };
  }

  // Active. This deliberately includes a member inside the grace period after
  // a failed renewal: the server keeps them active until the grace deadline,
  // and locking them out early would contradict what they were told.
  return { status: "active", canAccess: true };
}
