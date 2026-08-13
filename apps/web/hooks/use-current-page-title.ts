"use client";

import { usePathname } from "next/navigation";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";

const DASHBOARD_PREFIX = "/dashboard";

export type DashboardBreadcrumb = {
  label: string;
  /** Absolute path. Absent on the last crumb, which is the current page. */
  href?: string;
};

/** Flattened nav entries, each carrying the parent it should be nested under. */
type MatchCandidate = {
  label: string;
  url: string;
  parent?: { label: string; url: string };
};

function getMatchCandidates(): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const item of DASHBOARD_NAV_ITEMS) {
    candidates.push({ label: item.label, url: item.url });
    for (const child of item.children ?? []) {
      candidates.push({
        label: child.label,
        url: child.url,
        parent: { label: item.label, url: item.url },
      });
    }
  }
  // Sort by url length descending so nested routes match the most specific entry
  // e.g. /dashboard/metrics/churn matches "Churn", not "Metricas"
  return candidates.sort((a, b) => b.url.length - a.url.length);
}

function findMatch(pathname: string): MatchCandidate | undefined {
  return getMatchCandidates().find((candidate) => {
    const fullPath = `${DASHBOARD_PREFIX}${candidate.url}`;
    if (pathname === fullPath) return true;
    return candidate.url !== "/" && pathname.startsWith(`${fullPath}/`);
  });
}

/**
 * Breadcrumb trail for the current route: a single crumb for top-level pages,
 * and "Parent > Page" for pages that belong to a nav group such as Finanzas.
 */
export function useDashboardBreadcrumbs(): DashboardBreadcrumb[] {
  const pathname = usePathname();
  const match = findMatch(pathname) ?? {
    label: DASHBOARD_NAV_ITEMS[0].label,
    url: DASHBOARD_NAV_ITEMS[0].url,
  };

  if (!match.parent) return [{ label: match.label }];

  return [
    {
      label: match.parent.label,
      href: `${DASHBOARD_PREFIX}${match.parent.url}`,
    },
    { label: match.label },
  ];
}

export function useCurrentPageTitle(): string {
  const breadcrumbs = useDashboardBreadcrumbs();
  return breadcrumbs[breadcrumbs.length - 1].label;
}
