'use client'

import { usePathname } from 'next/navigation'
import { DASHBOARD_NAV_ITEMS } from '@/lib/dashboard-nav'

const DASHBOARD_PREFIX = '/dashboard'

export function useCurrentPageTitle(): string {
  const pathname = usePathname()

  // Sort by url length descending so nested routes match the most specific nav item
  // e.g. /dashboard/planifications/123 matches "Planificaciones" not "Inicio"
  const sortedItems = [...DASHBOARD_NAV_ITEMS].sort(
    (a, b) => b.url.length - a.url.length
  )

  for (const item of sortedItems) {
    const fullPath = `${DASHBOARD_PREFIX}${item.url}`
    const isExactMatch = pathname === fullPath
    const isNestedMatch =
      item.url !== '/' && pathname.startsWith(`${fullPath}/`)
    if (isExactMatch || isNestedMatch) {
      return item.label
    }
  }

  return DASHBOARD_NAV_ITEMS[0].label
}
