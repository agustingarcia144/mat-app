import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import DashboardProviders from '@/components/providers/dashboard-providers'
import HeaderSection from '@/components/features/dashboard/header/header-section'
import { AppSidebar } from '@/components/features/dashboard/sidebar/app-sidebar'
import { SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { UnsavedChangesProvider } from '@/contexts/unsaved-changes-context'
import { hasUserStaffOrganization } from '@/lib/security/user-org-access'
import { isOrgStaffRole, isWebStaffGuardEnabled } from '@/lib/security/roles'

async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) redirect('/sign-in')
  if (!orgId) redirect('/select-organization')
  if (isWebStaffGuardEnabled() && !isOrgStaffRole(orgRole)) {
    const hasStaffOrg = await hasUserStaffOrganization(userId)
    if (hasStaffOrg) redirect('/select-organization')
    redirect('/access-denied')
  }

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
