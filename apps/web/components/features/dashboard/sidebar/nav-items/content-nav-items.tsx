import React, { useMemo, useOptimistic, useTransition } from 'react'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { usePathname, useRouter } from 'next/navigation'
import { useOrganization } from '@clerk/nextjs'
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-nav'
import { useUnsavedNavigationGuard } from '@/contexts/unsaved-changes-context'
import { isOrgAdminRole } from '@/lib/security/roles'

export default function ContentNavItems() {
  const pathname = usePathname()
  const router = useRouter()
  const { membership } = useOrganization()
  const { requestNavigation } = useUnsavedNavigationGuard()
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname)
  const [, startTransition] = useTransition()

  const visibleNavItems = useMemo(() => {
    const isAdmin = isOrgAdminRole(membership?.role)
    return DASHBOARD_NAV_ITEMS.filter(
      (item) =>
        !('adminOnly' in item && item.adminOnly) || isAdmin
    )
  }, [membership?.role])

  const handleNavigation = (url: string) => {
    const dashboardUrl = `/dashboard${url}`
    if (!requestNavigation(dashboardUrl)) return
    startTransition(() => {
      setOptimisticPath(dashboardUrl)
      router.push(dashboardUrl)
    })
  }

  return (
    <SidebarMenu>
      {visibleNavItems.map((item) => {
        const isActive =
          optimisticPath === item.url ||
          optimisticPath === `/dashboard${item.url}`
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
        )
      })}
    </SidebarMenu>
  )
}
