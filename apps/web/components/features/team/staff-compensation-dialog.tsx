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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";

type PayrollType = "hourly" | "monthly";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: {
    userId: string;
    name: string;
    payrollType?: PayrollType;
    pricePerHour?: number;
    pricePerClass?: number;
    pricePerMonth?: number;
    commissionPercentage?: number;
  } | null;
};

function toInput(value?: number) {
  return value === undefined || value === null ? "" : String(value);
}

export default function StaffCompensationDialog({
  open,
  onOpenChange,
  staff,
}: Props) {
  const updateCompensation = useMutation(
    api.organizationMemberships.updateStaffCompensation,
  );
  const [payrollType, setPayrollType] = useState<PayrollType>("hourly");
  const [pricePerHour, setPricePerHour] = useState("");
  const [pricePerClass, setPricePerClass] = useState("");
  const [pricePerMonth, setPricePerMonth] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && staff) {
      setPayrollType(staff.payrollType ?? "hourly");
      setPricePerHour(toInput(staff.pricePerHour));
      setPricePerClass(toInput(staff.pricePerClass));
      setPricePerMonth(toInput(staff.pricePerMonth));
      setCommissionPercentage(toInput(staff.commissionPercentage));
    }
  }, [open, staff]);

  const parseRate = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staff) return;

    const hour = parseRate(pricePerHour);
    const cls = parseRate(pricePerClass);
    const month = parseRate(pricePerMonth);
    const commission = parseRate(commissionPercentage);

    if (commissionPercentage.trim() !== "") {
      if (commission === null || commission > 100) {
        toast.error("Ingresá una comisión entre 0 y 100.");
        return;
      }
    }

    if (payrollType === "hourly") {
      if (pricePerHour.trim() !== "" && hour === null) {
        toast.error("Ingresá un precio por hora válido.");
        return;
      }
      if (pricePerClass.trim() !== "" && cls === null) {
        toast.error("Ingresá un precio por clase válido.");
        return;
      }
    } else if (pricePerMonth.trim() !== "" && month === null) {
      toast.error("Ingresá un sueldo mensual válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateCompensation({
        userId: staff.userId,
        payrollType,
        pricePerHour: hour,
        pricePerClass: cls,
        pricePerMonth: month,
        commissionPercentage: commission,
      });
      toast.success("Precios actualizados");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Precios de {staff?.name}</DialogTitle>
          <DialogDescription>
            Elegí cómo se le paga: por hora (y clases) o un sueldo mensual fijo.
            La comisión se suma aparte.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Tabs
            value={payrollType}
            onValueChange={(v) => setPayrollType(v as PayrollType)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hourly">Por hora</TabsTrigger>
              <TabsTrigger value="monthly">Por mes</TabsTrigger>
            </TabsList>

            <TabsContent value="hourly" className="mt-4 grid gap-4">
              <Field>
                <FieldLabel htmlFor="price-per-hour">
                  Precio por hora
                </FieldLabel>
                <Input
                  id="price-per-hour"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                  disabled={isSubmitting}
                />
                <FieldDescription>
                  Aplica a las horas de turnos.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="price-per-class">
                  Precio por clase
                </FieldLabel>
                <Input
                  id="price-per-class"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={pricePerClass}
                  onChange={(e) => setPricePerClass(e.target.value)}
                  disabled={isSubmitting}
                />
                <FieldDescription>
                  Aplica a las clases donde está a cargo.
                </FieldDescription>
              </Field>
            </TabsContent>

            <TabsContent value="monthly" className="mt-4 grid gap-4">
              <Field>
                <FieldLabel htmlFor="price-per-month">
                  Sueldo mensual
                </FieldLabel>
                <Input
                  id="price-per-month"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={pricePerMonth}
                  onChange={(e) => setPricePerMonth(e.target.value)}
                  disabled={isSubmitting}
                />
                <FieldDescription>
                  Monto fijo por mes, sin importar las horas o clases.
                </FieldDescription>
              </Field>
            </TabsContent>
          </Tabs>

          <Field>
            <FieldLabel htmlFor="commission-percentage">
              Comisión sobre planes (%)
            </FieldLabel>
            <Input
              id="commission-percentage"
              type="number"
              min={0}
              max={100}
              step="0.1"
              inputMode="decimal"
              placeholder="0"
              value={commissionPercentage}
              onChange={(e) => setCommissionPercentage(e.target.value)}
              disabled={isSubmitting}
            />
            <FieldDescription>
              Porcentaje de lo que pagan los miembros asignados a este empleado.
              Se suma al sueldo por hora o mensual.
            </FieldDescription>
          </Field>

          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
