import { useQuery } from "convex/react";
import { api } from "@repo/convex";

export function useCurrentMembership() {
  return useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    {},
  );
}
