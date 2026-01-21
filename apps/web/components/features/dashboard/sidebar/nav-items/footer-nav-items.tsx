import React, { Suspense } from 'react'
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, } from '@/components/ui/sidebar'
import { useClerk, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import { ChevronsUpDown } from 'lucide-react'


export default function FooterNavItems() {
    const { openUserProfile } = useClerk()
    const { user } = useUser()
  return (
    <Suspense fallback={<SidebarMenuSkeleton />}>
      <SidebarMenu>
        <SidebarMenuItem>
            <SidebarMenuButton size='lg' onClick={() => openUserProfile()}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                    <Image src={user?.imageUrl || ''} alt={user?.fullName || ''} width={32} height={32} className="rounded-full" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.emailAddresses[0].emailAddress}</span>
                </div>
                <ChevronsUpDown className="size-4" />
            </SidebarMenuButton>
        </SidebarMenuItem>  
        </SidebarMenu>
    </Suspense>
  )
}

