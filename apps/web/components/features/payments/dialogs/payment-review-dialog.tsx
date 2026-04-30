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
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { CheckCircle, Expand, X, XCircle } from "lucide-react";

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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Miembro:</span>
              <p className="font-medium">{memberName}</p>
              {coveredMembers && coveredMembers.length > 1 ? (
                <p className="text-xs text-muted-foreground">
                  Cubre a: {coveredMembers.join(", ")}
                </p>
              ) : null}
            </div>
            <div>
              <span className="text-muted-foreground">Plan:</span>
              <p className="font-medium">{planName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Periodo:</span>
              <p className="font-medium">
                {formatBillingPeriod(billingPeriod)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Monto:</span>
              {payment?.interestApplied?.length ? (
                <div className="mt-0.5 space-y-0.5">
                  <p className="text-muted-foreground text-sm">
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
                  <p className="font-semibold">
                    Total: $
                    {(payment.totalAmountArs ?? amountArs).toLocaleString(
                      "es-AR",
                    )}
                  </p>
                </div>
              ) : (
                <p className="font-medium">
                  ${amountArs.toLocaleString("es-AR")}
                </p>
              )}
            </div>
          </div>

          {/* Proof display */}
          <div className="rounded-lg border">
            {proofUrl === undefined ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Cargando comprobante...
              </div>
            ) : proofUrl === null ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar el comprobante
              </div>
            ) : proofUrl.contentType === "application/pdf" ? (
              <div className="relative">
                <iframe
                  src={proofUrl.url}
                  className="h-[400px] w-full rounded-lg"
                  title="Comprobante de pago"
                />
                <button
                  className="absolute top-2 right-2 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
                  onClick={() => setFullscreen(true)}
                  title="Ver en pantalla completa"
                >
                  <Expand className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <img
                src={proofUrl.url}
                alt="Comprobante de pago"
                className="max-h-[400px] w-full cursor-zoom-in rounded-lg object-contain"
                onClick={() => setFullscreen(true)}
              />
            )}
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
          <div className="flex justify-end gap-2 pt-2">
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
            >
              <XCircle className="mr-2 h-4 w-4" />
              Rechazar
            </Button>
            <Button onClick={handleApprove} disabled={loading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Aprobar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
