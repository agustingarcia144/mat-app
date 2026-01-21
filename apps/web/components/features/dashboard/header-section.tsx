import React from 'react'
import { ModeToggle } from '@/components/shared/theme/theme-toggle'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@/components/ui/breadcrumb'

function HeaderSection({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between p-4">
      <div className="flex items-center">
        <SidebarTrigger />
        <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="line-clamp-1">
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