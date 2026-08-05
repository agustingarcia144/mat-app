"use client";

import DataTableSkeleton from "@/components/ui/data-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import OrganizationsTab from "@/components/features/platform/organizations-tab";
import CodesTab from "@/components/features/platform/codes/codes-tab";

export default function PlataformaPage() {
  const { isSuperAdmin, isLoading } = useIsSuperAdmin();

  if (isLoading) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <DataTableSkeleton columns={8} rows={10} />
      </DashboardPageContainer>
    );
  }

  // Gate the tabs on isSuperAdmin: every Convex query behind them throws for
  // everyone else, and an unguarded useQuery would surface that as a thrown
  // render error.
  if (!isSuperAdmin) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo super administradores pueden ver esta página.
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:py-10">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Plataforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las organizaciones de la app: cuándo se dieron de alta, por qué
          medio y con qué plan.
        </p>
      </div>

      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="organizations">Organizaciones</TabsTrigger>
          <TabsTrigger value="codes">Códigos</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <OrganizationsTab />
        </TabsContent>

        <TabsContent value="codes">
          <CodesTab />
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  );
}
