"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";

type OrganizationEntitlementGuardProps = {
  children: React.ReactNode;
};

const BILLING_PATH = "/dashboard/billing";

function moduleForPath(pathname: string) {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/dashboard/members")) return "members";
  if (pathname.startsWith("/dashboard/planifications")) return "planifications";
  if (pathname.startsWith("/dashboard/exercises")) return "exercises";
  if (pathname.startsWith("/dashboard/classes")) return "classes";
  if (pathname.startsWith("/dashboard/memberships")) return "payments";
  if (pathname.startsWith("/dashboard/payments")) return "payments";
  if (pathname.startsWith("/dashboard/finance")) return "finance";
  if (pathname.startsWith("/dashboard/income-expenses")) return "finance";
  // Exercise metrics has its own module so LITE orgs can reach it without
  // unlocking the rest of /dashboard/metrics.
  if (pathname.startsWith("/dashboard/metrics/exercises")) {
    return "metrics_exercises";
  }
  if (pathname.startsWith("/dashboard/metrics")) return "metrics";
  if (pathname.startsWith("/dashboard/users")) return "users";
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  // Super-admin-only platform view: gated by isSuperAdmin, not by billing.
  if (pathname.startsWith("/dashboard/platform")) return "dashboard";
  return "dashboard";
}

export default function OrganizationEntitlementGuard({
  children,
}: OrganizationEntitlementGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const entitlement = useOrganizationEntitlement();

  const isBillingPath = pathname.startsWith(BILLING_PATH);
  const isLoaded = entitlement !== undefined;
  const canAccessPath = useMemo(() => {
    if (!entitlement) return false;
    if (isBillingPath) return true;
    if (
      entitlement.billingStatus === "inactive" ||
      entitlement.billingStatus === "pending"
    ) {
      return false;
    }
    return entitlement.modules.includes(moduleForPath(pathname));
  }, [entitlement, isBillingPath, pathname]);

  useEffect(() => {
    if (!isLoaded || canAccessPath) return;
    if (
      entitlement?.billingStatus === "active" ||
      entitlement?.billingStatus === "grace_period"
    ) {
      router.replace(`${BILLING_PATH}?blocked=1`);
      return;
    }
    router.replace(BILLING_PATH);
  }, [canAccessPath, entitlement?.billingStatus, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Cargando suscripción...</p>
      </div>
    );
  }

  if (!canAccessPath) {
    return null;
  }

  return <>{children}</>;
}
