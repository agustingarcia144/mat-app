"use client";

import { useMemo } from "react";
import { type Doc } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

const DAYS_OF_WEEK: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function formatSlotTime(startTimeMinutes: number) {
  const h = Math.floor(startTimeMinutes / 60);
  const m = startTimeMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

type FixedSlotWithDetails = Doc<"fixedClassSlots"> & {
  className: string | null;
  userFullName: string;
};

type SlotInfo = {
  className: string | null;
  dayOfWeek: number;
  startTimeMinutes: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedSlots?: FixedSlotWithDetails[];
  slotInfoFallback?: SlotInfo;
};

export default function FixedSlotScheduleDetailDialog({
  open,
  onOpenChange,
  fixedSlots,
  slotInfoFallback,
}: Props) {
  const slotInfo = useMemo(() => {
    const first = fixedSlots?.[0];
    if (first) {
      return {
        className: first.className,
        dayOfWeek: first.dayOfWeek,
        startTimeMinutes: first.startTimeMinutes,
      };
    }

    return slotInfoFallback ?? null;
  }, [fixedSlots, slotInfoFallback]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Turno fijo
          </DialogTitle>
          <DialogDescription>
            {slotInfo ? (
              <span>
                {slotInfo.className ?? "Clase"} ·{" "}
                {DAYS_OF_WEEK.find((d) => d.value === slotInfo.dayOfWeek)
                  ?.label ?? slotInfo.dayOfWeek}
                {" · "}
                {formatSlotTime(slotInfo.startTimeMinutes)}
              </span>
            ) : fixedSlots === undefined ? (
              "Cargando..."
            ) : (
              "Sin turno fijo"
            )}
          </DialogDescription>
        </DialogHeader>

        {fixedSlots === undefined ? (
          <div className="py-8 text-center text-muted-foreground">
            Cargando...
          </div>
        ) : fixedSlots.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No hay miembros con turno fijo para este horario.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {fixedSlots.length} miembro{fixedSlots.length === 1 ? "" : "s"}
              </Badge>
              {slotInfo?.className ? (
                <Badge variant="outline">{slotInfo.className}</Badge>
              ) : null}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Miembro</th>
                    <th className="text-left p-3 font-medium">Día</th>
                    <th className="text-left p-3 font-medium">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedSlots
                    .slice()
                    .sort((a, b) =>
                      a.userFullName.localeCompare(b.userFullName),
                    )
                    .map((slot) => (
                      <tr
                        key={slot._id}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="p-3">
                          {slot.userFullName ?? slot.userId}
                        </td>
                        <td className="p-3">
                          {DAYS_OF_WEEK.find((d) => d.value === slot.dayOfWeek)
                            ?.label ?? slot.dayOfWeek}
                        </td>
                        <td className="p-3 flex items-center gap-1">
                          {formatSlotTime(slot.startTimeMinutes)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
