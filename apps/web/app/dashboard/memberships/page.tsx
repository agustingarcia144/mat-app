"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import PlanList from "@/components/features/payments/plan-list";
import { WalletCardDesigner } from "@/components/features/rewards/wallet-card-designer";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

type WalletSettings = Parameters<
  typeof WalletCardDesigner
>[0]["rewardSettings"]["walletCard"];

export default function MembershipsPage() {
  const dashboard = useQuery(api.rewards.getAdminDashboard);
  const [savedWallet, setSavedWallet] = useState<WalletSettings | null>(null);

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Membresías
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Configurá los planes disponibles para tus socios y personalizá sus
          tarjetas para Apple Wallet y Google Wallet.
        </p>
      </div>

      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans">Planes</TabsTrigger>
          <TabsTrigger value="wallet">Tarjetas Wallet</TabsTrigger>
        </TabsList>

        <TabsContent value="plans">
          <PlanList />
        </TabsContent>

        <TabsContent value="wallet">
          {!dashboard ? (
            <div className="flex min-h-80 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <WalletCardDesigner
              organizationName={dashboard.organizationName}
              organizationLogoUrl={dashboard.organizationLogoUrl}
              rewardSettings={
                {
                  ...dashboard.settings,
                  walletCard: savedWallet ?? dashboard.settings.walletCard,
                } as never
              }
              plans={dashboard.membershipPlans as never}
              initialAssets={dashboard.walletDesignAssets as never}
              onSaved={setSavedWallet}
            />
          )}
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  );
}
