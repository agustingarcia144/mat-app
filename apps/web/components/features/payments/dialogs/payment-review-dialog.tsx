"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Chip } from "@/components/features/finance/finance-display";
import { toast } from "sonner";
import {
  CheckCircle,
  Expand,
  ImageOff,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

interface PaymentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: Id<"planPayments">;
  memberName: string;
  planName: string;
  billingPeriod: string;
  amountArs: number;
  coveredMembers?: string[];
}

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const monthIndex = parseInt(month!, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

export default function PaymentReviewDialog({
  open,
  onOpenChange,
  paymentId,
  memberName,
  planName,
  billingPeriod,
  amountArs,
  coveredMembers,
}: PaymentReviewDialogProps) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const proofUrl = useQuery(
    api.planPayments.getProofUrl,
    open ? { paymentId } : "skip",
  );
  const payment = useQuery(
    api.planPayments.getById,
    open ? { paymentId } : "skip",
  );

  const approvePayment = useMutation(api.planPayments.approve);
  const declinePayment = useMutation(api.planPayments.decline);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approvePayment({
        paymentId,
        notes: notes.trim() || undefined,
      });
      toast.success("Pago aprobado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    try {
      await declinePayment({
        paymentId,
        notes: notes.trim() || undefined,
      });
      toast.success("Pago rechazado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar comprobante de pago</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment info */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Miembro</p>
                <p className="truncate font-medium">{memberName}</p>
                {coveredMembers && coveredMembers.length > 1 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cubre a: {coveredMembers.join(", ")}
                  </p>
                ) : null}
              </div>
              <Chip className="shrink-0">{planName}</Chip>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Periodo</p>
                <p className="font-medium">
                  {formatBillingPeriod(billingPeriod)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monto</p>
                {payment?.interestApplied?.length ? (
                  <div className="mt-0.5 space-y-0.5">
                    <p className="text-sm text-muted-foreground">
                      Base: ${amountArs.toLocaleString("es-AR")}
                    </p>
                    {payment.interestApplied.map((tier, i) => (
                      <p key={i} className="text-sm text-amber-600">
                        + Mora (
                        {tier.type === "percentage"
                          ? `${tier.value}%`
                          : `$${tier.value.toLocaleString("es-AR")} fijo`}
                        ): +${tier.amountArs.toLocaleString("es-AR")}
                      </p>
                    ))}
                    <p className="text-lg font-semibold tabular-nums">
                      $
                      {(payment.totalAmountArs ?? amountArs).toLocaleString(
                        "es-AR",
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold tabular-nums">
                    ${amountArs.toLocaleString("es-AR")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Proof display */}
          <div>
            <p className="mb-2 text-sm font-medium">Comprobante</p>
            <div className="overflow-hidden rounded-lg border bg-muted/20">
              {proofUrl === undefined ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  Cargando comprobante...
                </div>
              ) : proofUrl === null ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
                    <ImageOff className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Sin comprobante</p>
                    <p className="text-sm text-muted-foreground">
                      Este pago no tiene un comprobante adjunto.
                    </p>
                  </div>
                </div>
              ) : proofUrl.contentType === "application/pdf" ? (
                <div className="relative">
                  <iframe
                    src={proofUrl.url}
                    className="h-[400px] w-full"
                    title="Comprobante de pago"
                  />
                  <button
                    className="absolute top-2 right-2 rounded-md bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
                    onClick={() => setFullscreen(true)}
                    title="Ver en pantalla completa"
                  >
                    <Expand className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="group relative block w-full cursor-zoom-in"
                  onClick={() => setFullscreen(true)}
                  title="Ver en pantalla completa"
                >
                  <img
                    src={proofUrl.url}
                    alt="Comprobante de pago"
                    className="max-h-[400px] w-full object-contain"
                  />
                  <span className="absolute top-2 right-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Expand className="size-4" />
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Fullscreen overlay — portalled to body to escape dialog overflow clipping */}
          {fullscreen &&
            proofUrl &&
            createPortal(
              <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
                onClick={() => setFullscreen(false)}
              >
                <button
                  className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                  onClick={() => setFullscreen(false)}
                >
                  <X className="h-6 w-6" />
                </button>
                {proofUrl.contentType === "application/pdf" ? (
                  <iframe
                    src={proofUrl.url}
                    className="h-[90vh] w-[90vw] rounded-lg"
                    title="Comprobante de pago"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <img
                    src={proofUrl.url}
                    alt="Comprobante de pago"
                    className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>,
              document.body,
            )}

          {/* Notes */}
          <Field>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Nota para el miembro (ej: monto incorrecto)..."
            />
          </Field>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={loading}
              className="gap-2"
            >
              <XCircle className="size-4" />
              Rechazar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="gap-2"
            >
              <CheckCircle className="size-4" />
              Aprobar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
