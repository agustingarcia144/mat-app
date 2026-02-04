import React, { useOptimistic, useTransition } from 'react'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { usePathname, useRouter } from 'next/navigation'
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-nav'

export default function ContentNavItems() {
  const pathname = usePathname()
  const router = useRouter()
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname)
  const [, startTransition] = useTransition()

  const handleNavigation = (url: string) => {
    const dashboardUrl = `/dashboard${url}`
    startTransition(() => {
      setOptimisticPath(dashboardUrl)
      router.push(dashboardUrl)
    })
  }

  return (
    <SidebarMenu>
      {DASHBOARD_NAV_ITEMS.map((item) => {
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
