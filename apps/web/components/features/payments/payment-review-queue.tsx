"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Clock, Eye, Loader2, Receipt } from "lucide-react";
import PaymentReviewDialog from "./dialogs/payment-review-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import {
  Chip,
  FinanceStatePanel,
} from "@/components/features/finance/finance-display";

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
    coveredMembers?: string[];
  } | null>(null);

  const handleReview = (
    payment: NonNullable<typeof pendingPayments>[number],
  ) => {
    const amountArs =
      payment.payableAmountArs ?? payment.totalAmountArs ?? payment.amountArs;
    setSelectedPayment({
      id: payment._id,
      memberName: payment.userFullName,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amountArs,
      coveredMembers: payment.coveredMemberNames,
    });
    setReviewOpen(true);
  };

  return (
    <>
      {pendingPayments === undefined ? (
        <FinanceStatePanel
          icon={Loader2}
          iconClassName="animate-spin"
          title="Cargando pagos..."
        />
      ) : pendingPayments.length === 0 ? (
        <FinanceStatePanel
          icon={Receipt}
          title="No hay pagos pendientes"
          description="Los comprobantes que suban los miembros aparecerán acá para revisión."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pendingPayments.map((payment) => {
            const amountArs =
              payment.payableAmountArs ??
              payment.totalAmountArs ??
              payment.amountArs;
            return (
              <div
                key={payment._id}
                className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {payment.userFullName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {payment.planName}
                    </p>
                    {payment.coveredMemberCount > 1 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Cubre a: {payment.coveredMemberNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Chip className="border-amber-500/25 bg-amber-500/10 text-amber-600">
                    <Clock className="size-3" />
                    En revisión
                  </Chip>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    {formatBillingPeriod(payment.billingPeriod)}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    ${amountArs.toLocaleString("es-AR")}
                  </span>
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
                  <Eye className="size-4" />
                  Revisar comprobante
                </Button>
              </div>
            );
          })}
        </div>
      )}

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
          coveredMembers={selectedPayment.coveredMembers}
        />
      )}
    </>
  );
}
