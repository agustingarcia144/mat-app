import React from 'react'
import Image from 'next/image'
import { useOrganization } from '@clerk/nextjs'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar'

export default function HeaderNavItems() {
  const { organization, isLoaded } = useOrganization()

  if (!isLoaded) {
    return <SidebarMenuSkeleton />
  }

  // TODO: Add Custom Modal to edit organization

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg">
          {organization?.imageUrl ? (
            <Image
              src={organization.imageUrl}
              alt={organization?.name || 'Organization'}
              width={32}
              height={32}
              className="rounded-sm"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-sm bg-muted text-muted-foreground">
              <span className="text-xs font-semibold">
                {organization?.name?.charAt(0).toUpperCase() || 'O'}
              </span>
            </div>
          )}
          <div className="grid flex-1 text-left text-sm leading-tight max-w-42">
            <span className="truncate font-semibold">{organization?.name}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
