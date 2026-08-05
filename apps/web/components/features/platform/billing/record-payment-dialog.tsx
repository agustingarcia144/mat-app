"use client";
"use no memo";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/components/features/finance/finance-display";
import {
  formatDay,
  type PlatformOrgRow,
} from "@/components/features/platform/platform-labels";

const recordPaymentSchema = z.object({
  amountArs: z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value >= 1, {
      message: "Ingresá un monto en ARS mayor a 0",
    }),
  paidAt: z.date(),
  notes: z.string().optional(),
});

type RecordPaymentForm = z.input<typeof recordPaymentSchema>;

/**
 * Mirrors `recordManualPayment` on the backend so the dialog can preview the
 * resulting period: stack on top of the current end, or restart from today if
 * the period already lapsed. Kept on UTC arithmetic, exactly like the server,
 * so the preview can't drift a day from what actually gets stored.
 */
function previewPeriodEnd(org: PlatformOrgRow, now: number): number {
  const start = Math.max(now, org.currentPeriodEnd ?? now);
  const count = Math.max(1, org.planFrequency ?? 1);
  const date = new Date(start);

  if (org.planFrequencyType === "weeks") {
    date.setUTCDate(date.getUTCDate() + count * 7);
    return date.getTime();
  }

  const months = org.planFrequencyType === "years" ? count * 12 : count;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

interface RecordPaymentDialogProps {
  organization: PlatformOrgRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RecordPaymentDialog({
  organization,
  open,
  onOpenChange,
}: RecordPaymentDialogProps) {
  const recordManualPayment = useMutation(
    api.organizationBilling.recordManualPayment,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentForm>({
    resolver: zodResolver(recordPaymentSchema) as any,
    defaultValues: { amountArs: 0, paidAt: new Date(), notes: "" },
  });

  useEffect(() => {
    if (!open || !organization) return;
    reset({
      amountArs: organization.planPriceArs ?? 0,
      paidAt: new Date(),
      notes: "",
    });
  }, [open, organization, reset]);

  const paidAt = watch("paidAt");
  const coversUntil = useMemo(
    () => (organization ? previewPeriodEnd(organization, Date.now()) : null),
    [organization],
  );

  if (!organization) return null;

  const onSubmit = async (values: RecordPaymentForm) => {
    try {
      const parsed = recordPaymentSchema.parse(values);
      const result = await recordManualPayment({
        organizationId: organization.organizationId,
        amountArs: parsed.amountArs,
        paidAt: parsed.paidAt.getTime(),
        notes: parsed.notes?.trim() || undefined,
      });
      toast.success(
        `Pago registrado. Acceso hasta el ${formatDay(result.periodEnd)}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo registrar el pago",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {organization.name} · vence{" "}
            {formatDay(organization.currentPeriodEnd)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="amountArs">Monto (ARS)</FieldLabel>
            <Input
              id="amountArs"
              type="number"
              min={1}
              step={1}
              {...register("amountArs")}
            />
            <FieldDescription>
              Precio del plan: {formatCurrency(organization.planPriceArs)}
            </FieldDescription>
            {errors.amountArs && (
              <FieldError>{errors.amountArs.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Fecha de pago</FieldLabel>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paidAt
                    ? format(paidAt, "dd/MM/yyyy", { locale: es })
                    : "Elegir fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paidAt}
                  disabled={{ after: new Date() }}
                  onSelect={(date) => {
                    if (!date) return;
                    setValue("paidAt", date, { shouldValidate: true });
                    setCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            {errors.paidAt && <FieldError>Elegí una fecha válida</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">Notas</FieldLabel>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Transferencia, comprobante, etc."
              {...register("notes")}
            />
          </Field>

          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            Cubre hasta el{" "}
            <span className="font-medium">{formatDay(coversUntil)}</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Registrando..." : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
