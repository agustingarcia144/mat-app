"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useOrganizationEntitlement() {
  return useQuery(api.organizationBilling.getCurrentEntitlement);
}
