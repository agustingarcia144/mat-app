import React, { Suspense } from 'react'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar'
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
          <SidebarMenuButton size="lg" onClick={() => openUserProfile()}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
              {user?.imageUrl ? (
                <Image
                  src={user.imageUrl}
                  alt={user?.fullName || 'User'}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <span className="text-xs font-semibold">
                    {user?.fullName?.charAt(0).toUpperCase() ||
                      user?.emailAddresses[0]?.emailAddress
                        ?.charAt(0)
                        .toUpperCase() ||
                      'U'}
                  </span>
                </div>
              )}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight max-w-42">
              <span className="truncate font-semibold">{user?.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user?.emailAddresses[0].emailAddress}
              </span>
            </div>
            <ChevronsUpDown className="size-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </Suspense>
  )
}
