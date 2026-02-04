'use client'

import React from 'react'
import { ModeToggle } from '@/components/shared/theme/theme-toggle'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { useCurrentPageTitle } from '@/hooks/use-current-page-title'

function HeaderSection() {
  const title = useCurrentPageTitle()
  return (
    <header className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-6"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="line-clamp-1 text-lg font-medium">
                    {title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            </div>
        <ModeToggle />
    </header>
  )
}

export default HeaderSection