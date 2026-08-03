import React, { useMemo, useOptimistic, useTransition } from "react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import { useUnsavedNavigationGuard } from "@/contexts/unsaved-changes-context";
import { isOrgAdminRole } from "@/lib/security/roles";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import { api } from "@/convex/_generated/api";

export default function ContentNavItems() {
  const pathname = usePathname();
  const router = useRouter();
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const settings = useOrgSettings();
  const entitlement = useOrganizationEntitlement();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { requestNavigation } = useUnsavedNavigationGuard();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);
  const [, startTransition] = useTransition();

  const visibleNavItems = useMemo(() => {
    const isAdmin = isOrgAdminRole(membership?.role);
    const allowedModules = new Set(entitlement?.modules ?? []);
    return DASHBOARD_NAV_ITEMS.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (item.adminOnly && !isAdmin) return false;
      if (entitlement && !allowedModules.has(item.billingModule)) return false;
      if (item.featureFlag && settings) {
        if (!settings[item.featureFlag]) return false;
      }
      return true;
    });
  }, [entitlement, isSuperAdmin, membership?.role, settings]);

  const handleNavigation = (url: string) => {
    const dashboardUrl = `/dashboard${url}`;
    if (!requestNavigation(dashboardUrl)) return;
    startTransition(() => {
      setOptimisticPath(dashboardUrl);
      router.push(dashboardUrl);
    });
  };

  return (
    <SidebarMenu>
      {visibleNavItems.map((item) => {
        const isActive =
          optimisticPath === item.url ||
          optimisticPath === `/dashboard${item.url}`;
        return (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton
              isActive={isActive}
              onClick={() => handleNavigation(item.url)}
            >
              <item.icon className="size-4" />
              <span className="truncate">{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
