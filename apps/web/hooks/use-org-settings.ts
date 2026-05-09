"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useOrgSettings() {
  return useQuery(api.organizationSettings.get);
}
