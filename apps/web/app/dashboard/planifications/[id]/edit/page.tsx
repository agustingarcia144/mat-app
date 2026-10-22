"use client";

import { use, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";
import { ArrowLeft, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import PlanificationEditForm from "@/components/features/planifications/form/planification-edit-form";
import EditPlanificationDialog from "@/components/features/planifications/dialogs/edit-planification-dialog";
import { useUnsavedNavigationGuard } from "@/contexts/unsaved-changes-context";

export default function EditPlanificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { requestNavigation } = useUnsavedNavigationGuard();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  });

  const handleBackClick = () => {
    const targetPath = `/dashboard/planifications/${id}`;
    if (!requestNavigation(targetPath)) return;
    router.push(targetPath);
  };

  // Radix (e.g. DropdownMenu) can leave body with pointer-events: none when
  // closing during navigation, making the new page unclickable. Clear it on mount.
  useEffect(() => {
    const cleanup = () => {
      document.body.style.pointerEvents = "";
    };
    cleanup();
    return () => cleanup();
  }, []);

  if (planification === undefined) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-3 py-6 md:px-6 md:py-8">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!planification) {
    return (
      <div className="w-full py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-6 md:px-6 md:py-8">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2 gap-2 px-2 text-muted-foreground"
        onClick={handleBackClick}
        aria-label="Volver"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span className="sr-only md:not-sr-only">Volver</span>
      </Button>
      <div className="w-full">
        <div className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Editar planificación
              </p>
              <h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">
                {planification.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Organizá las semanas y abrí un día para preparar su
                entrenamiento.
              </p>
            </div>
            <ResponsiveActionButton
              type="button"
              onClick={() => setEditDialogOpen(true)}
              icon={<Pencil className="h-4 w-4" aria-hidden />}
              variant="outline"
              label="Información básica"
              tooltip="Editar información básica"
            />
          </div>
        </div>

        <EditPlanificationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
        <PlanificationEditForm />
      </div>
    </div>
  );
}
