import DashboardProviders from '@/components/providers/dashboard-providers'
import HeaderSection from '@/components/features/dashboard/header-section'
import { AppSidebar } from '@/components/features/dashboard/sidebar/app-sidebar'
import { SidebarInset } from '@/components/ui/sidebar'

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      <AppSidebar />
      <SidebarInset>
        <HeaderSection title="Inicio" />
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
          <div className="min-h- flex-1 rounded-xl bg-muted/50 md:min-h-min" />
        </main>
      </SidebarInset>
    </DashboardProviders>
  )
}

export default DashboardLayout