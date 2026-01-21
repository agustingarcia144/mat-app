import React, { useOptimistic, useTransition } from 'react'
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar'
import { HomeIcon, UsersIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

export default function ContentNavItems() {

    const pathname = usePathname()
    const router = useRouter()
    const [optimisticPath, setOptimisticPath] = useOptimistic(pathname)
    const [isPending, startTransition] = useTransition()
  
    const handleNavigation = (url: string) => {
        const dashboardUrl = `/dashboard${url}`
        startTransition(() => {
            setOptimisticPath(dashboardUrl)
            router.push(dashboardUrl)
        })
    }
  
    const navItems = [
      {
        label: 'Inicio',
        icon: HomeIcon,
        url: '/',
      },
      {
        label: 'Miembros',
        icon: UsersIcon,
        url: '/members',
      },
    ]

  return (
    <SidebarMenu>
        {navItems.map((item) => {
            const isActive = optimisticPath === item.url || optimisticPath === `/dashboard${item.url}`
            return (
                <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton isActive={isActive} onClick={() => handleNavigation(item.url)}>
                            <item.icon className="size-4" />
                            <span className="truncate font-semibold">{item.label}</span>
                        </SidebarMenuButton>
                </SidebarMenuItem>
            )})}
    </SidebarMenu>
  )
}