import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import DashboardProviders from '@/components/providers/dashboard-providers'
import HeaderSection from '@/components/features/dashboard/header/header-section'
import { AppSidebar } from '@/components/features/dashboard/sidebar/app-sidebar'
import DashboardPermissionGuard from '@/components/features/dashboard/dashboard-permission-guard'
import { SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes-context'

async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <DashboardProviders>
      <UnsavedChangesProvider>
        <DashboardPermissionGuard>
          <AppSidebar />
          <SidebarInset>
            <HeaderSection />
            <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {children}
            </main>
          </SidebarInset>
        </DashboardPermissionGuard>
        <Toaster />
      </UnsavedChangesProvider>
    </DashboardProviders>
  )
}

export default DashboardLayout
