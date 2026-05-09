"use client";

import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";

export function FeatureDisabledPage({ featureName }: { featureName: string }) {
  return (
    <DashboardPageContainer>
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <h2 className="text-lg font-semibold">Modulo desactivado</h2>
        <p className="text-sm text-muted-foreground">
          {featureName} esta desactivado para esta organizacion. Un
          administrador puede activarlo desde Configuracion.
        </p>
      </div>
    </DashboardPageContainer>
  );
}
