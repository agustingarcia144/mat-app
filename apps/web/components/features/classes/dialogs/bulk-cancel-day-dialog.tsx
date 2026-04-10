"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ScheduleWithClass = Doc<"classSchedules"> & {
  class?: { name: string };
};

interface BulkCancelDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayDate: Date;
  schedules: ScheduleWithClass[];
}

export default function BulkCancelDayDialog({
  open,
  onOpenChange,
  dayDate,
  schedules,
}: BulkCancelDayDialogProps) {
  const bulkCancel = useMutation(api.classSchedules.bulkCancel);
  const bulkRemove = useMutation(api.classSchedules.bulkRemove);
  const [loading, setLoading] = useState(false);

  // Filter out already-cancelled schedules
  const activeSchedules = schedules.filter((s) => s.status !== "cancelled");
  const schedulesWithReservations = activeSchedules.filter(
    (s) => s.currentReservations > 0,
  );
  const totalReservations = schedulesWithReservations.reduce(
    (acc, s) => acc + s.currentReservations,
    0,
  );

  const handleBulkCancel = async () => {
    if (activeSchedules.length === 0) return;

    setLoading(true);
    try {
      const result = await bulkCancel({
        scheduleIds: activeSchedules.map((s) => s._id),
      });
      toast.success(
        `Se cancelaron ${result.cancelledCount} turnos${result.skippedCount > 0 ? ` (${result.skippedCount} omitidos)` : ""}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al cancelar los turnos",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRemove = async () => {
    if (activeSchedules.length === 0) return;

    setLoading(true);
    try {
      const result = await bulkRemove({
        scheduleIds: activeSchedules.map((s) => s._id),
        force: true,
      });
      toast.success(
        `Se eliminaron ${result.removedCount} turnos${result.skippedCount > 0 ? ` (${result.skippedCount} omitidos)` : ""}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar los turnos",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Turnos del {format(dayDate, "EEEE d 'de' MMMM", { locale: es })}
          </DialogTitle>
          <DialogDescription>
            Cancela o elimina todos los turnos de este día.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Turnos activos
              </div>
              <div className="text-lg font-semibold">
                {activeSchedules.length}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Con reservas
              </div>
              <div className="text-lg font-semibold">
                {schedulesWithReservations.length}
              </div>
            </div>
          </div>

          {/* Warning */}
          {totalReservations > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-sm text-muted-foreground">
                <p>
                  Hay <strong>{totalReservations} reservas</strong> en los
                  turnos de este día. Al cancelar o eliminar, se notificará a
                  los miembros afectados.
                </p>
              </div>
            </div>
          )}

          {/* Schedule list */}
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {activeSchedules.map((schedule) => (
              <div
                key={schedule._id}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {schedule.class?.name ?? "Clase"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(schedule.startTime), "HH:mm")} -{" "}
                    {format(new Date(schedule.endTime), "HH:mm")}
                  </p>
                </div>
                {schedule.currentReservations > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {schedule.currentReservations} reservas
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {activeSchedules.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No hay turnos activos para este día.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Volver
          </Button>
          <Button
            variant="outline"
            onClick={handleBulkCancel}
            disabled={loading || activeSchedules.length === 0}
          >
            Cancelar turnos
          </Button>
          <Button
            variant="destructive"
            onClick={handleBulkRemove}
            disabled={loading || activeSchedules.length === 0}
          >
            Eliminar turnos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
