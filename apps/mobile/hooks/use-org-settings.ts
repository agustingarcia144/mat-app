import { useQuery } from "convex/react";
import { api } from "@repo/convex";

export function useOrgSettings() {
  return useQuery(api.organizationSettings.get);
}
