"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function SentryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isSignedIn, user } = useUser();
  const convexUser = useQuery(api.users.getCurrentUser, isSignedIn ? {} : "skip");
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    isSignedIn ? {} : "skip",
  );

  useEffect(() => {
    Sentry.setTag("route", pathname ?? "/");
  }, [pathname]);

  useEffect(() => {
    if (!isSignedIn) {
      Sentry.setUser(null);
      Sentry.setTag("auth_state", "anonymous");
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
      Sentry.setContext("organization", null);
      Sentry.setContext("convex_user", null);
      return;
    }

    const primaryEmail =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress;

    Sentry.setUser({
      id: convexUser?.externalId ?? user?.id,
      email: primaryEmail,
      username: user?.username ?? convexUser?.username ?? undefined,
    });
    Sentry.setTag("auth_state", "authenticated");

    if (convexUser) {
      Sentry.setContext("convex_user", {
        onboardingCompleted: convexUser.onboardingCompleted ?? false,
        onboardingStep1Completed: convexUser.onboardingStep1Completed ?? false,
      });
    } else {
      Sentry.setContext("convex_user", null);
    }

    if (currentMembership?.organization) {
      Sentry.setTag("organization_id", currentMembership.organization._id);
      Sentry.setTag("organization_role", currentMembership.role);
      Sentry.setContext("organization", {
        id: currentMembership.organization._id,
        name: currentMembership.organization.name,
        slug: currentMembership.organization.slug,
        role: currentMembership.role,
        status: currentMembership.status,
      });
    } else {
      Sentry.setTag("organization_id", "none");
      Sentry.setTag("organization_role", "none");
      Sentry.setContext("organization", null);
    }
  }, [isSignedIn, user, convexUser, currentMembership]);

  return children;
}
