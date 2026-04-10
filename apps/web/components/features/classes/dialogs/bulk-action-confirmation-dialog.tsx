"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ScheduleWithClass = Doc<"classSchedules"> & {
  class?: { name: string };
};

interface BulkActionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "cancel" | "remove";
  scheduleIds: Id<"classSchedules">[];
  schedules: ScheduleWithClass[];
  onSuccess?: () => void;
}

export default function BulkActionConfirmationDialog({
  open,
  onOpenChange,
  action,
  scheduleIds,
  schedules,
  onSuccess,
}: BulkActionConfirmationDialogProps) {
  const bulkCancel = useMutation(api.classSchedules.bulkCancel);
  const bulkRemove = useMutation(api.classSchedules.bulkRemove);
  const [loading, setLoading] = useState(false);

  const selectedSchedules = schedules.filter((s) =>
    scheduleIds.includes(s._id),
  );
  const withReservations = selectedSchedules.filter(
    (s) => s.currentReservations > 0,
  );
  const totalReservations = withReservations.reduce(
    (acc, s) => acc + s.currentReservations,
    0,
  );
  const cancelledCount = selectedSchedules.filter(
    (s) => s.status === "cancelled",
  ).length;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (action === "cancel") {
        const result = await bulkCancel({ scheduleIds });
        toast.success(
          `Se cancelaron ${result.cancelledCount} turnos${result.skippedCount > 0 ? ` (${result.skippedCount} ya estaban cancelados)` : ""}.`,
        );
      } else {
        const result = await bulkRemove({ scheduleIds, force: true });
        toast.success(
          `Se eliminaron ${result.removedCount} turnos${result.skippedCount > 0 ? ` (${result.skippedCount} omitidos)` : ""}.`,
        );
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Error al ${action === "cancel" ? "cancelar" : "eliminar"} los turnos`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {action === "cancel"
              ? "Cancelar turnos seleccionados"
              : "Eliminar turnos seleccionados"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {action === "cancel"
                  ? `Se cancelarán ${scheduleIds.length} turnos. Los turnos quedarán en el calendario como cancelados.`
                  : `Se eliminarán permanentemente ${scheduleIds.length} turnos del calendario.`}
              </p>

              {cancelledCount > 0 && (
                <p className="text-sm">
                  {cancelledCount} turno(s) ya están cancelados y se omitirán.
                </p>
              )}

              {totalReservations > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-sm">
                    <strong>{withReservations.length} turnos</strong> tienen en
                    total <strong>{totalReservations} reservas</strong>. Se
                    notificará a los miembros afectados.
                  </p>
                </div>
              )}

              <p className="text-sm font-medium text-destructive">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>No, volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className={buttonVariants({ variant: "destructive" })}
          >
            {loading
              ? "Procesando..."
              : action === "cancel"
                ? `Sí, cancelar ${scheduleIds.length} turnos`
                : `Sí, eliminar ${scheduleIds.length} turnos`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
