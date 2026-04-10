"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isOrgStaffRole, isWebStaffGuardEnabled } from "@/lib/security/roles";

export default function StaffWebGuard() {
  const router = useRouter();
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
  );
  const staffOrganizations = useQuery(
    api.organizationMemberships.getMyStaffOrganizations,
  );

  useEffect(() => {
    if (!isWebStaffGuardEnabled()) return;
    if (currentMembership === undefined || staffOrganizations === undefined)
      return;
    if (isOrgStaffRole(currentMembership?.role)) return;

    if (staffOrganizations.length > 0) {
      router.replace("/select-organization");
      return;
    }

    router.replace("/access-denied");
  }, [currentMembership, router, staffOrganizations]);

  return null;
}
