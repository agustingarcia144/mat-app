"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/components/features/finance/finance-display";
import {
  EMPTY_VALUE,
  formatDay,
  type PlatformOrgRow,
} from "@/components/features/platform/platform-labels";

interface PaymentHistoryDialogProps {
  organization: PlatformOrgRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentHistoryDialog({
  organization,
  open,
  onOpenChange,
}: PaymentHistoryDialogProps) {
  const payments = useQuery(
    api.organizationBilling.listOrganizationPayments,
    open && organization
      ? { organizationId: organization.organizationId }
      : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pagos manuales</DialogTitle>
          <DialogDescription>
            {organization?.name ?? ""} · pagos registrados fuera de Mercado Pago
          </DialogDescription>
        </DialogHeader>

        {payments === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay pagos registrados.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pago</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Período cubierto</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.paymentId}>
                    <TableCell className="whitespace-nowrap">
                      {formatDay(payment.paidAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCurrency(payment.amountArs)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDay(payment.periodStart)} →{" "}
                      {formatDay(payment.periodEnd)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {payment.notes ?? EMPTY_VALUE}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
