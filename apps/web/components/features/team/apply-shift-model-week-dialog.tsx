"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { addDays, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ApplyShiftModelWeekDialog({
  open,
  onOpenChange,
}: Props) {
  const canQueryOrgData = useCanQueryCurrentOrganization();
  const [targetRange, setTargetRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [actionLoading, setActionLoading] = useState(false);

  const modelSlots = useQuery(
    api.staffShiftModelSlots.listByOrganization,
    open && canQueryOrgData ? {} : "skip",
  );
  const applyModelWeek = useMutation(api.staffShiftModelSlots.applyToDateRange);

  const hasSlots = (modelSlots?.length ?? 0) > 0;

  // Applying to past weeks is allowed on purpose: si el admin se olvidó de
  // generar los turnos, necesita cargarlos retroactivamente para poder liquidar
  // los sueldos de ese período.
  const includesPastWeeks = useMemo(() => {
    if (!targetRange?.from) return false;
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return (
      startOfWeek(targetRange.from, { weekStartsOn: 1 }).getTime() <
      currentWeekStart.getTime()
    );
  }, [targetRange]);

  const handleSubmit = async () => {
    if (!hasSlots) {
      toast.error("La semana modelo está vacía. Agregá turnos primero.");
      return;
    }
    if (!targetRange?.from) {
      toast.error("Seleccioná un rango de fechas.");
      return;
    }

    const rangeFrom = targetRange.from;
    const rangeTo = targetRange.to ?? rangeFrom;

    const targetStartWeek = startOfWeek(rangeFrom, { weekStartsOn: 1 });
    const targetEndWeek = startOfWeek(rangeTo, { weekStartsOn: 1 });

    const targetWeekStarts: number[] = [];
    let current = targetStartWeek;
    while (current.getTime() <= targetEndWeek.getTime()) {
      targetWeekStarts.push(current.getTime());
      current = addDays(current, 7);
    }

    if (targetWeekStarts.length === 0) {
      toast.error("Seleccioná al menos una semana válida.");
      return;
    }

    setActionLoading(true);
    try {
      const result = await applyModelWeek({ targetWeekStarts });
      toast.success(`Se generaron ${result.createdShifts} turnos.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al aplicar la semana modelo.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTargetRange(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar semana modelo</DialogTitle>
          <DialogDescription>
            Genera turnos reales a partir de la semana modelo en el rango de
            fechas seleccionado. Los turnos generados anteriormente en esas
            semanas se reemplazan.
            {modelSlots !== undefined && (
              <span className="mt-1 block text-xs">
                Semana modelo: {modelSlots.length} turno(s)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Rango de fechas</FieldLabel>
          <FieldDescription>
            Los turnos se generarán para cada semana del rango seleccionado.
          </FieldDescription>
          <Calendar
            mode="range"
            selected={targetRange}
            onSelect={(range) => setTargetRange(range)}
            numberOfMonths={2}
            showOutsideDays={false}
            locale={es}
            disabled={actionLoading}
            className="rounded-md border"
          />
          {includesPastWeeks && (
            <FieldDescription className="text-amber-600 dark:text-amber-500">
              El rango incluye semanas pasadas. Los turnos se generarán
              igualmente para que puedas liquidar sueldos atrasados; si ese
              período ya fue pagado, revisá los montos después de aplicar.
            </FieldDescription>
          )}
        </Field>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={actionLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={actionLoading || !hasSlots || modelSlots === undefined}
          >
            Aplicar semana modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
