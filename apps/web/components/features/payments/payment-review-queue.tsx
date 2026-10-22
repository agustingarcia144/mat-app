"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Clock, Eye, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
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

/** How long a receipt has been waiting, so the oldest ones get attention. */
function waitingLabel(timestamp: number) {
  const hours = Math.floor((Date.now() - timestamp) / (60 * 60 * 1000));
  if (hours < 1) return { text: "Recién subido", stale: false };
  if (hours < 24) return { text: `Hace ${hours} h`, stale: false };
  const days = Math.floor(hours / 24);
  return {
    text: `Esperando hace ${days} ${days === 1 ? "día" : "días"}`,
    stale: days >= 2,
  };
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

  const sortedPayments = useMemo(
    () =>
      pendingPayments
        ? [...pendingPayments].sort(
            (a, b) =>
              (a.proofUploadedAt ?? a.createdAt) -
              (b.proofUploadedAt ?? b.createdAt),
          )
        : undefined,
    [pendingPayments],
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
      {sortedPayments === undefined ? (
        <FinanceStatePanel
          icon={Loader2}
          iconClassName="animate-spin"
          title="Cargando pagos..."
        />
      ) : sortedPayments.length === 0 ? (
        <FinanceStatePanel
          icon={Receipt}
          title="No hay pagos pendientes"
          description="Los comprobantes que suban los miembros aparecerán acá para revisión."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedPayments.map((payment) => {
            const amountArs =
              payment.payableAmountArs ??
              payment.totalAmountArs ??
              payment.amountArs;
            const waiting = payment.proofUploadedAt
              ? waitingLabel(payment.proofUploadedAt)
              : null;
            return (
              <div
                key={payment._id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-border",
                  waiting?.stale && "border-amber-500/40",
                )}
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
                  <Chip className="border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400">
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

                {payment.proofUploadedAt && waiting && (
                  <p
                    className="text-xs text-muted-foreground"
                    title={`Subido: ${formatDate(payment.proofUploadedAt)}`}
                  >
                    <span
                      className={cn(
                        waiting.stale &&
                          "font-medium text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {waiting.text}
                    </span>
                    {" · "}
                    {formatDate(payment.proofUploadedAt)}
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
