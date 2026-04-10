"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Eye } from "lucide-react";
import PaymentReviewDialog from "./dialogs/payment-review-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const monthNames = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const monthIndex = parseInt(month!, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaymentReviewQueue() {
  const canQuery = useCanQueryCurrentOrganization();
  const pendingPayments = useQuery(
    api.planPayments.getPendingByOrganization,
    canQuery ? {} : "skip",
  );

  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    id: Id<"planPayments">;
    memberName: string;
    planName: string;
    billingPeriod: string;
    amountArs: number;
  } | null>(null);

  const handleReview = (
    payment: NonNullable<typeof pendingPayments>[number],
  ) => {
    setSelectedPayment({
      id: payment._id,
      memberName: payment.userFullName,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amountArs: payment.amountArs,
    });
    setReviewOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Pagos pendientes de revisión</h2>

        {pendingPayments === undefined ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando pagos...
          </p>
        ) : pendingPayments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay pagos pendientes de revisión.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingPayments.map((payment) => (
              <div
                key={payment._id}
                className="flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {payment.userFullName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {payment.planName}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 gap-1 text-amber-600"
                  >
                    <Clock className="h-3 w-3" />
                    En revisión
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatBillingPeriod(payment.billingPeriod)}</span>
                  <span>·</span>
                  <span>${payment.amountArs.toLocaleString("es-AR")}</span>
                </div>

                {payment.proofUploadedAt && (
                  <p className="text-xs text-muted-foreground">
                    Subido: {formatDate(payment.proofUploadedAt)}
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto gap-2"
                  onClick={() => handleReview(payment)}
                >
                  <Eye className="h-4 w-4" />
                  Revisar comprobante
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedPayment && (
        <PaymentReviewDialog
          open={reviewOpen}
          onOpenChange={(open) => {
            setReviewOpen(open);
            if (!open) setSelectedPayment(null);
          }}
          paymentId={selectedPayment.id}
          memberName={selectedPayment.memberName}
          planName={selectedPayment.planName}
          billingPeriod={selectedPayment.billingPeriod}
          amountArs={selectedPayment.amountArs}
        />
      )}
    </>
  );
}
