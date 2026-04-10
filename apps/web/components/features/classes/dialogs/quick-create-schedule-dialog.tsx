"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const MINUTES_OPTIONS = [0, 15, 30, 45];

interface QuickCreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  initialHour: number;
  classes: Doc<"classes">[];
}

export default function QuickCreateScheduleDialog({
  open,
  onOpenChange,
  initialDate,
  initialHour,
  classes,
}: QuickCreateScheduleDialogProps) {
  const createSchedule = useMutation(api.classSchedules.create);

  const [classId, setClassId] = useState("");
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setClassId("");
    setHour(initialHour);
    setMinute(0);
    setDurationMinutes(60);
    setCapacity("");
    setNotes("");
  }, [open, initialHour]);

  const selectedClass = classes.find((c) => c._id === classId);

  const handleSubmit = async () => {
    if (!classId) {
      toast.error("Selecciona una clase");
      return;
    }
    if (durationMinutes < 5 || durationMinutes > 480) {
      toast.error("La duración debe estar entre 5 y 480 minutos");
      return;
    }

    const startDate = new Date(initialDate);
    startDate.setHours(hour, minute, 0, 0);
    const startTime = startDate.getTime();
    const endTime = startTime + durationMinutes * 60 * 1000;

    const capacityValue = capacity
      ? Number(capacity)
      : selectedClass?.capacity;

    if (!capacityValue || capacityValue < 1) {
      toast.error("La capacidad debe ser mayor a 0");
      return;
    }

    setLoading(true);
    try {
      await createSchedule({
        classId: classId as Id<"classes">,
        startTime,
        endTime,
        capacity: capacityValue,
        notes: notes || undefined,
      });
      toast.success("Turno creado");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear el turno",
      );
    } finally {
      setLoading(false);
    }
  };

  const activeClasses = classes.filter((c) => c.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear turno</DialogTitle>
          <DialogDescription>
            {format(initialDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Class selector */}
          <Field>
            <FieldLabel>Clase</FieldLabel>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una clase" />
              </SelectTrigger>
              <SelectContent>
                {activeClasses.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Hora</FieldLabel>
              <Select
                value={String(hour)}
                onValueChange={(v) => setHour(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i.toString().padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Minutos</FieldLabel>
              <Select
                value={String(minute)}
                onValueChange={(v) => setMinute(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m.toString().padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Duration */}
          <Field>
            <FieldLabel>Duración (minutos)</FieldLabel>
            <Input
              type="number"
              min={5}
              max={480}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </Field>

          {/* Capacity */}
          <Field>
            <FieldLabel>Capacidad</FieldLabel>
            <Input
              type="number"
              min={1}
              placeholder={
                selectedClass
                  ? `${selectedClass.capacity} (de la clase)`
                  : "Selecciona una clase"
              }
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
            <FieldDescription>
              {selectedClass
                ? `Capacidad por defecto de "${selectedClass.name}": ${selectedClass.capacity}`
                : "Se usará la capacidad de la clase seleccionada."}
            </FieldDescription>
          </Field>

          {/* Notes */}
          <Field>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Textarea
              rows={2}
              placeholder="Notas adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !classId}>
            Crear turno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
