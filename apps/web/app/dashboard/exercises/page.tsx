"use client";

import ExerciseLibrary from "@/components/features/planifications/exercises/exercise-library";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { FeatureDisabledPage } from "@/components/shared/feature-disabled-page";

export default function EjerciciosPage() {
  const orgSettings = useOrgSettings();

  if (orgSettings && !orgSettings.planificationsEnabled) {
    return <FeatureDisabledPage featureName="Ejercicios" />;
  }

  return (
    <DashboardPageContainer className="py-4 md:py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">Ejercicios</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Gestiona la biblioteca de ejercicios de tu organización
        </p>
      </div>

      <ExerciseLibrary showActions />
    </DashboardPageContainer>
  );
}
