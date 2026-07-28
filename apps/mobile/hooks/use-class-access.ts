import { useQuery } from "convex/react";
import { api } from "@repo/convex";

/**
 * What classes the signed-in member's plan gives access to.
 *
 * Staff, members without a subscription, and plans without a class restriction
 * all get full access (`classesEnabled: true`, `allowedClassIds: null`).
 */
export function useClassAccess(): {
  /** False when the plan grants no class access at all */
  classesEnabled: boolean;
  /** Class ids the member may attend; `null` means every class */
  allowedClassIds: string[] | null;
  isLoading: boolean;
} {
  const access = useQuery(api.classAccess.getMyClassAccess, {});

  return {
    classesEnabled: access?.classesEnabled ?? true,
    allowedClassIds: access?.allowedClassIds ?? null,
    isLoading: access === undefined,
  };
}
