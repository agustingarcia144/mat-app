import DashboardProviders from '@/components/providers/dashboard-providers'
import HeaderSection from '@/components/features/dashboard/header/header-section'
import { AppSidebar } from '@/components/features/dashboard/sidebar/app-sidebar'
import { SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes-context'

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      <UnsavedChangesProvider>
        <AppSidebar />
        <SidebarInset>
          <HeaderSection />
          <main className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</main>
        </SidebarInset>
        <Toaster />
      </UnsavedChangesProvider>
    </DashboardProviders>
  )
}

export default DashboardLayout
