import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import DashboardProviders from "@/components/providers/dashboard-providers";
import HeaderSection from "@/components/features/dashboard/header/header-section";
import { AppSidebar } from "@/components/features/dashboard/sidebar/app-sidebar";
import DashboardPermissionGuard from "@/components/features/dashboard/dashboard-permission-guard";
import OrganizationEntitlementGuard from "@/components/features/dashboard/organization-entitlement-guard";
import TrialBanner from "@/components/features/dashboard/trial-banner";
import { SidebarInset } from "@/components/ui/sidebar";
import { UnsavedChangesProvider } from "@/contexts/unsaved-changes-context";
import { MatiAssistantProvider } from "@/components/features/ai/mati-assistant-provider";

async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <DashboardProviders>
      <UnsavedChangesProvider>
        <DashboardPermissionGuard>
          <OrganizationEntitlementGuard>
            <MatiAssistantProvider>
              <AppSidebar />
              <SidebarInset>
                <HeaderSection />
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
                  <TrialBanner />
                  {children}
                </main>
              </SidebarInset>
            </MatiAssistantProvider>
          </OrganizationEntitlementGuard>
        </DashboardPermissionGuard>
      </UnsavedChangesProvider>
    </DashboardProviders>
  );
}

export default DashboardLayout;
