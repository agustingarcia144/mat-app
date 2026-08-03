"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

/**
 * Platform-level super admin flag (users.isSuperAdmin).
 *
 * The query is skipped until Convex auth is ready — otherwise it resolves to
 * `null` for a signed-in user and would briefly report "not a super admin".
 */
export function useIsSuperAdmin() {
  const canQuery = useCanQueryCurrentOrganization();
  const user = useQuery(api.users.getCurrentUser, canQuery ? {} : "skip");

  return {
    isSuperAdmin: user?.isSuperAdmin === true,
    isLoading: !canQuery || user === undefined,
  };
}
