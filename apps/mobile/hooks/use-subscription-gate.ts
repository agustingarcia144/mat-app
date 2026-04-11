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
 */
export function useSubscriptionGate(): {
  status: SubscriptionGateStatus;
  /** True when the member can access workouts and planifications */
  canAccess: boolean;
} {
  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription);

  // Still loading
  if (subscription === undefined) {
    return { status: "loading", canAccess: false };
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
