"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Expand, X } from "lucide-react";

interface PaymentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: Id<"planPayments">;
  memberName: string;
  planName: string;
  billingPeriod: string;
  amountArs: number;
  status: string;
}

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "Pendiente", variant: "secondary" },
  in_review: { label: "En revisión", variant: "outline" },
  approved: { label: "Aprobado", variant: "default" },
  declined: { label: "Rechazado", variant: "destructive" },
};

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

export default function PaymentDetailDialog({
  open,
  onOpenChange,
  paymentId,
  memberName,
  planName,
  billingPeriod,
  amountArs,
  status,
}: PaymentDetailDialogProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const proofUrl = useQuery(
    api.planPayments.getProofUrl,
    open ? { paymentId } : "skip",
  );
  const payment = useQuery(
    api.planPayments.getById,
    open ? { paymentId } : "skip",
  );

  const statusInfo = STATUS_LABELS[status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del pago</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Miembro:</span>
              <p className="font-medium">{memberName}</p>
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
              <span className="text-muted-foreground">Estado:</span>
              <div className="mt-0.5">
                <Badge variant={statusInfo?.variant ?? "secondary"}>
                  {statusInfo?.label ?? status}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Monto:</span>
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
            {payment?.reviewNotes && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Notas:</span>
                <p className="font-medium">{payment.reviewNotes}</p>
              </div>
            )}
          </div>

          {/* Proof */}
          <div className="rounded-lg border">
            {proofUrl === undefined ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Cargando comprobante...
              </div>
            ) : proofUrl === null ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Sin comprobante adjunto
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

          {/* Fullscreen overlay */}
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

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
