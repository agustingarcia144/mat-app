import React from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'

function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      {children}
    </SidebarProvider>
  )
}

export default DashboardProviders