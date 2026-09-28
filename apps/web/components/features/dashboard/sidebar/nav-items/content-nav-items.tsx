import React, { useMemo, useOptimistic, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import type {
  DashboardNavItem,
  DashboardNavSubItem,
} from "@/lib/dashboard-nav";
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
  /** Only holds groups the user toggled by hand; the rest follow the active route. */
  const [toggledGroups, setToggledGroups] = useState<Record<string, boolean>>(
    {},
  );

  const visibleNavItems = useMemo(() => {
    const isAdmin = isOrgAdminRole(membership?.role);
    const allowedModules = new Set(entitlement?.modules ?? []);
    // Fails closed: while the entitlement is still loading nothing is allowed,
    // so a module the gym does not have never flashes into the sidebar before
    // the query resolves.
    const isModuleAllowed = (module: string) =>
      entitlement != null && allowedModules.has(module);
    const isSubItemVisible = (
      subItem: DashboardNavSubItem,
      parent: DashboardNavItem,
    ) => {
      if ((subItem.adminOnly ?? parent.adminOnly) && !isAdmin) return false;
      if (subItem.featureFlag && settings && !settings[subItem.featureFlag]) {
        return false;
      }
      return isModuleAllowed(subItem.billingModule ?? parent.billingModule);
    };
    return DASHBOARD_NAV_ITEMS.map((item) => ({
      ...item,
      children:
        item.children?.filter((subItem) => isSubItemVisible(subItem, item)) ??
        [],
    }))
      .filter((item) => {
        if (item.superAdminOnly) return isSuperAdmin;
        const canAccessParent =
          (!item.adminOnly || isAdmin) && isModuleAllowed(item.billingModule);
        // A group stays visible when a child has its own allowed module, so a
        // user who cannot access its landing page can still reach an explicitly
        // available child (for example, reception staff opening QR check-in).
        if (!canAccessParent && item.children.length === 0) {
          return false;
        }
        if (item.featureFlag && settings) {
          if (!settings[item.featureFlag]) return false;
        }
        return true;
      })
      .map((item) => ({
        ...item,
        // The group header must not link to a page blocked by role or plan.
        navigationUrl:
          (!item.adminOnly || isAdmin) && isModuleAllowed(item.billingModule)
          ? item.url
          : (item.children[0]?.url ?? item.url),
      }));
  }, [entitlement, isSuperAdmin, membership?.role, settings]);

  const handleNavigation = (url: string) => {
    const dashboardUrl = `/dashboard${url}`;
    if (!requestNavigation(dashboardUrl)) return;
    startTransition(() => {
      setOptimisticPath(dashboardUrl);
      router.push(dashboardUrl);
    });
  };

  // Module filtering fails closed, so until the entitlement arrives there is
  // nothing safe to show. A skeleton keeps the sidebar from collapsing to
  // empty for that moment.
  if (entitlement === undefined) {
    return (
      <SidebarMenu>
        {Array.from({ length: 6 }).map((_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      {visibleNavItems.map((item) => {
        const isActive =
          optimisticPath === item.url ||
          optimisticPath === `/dashboard${item.url}`;

        if (item.children.length === 0) {
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                isActive={isActive}
                onClick={() => handleNavigation(item.navigationUrl)}
              >
                <item.icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        const isChildActive = (subItem: DashboardNavSubItem) =>
          optimisticPath === `/dashboard${subItem.url}` ||
          optimisticPath.startsWith(`/dashboard${subItem.url}/`);
        const hasActiveChild = item.children.some(isChildActive);
        const isOpen = toggledGroups[item.url] ?? (isActive || hasActiveChild);

        return (
          <Collapsible
            key={item.url}
            asChild
            open={isOpen}
            onOpenChange={(open) =>
              setToggledGroups((prev) => ({ ...prev, [item.url]: open }))
            }
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isActive}
                onClick={() => handleNavigation(item.navigationUrl)}
              >
                <item.icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction className="transition-transform data-[state=open]:rotate-90">
                  <ChevronRight />
                  <span className="sr-only">
                    {`Mostrar secciones de ${item.label}`}
                  </span>
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.children.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.url}>
                      {/* w-full: the rendered <button> would otherwise shrink to
                          fit its label instead of filling the submenu. */}
                      <SidebarMenuSubButton
                        asChild
                        isActive={isChildActive(subItem)}
                        className="w-full"
                      >
                        <button
                          type="button"
                          onClick={() => handleNavigation(subItem.url)}
                        >
                          <subItem.icon className="size-4" />
                          <span className="truncate">{subItem.label}</span>
                        </button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}
