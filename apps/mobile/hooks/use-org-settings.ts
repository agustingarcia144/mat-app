import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@repo/convex";

export function useOrgSettings() {
  const { isAuthenticated } = useConvexAuth();

  return useQuery(
    api.organizationSettings.get,
    isAuthenticated ? {} : "skip",
  );
}
