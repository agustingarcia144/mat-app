"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import StaffSelect, { type StaffOption } from "./staff-select";

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export type ShiftDialogInitial = {
  userId?: string;
  date?: string; // YYYY-MM-DD (dated mode)
  dayOfWeek?: number; // 0-6 (model mode)
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
};

export type EditingShift =
  | { kind: "dated"; id: Id<"staffShifts"> }
  | { kind: "model"; id: Id<"staffShiftModelSlots"> };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "dated" | "model";
  staff: StaffOption[];
  initial?: ShiftDialogInitial;
  editing?: EditingShift | null;
};

function minutesToTime(minutes?: number) {
  if (minutes === undefined) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export default function StaffShiftDialog({
  open,
  onOpenChange,
  mode,
  staff,
  initial,
  editing,
}: Props) {
  const createShift = useMutation(api.staffShifts.create);
  const updateShift = useMutation(api.staffShifts.update);
  const removeShift = useMutation(api.staffShifts.remove);
  const createSlot = useMutation(api.staffShiftModelSlots.create);
  const updateSlot = useMutation(api.staffShiftModelSlots.update);
  const removeSlot = useMutation(api.staffShiftModelSlots.remove);

  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUserId(initial?.userId ?? null);
    setDate(initial?.date ?? "");
    setDayOfWeek(String(initial?.dayOfWeek ?? 1));
    setStartTime(initial?.startTime ?? "09:00");
    setEndTime(initial?.endTime ?? "13:00");
  }, [open, initial]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) {
      toast.error("Seleccioná un empleado.");
      return;
    }
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      toast.error("Ingresá horarios válidos.");
      return;
    }
    if (endMinutes <= startMinutes) {
      toast.error("El horario de fin debe ser posterior al de inicio.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "dated") {
        if (!date) {
          toast.error("Seleccioná una fecha.");
          setIsSubmitting(false);
          return;
        }
        const startTs = new Date(`${date}T${startTime}:00`).getTime();
        const endTs = new Date(`${date}T${endTime}:00`).getTime();
        if (editing?.kind === "dated") {
          await updateShift({
            id: editing.id,
            userId,
            startTime: startTs,
            endTime: endTs,
          });
        } else {
          await createShift({ userId, startTime: startTs, endTime: endTs });
        }
      } else {
        const day = Number(dayOfWeek);
        if (editing?.kind === "model") {
          await updateSlot({
            id: editing.id,
            userId,
            dayOfWeek: day,
            startTimeMinutes: startMinutes,
            endTimeMinutes: endMinutes,
          });
        } else {
          await createSlot({
            userId,
            dayOfWeek: day,
            startTimeMinutes: startMinutes,
            endTimeMinutes: endMinutes,
          });
        }
      }
      toast.success(editing ? "Turno actualizado" : "Turno agregado");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setIsDeleting(true);
    try {
      if (editing.kind === "dated") {
        await removeShift({ id: editing.id });
      } else {
        await removeSlot({ id: editing.id });
      }
      toast.success("Turno eliminado");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar turno" : "Agregar turno"}
          </DialogTitle>
          <DialogDescription>
            {mode === "model"
              ? "Turno recurrente de la semana modelo."
              : "Turno en una fecha específica."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel>Empleado</FieldLabel>
            <StaffSelect
              staff={staff}
              value={userId}
              onChange={setUserId}
              allowNone={false}
              placeholder="Seleccionar empleado…"
              disabled={isSubmitting}
            />
          </Field>

          {mode === "dated" ? (
            <Field>
              <FieldLabel htmlFor="shift-date">Fecha</FieldLabel>
              <Input
                id="shift-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel>Día</FieldLabel>
              <Select
                value={dayOfWeek}
                onValueChange={setDayOfWeek}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {DAY_LABELS[day]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="shift-start">Inicio</FieldLabel>
              <Input
                id="shift-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isSubmitting}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-end">Fin</FieldLabel>
              <Input
                id="shift-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isSubmitting}
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
