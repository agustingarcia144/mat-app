"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Gift, MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PaymentReviewDialog from "./dialogs/payment-review-dialog";
import PaymentDetailDialog from "./dialogs/payment-detail-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

type PaymentStatusFilter =
  | "all"
  | "pending"
  | "in_review"
  | "approved"
  | "declined";

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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PaymentHistoryList() {
  const canQuery = useCanQueryCurrentOrganization();
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>("all");

  const payments = useQuery(
    api.planPayments.getByOrganization,
    canQuery
      ? statusFilter === "all"
        ? {}
        : { status: statusFilter }
      : "skip",
  );

  type SelectedPayment = {
    id: Id<"planPayments">;
    memberName: string;
    planName: string;
    billingPeriod: string;
    amountArs: number;
    status: string;
    coveredMembers?: string[];
  };

  const [reviewOpen, setReviewOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedPayment, setSelectedPayment] =
    useState<SelectedPayment | null>(null);

  const removePayment = useMutation(api.planPayments.remove);

  const buildSelected = (
    payment: NonNullable<typeof payments>[number],
  ): SelectedPayment => ({
    id: payment._id,
    memberName: payment.userFullName,
    planName: payment.planName,
    billingPeriod: payment.billingPeriod,
    amountArs: payment.amountArs,
    status: payment.status,
    coveredMembers: payment.coveredMemberNames,
  });

  const handleView = (payment: NonNullable<typeof payments>[number]) => {
    setSelectedPayment(buildSelected(payment));
    if (payment.status === "in_review") {
      setReviewOpen(true);
    } else {
      setDetailOpen(true);
    }
  };

  const handleDeleteClick = (payment: NonNullable<typeof payments>[number]) => {
    setSelectedPayment(buildSelected(payment));
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPayment) return;
    setDeleting(true);
    try {
      await removePayment({ paymentId: selectedPayment.id });
      toast.success("Pago eliminado");
      setDeleteOpen(false);
      setSelectedPayment(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar el pago",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Historial de pagos</h2>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PaymentStatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="in_review">En revisión</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
              <SelectItem value="declined">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {payments === undefined ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando historial...
          </p>
        ) : payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay pagos registrados.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Miembro</th>
                  <th className="p-3 text-left font-medium">Plan</th>
                  <th className="p-3 text-left font-medium">Periodo</th>
                  <th className="p-3 text-left font-medium">Monto</th>
                  <th className="p-3 text-left font-medium">Estado</th>
                  <th className="p-3 text-left font-medium">Fecha</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const statusInfo = STATUS_LABELS[payment.status];
                  return (
                    <tr
                      key={payment._id}
                      className="border-t border-border hover:bg-muted/30"
                    >
                      <td className="p-3">
                        <div>
                          <p>{payment.userFullName}</p>
                          {payment.coveredMemberCount > 1 ? (
                            <p className="text-xs text-muted-foreground">
                              Asociados: {payment.coveredMemberNames.slice(1).join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3">{payment.planName}</td>
                      <td className="p-3">
                        {formatBillingPeriod(payment.billingPeriod)}
                      </td>
                      <td className="p-3">
                        ${payment.amountArs.toLocaleString("es-AR")}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusInfo?.variant ?? "secondary"}>
                            {statusInfo?.label ?? payment.status}
                          </Badge>
                          {payment.isBonification && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400"
                            >
                              <Gift className="h-3 w-3" />
                              Bonificado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(payment.createdAt)}
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleView(payment)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Ver
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(payment)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {selectedPayment && (
        <PaymentDetailDialog
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setSelectedPayment(null);
          }}
          paymentId={selectedPayment.id}
          memberName={selectedPayment.memberName}
          planName={selectedPayment.planName}
          billingPeriod={selectedPayment.billingPeriod}
          amountArs={selectedPayment.amountArs}
          status={selectedPayment.status}
          coveredMembers={selectedPayment.coveredMembers}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar pago</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar este pago?
              {selectedPayment && (
                <span className="block mt-1 font-medium text-foreground">
                  {selectedPayment.memberName} — {selectedPayment.planName}
                </span>
              )}
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
