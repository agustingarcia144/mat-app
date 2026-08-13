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
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import type { DashboardNavSubItem } from "@/lib/dashboard-nav";
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
    const isSubItemVisible = (subItem: DashboardNavSubItem) => {
      if (subItem.adminOnly && !isAdmin) return false;
      if (subItem.featureFlag && settings && !settings[subItem.featureFlag]) {
        return false;
      }
      return true;
    };
    return DASHBOARD_NAV_ITEMS.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (item.adminOnly && !isAdmin) return false;
      if (entitlement && !allowedModules.has(item.billingModule)) return false;
      if (item.featureFlag && settings) {
        if (!settings[item.featureFlag]) return false;
      }
      return true;
    }).map((item) => ({
      ...item,
      children: item.children?.filter(isSubItemVisible) ?? [],
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
                onClick={() => handleNavigation(item.url)}
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
                onClick={() => handleNavigation(item.url)}
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
