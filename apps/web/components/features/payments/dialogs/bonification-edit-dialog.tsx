"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel } from "@/components/ui/field";
import { Gift } from "lucide-react";
import { toast } from "sonner";

const REASON_LABELS: Record<string, string> = {
  friend_and_family: "Familiar/Amigo",
  trainer: "Entrenador",
  employee: "Empleado",
  sponsor: "Sponsor",
  other: "Otro",
};

type DiscountType = "full" | "percentage" | "fixed";
type Reason =
  | "friend_and_family"
  | "trainer"
  | "employee"
  | "sponsor"
  | "other";

export type BonificationForEdit = {
  _id: Id<"planBonifications">;
  userFullName: string;
  planName: string;
  planPriceArs: number;
  discountType: DiscountType;
  discountValue: number;
  reason: string;
  notes?: string;
};

function computePreviewAmount(
  planPrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountType === "full") return 0;
  if (discountType === "percentage") {
    return Math.round(planPrice * (1 - discountValue / 100));
  }
  return Math.max(0, planPrice - discountValue);
}

export default function BonificationEditDialog({
  open,
  onOpenChange,
  bonification,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bonification: BonificationForEdit | null;
}) {
  const updateBonification = useMutation(api.planBonifications.update);

  const [discountType, setDiscountType] = useState<DiscountType>("full");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill from the selected bonification when the sheet opens.
  useEffect(() => {
    if (!open || !bonification) return;
    setDiscountType(bonification.discountType);
    setDiscountValue(bonification.discountValue);
    setReason(bonification.reason);
    setNotes(bonification.notes ?? "");
  }, [open, bonification]);

  const previewAmount = useMemo(() => {
    if (!bonification) return null;
    return computePreviewAmount(
      bonification.planPriceArs,
      discountType,
      discountValue,
    );
  }, [bonification, discountType, discountValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonification || !reason) return;

    setIsSubmitting(true);
    try {
      await updateBonification({
        bonificationId: bonification._id,
        discountType,
        discountValue: discountType === "full" ? 0 : discountValue,
        reason: reason as Reason,
        notes: notes || undefined,
      });
      toast.success("Bonificación actualizada");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar bonificación",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar bonificación</SheetTitle>
          <SheetDescription>
            Los cambios se aplican a partir del próximo período.
          </SheetDescription>
        </SheetHeader>

        {bonification ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* Context */}
            <div className="space-y-1 rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">{bonification.userFullName}</p>
              <p className="text-sm text-muted-foreground">
                {bonification.planName}
                {" · $"}
                {bonification.planPriceArs.toLocaleString("es-AR")}/mes
              </p>
            </div>

            {/* Discount type */}
            <Field>
              <FieldLabel>Tipo de descuento</FieldLabel>
              <RadioGroup
                value={discountType}
                onValueChange={(v) => setDiscountType(v as DiscountType)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="full" id="edit-dt-full" />
                  <Label
                    htmlFor="edit-dt-full"
                    className="cursor-pointer font-normal"
                  >
                    100% gratis
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="percentage" id="edit-dt-pct" />
                  <Label
                    htmlFor="edit-dt-pct"
                    className="cursor-pointer font-normal"
                  >
                    Porcentaje de descuento
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="fixed" id="edit-dt-fixed" />
                  <Label
                    htmlFor="edit-dt-fixed"
                    className="cursor-pointer font-normal"
                  >
                    Monto fijo de descuento
                  </Label>
                </div>
              </RadioGroup>
            </Field>

            {/* Discount value (conditional) */}
            {discountType === "percentage" && (
              <Field>
                <FieldLabel>Porcentaje de descuento</FieldLabel>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={discountValue || ""}
                    onChange={(e) =>
                      setDiscountValue(parseInt(e.target.value) || 0)
                    }
                    placeholder="Ej: 50"
                    className="pr-8"
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
            )}

            {discountType === "fixed" && (
              <Field>
                <FieldLabel>Monto de descuento (ARS)</FieldLabel>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={discountValue || ""}
                    onChange={(e) =>
                      setDiscountValue(parseInt(e.target.value) || 0)
                    }
                    placeholder="Ej: 5000"
                    className="pl-7"
                  />
                </div>
              </Field>
            )}

            {/* Reason */}
            <Field>
              <FieldLabel>Motivo</FieldLabel>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Notes */}
            <Field>
              <FieldLabel>Notas (opcional)</FieldLabel>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles adicionales..."
              />
            </Field>

            {/* Preview */}
            {previewAmount !== null && (
              <div className="space-y-1 rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Gift className="size-4 text-purple-500" />
                  <p className="font-medium">Vista previa</p>
                </div>
                <p className="font-semibold text-purple-600 dark:text-purple-400">
                  Bonificado: ${previewAmount.toLocaleString("es-AR")}/mes
                  {discountType === "full" && " (gratis)"}
                  {discountType === "percentage" &&
                    ` (${discountValue}% descuento)`}
                  {discountType === "fixed" &&
                    ` ($${discountValue.toLocaleString("es-AR")} descuento)`}
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !reason ||
                  (discountType !== "full" && discountValue <= 0)
                }
              >
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
