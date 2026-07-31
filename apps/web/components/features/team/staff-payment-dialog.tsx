"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "bank_transfer" | "card" | "other";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string;
  total: number;
  period: string;
  periodLabel: string;
  startDate: number;
  endDate: number;
};

export default function StaffPaymentDialog({
  open,
  onOpenChange,
  userId,
  name,
  total,
  period,
  periodLabel,
  startDate,
  endDate,
}: Props) {
  const registerPayment = useMutation(api.payroll.registerPayment);
  const voidPayment = useMutation(api.payroll.voidPayment);

  const payments = useQuery(
    api.payroll.getPeriodPayments,
    open ? { userId, period } : "skip",
  );

  const commission = useQuery(
    api.payroll.getCommissionDetail,
    open ? { userId, startDate, endDate } : "skip",
  );

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const paid = useMemo(
    () => (payments ?? []).reduce((acc, p) => acc + p.amountArs, 0),
    [payments],
  );
  const remaining = Math.max(0, total - paid);

  // Default the input to the remaining amount whenever it changes (e.g. after
  // registering a partial payment or opening the dialog).
  useEffect(() => {
    if (open) setAmount(remaining > 0 ? String(remaining) : "");
  }, [open, remaining]);

  const handlePay = async () => {
    const parsed = Number(amount.trim());
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("Ingresá un monto válido.");
      return;
    }
    const rounded = Math.round(parsed);
    if (rounded > remaining) {
      toast.error(`El monto supera lo pendiente (${formatMoney(remaining)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await registerPayment({
        userId,
        period,
        startDate,
        endDate,
        occurredOn: format(new Date(), "yyyy-MM-dd"),
        amountArs: rounded,
        paymentMethod,
      });
      toast.success("Pago registrado y egreso creado en Finanzas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoid = async (paymentId: string) => {
    try {
      await voidPayment({
        paymentId: paymentId as Parameters<typeof voidPayment>[0]["paymentId"],
      });
      toast.success("Pago anulado. El egreso fue anulado en Finanzas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const statusLabel =
    paid <= 0 ? "Pendiente" : paid >= total ? "Pagado" : "Parcial";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar sueldo — {name}</DialogTitle>
          <DialogDescription>
            {periodLabel}. Podés pagar el total o una parte; cada pago genera un
            egreso en Finanzas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amounts overview */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold tabular-nums">{formatMoney(total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="font-semibold tabular-nums text-emerald-600">
                {formatMoney(paid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendiente</p>
              <p
                className={cn(
                  "font-semibold tabular-nums",
                  remaining > 0 ? "text-amber-600" : "text-muted-foreground",
                )}
              >
                {formatMoney(remaining)}
              </p>
            </div>
          </div>

          {remaining > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="payment-amount">Monto a pagar</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="payment-amount"
                    type="number"
                    min={1}
                    max={remaining}
                    step="1"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAmount(String(remaining))}
                    disabled={isSubmitting}
                  >
                    Total
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel>Medio de pago</FieldLabel>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]
                    ).map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-center text-sm text-emerald-600">
              Sueldo pagado por completo.
            </div>
          )}

          {/* Commission breakdown */}
          {commission && commission.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  Comisiones del período ({commission.commissionPercentage}%)
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatMoney(commission.commissionAmount)}
                </p>
              </div>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {commission.items.map((item, index) => (
                  <li
                    key={`${item.memberUserId}-${item.paidAt}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.memberName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.planName} · {formatMoney(item.amountArs)} ·{" "}
                        {format(new Date(item.paidAt), "d MMM", { locale: es })}
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums">
                      {formatMoney(item.commissionAmount)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Payment history */}
          {payments && payments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pagos registrados</p>
              <ul className="space-y-1.5">
                {payments.map((payment) => (
                  <li
                    key={payment._id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        {formatMoney(payment.amountArs)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(payment.paidAt), "d MMM yyyy", {
                          locale: es,
                        })}
                        {payment.paymentMethod &&
                          ` · ${PAYMENT_METHOD_LABELS[payment.paymentMethod]}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive/80 hover:text-destructive"
                      onClick={() => handleVoid(payment._id)}
                      aria-label="Anular pago"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {statusLabel === "Pagado" ? "Cerrar" : "Cancelar"}
          </Button>
          {remaining > 0 && (
            <Button type="button" onClick={handlePay} disabled={isSubmitting}>
              {isSubmitting ? "Registrando…" : "Registrar pago"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
