
import React, { Suspense} from 'react'
import Image from 'next/image'
import { useOrganization, useClerk } from '@clerk/nextjs'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton } from '@/components/ui/sidebar'


export default function HeaderNavItems() {
  const { organization } = useOrganization()
  const { openOrganizationProfile } = useClerk()
  return (
    <Suspense fallback={<SidebarMenuSkeleton />}>
      <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' onClick={() => openOrganizationProfile()}>
                    <Image src={organization?.imageUrl || ''} alt={organization?.name || ''} width={32} height={32} className="rounded-sm" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{organization?.name}</span>
                </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
    </Suspense>
  )
}


