'use client'

import * as React from 'react'

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar'
import HeaderNavItems from './nav-items/header-nav-items'
import FooterNavItems from './nav-items/footer-nav-items'
import ContentNavItems from './nav-items/content-nav-items'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <HeaderNavItems />
      </SidebarHeader>
      <SidebarContent className="p-2">
        <ContentNavItems />
      </SidebarContent>
      <SidebarFooter>
        <FooterNavItems />
      </SidebarFooter>
    </Sidebar>
  )
}