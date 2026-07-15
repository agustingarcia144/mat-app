"use client";

import { useMemo, useState } from "react";
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
import {
  CalendarDays,
  Gift,
  Loader2,
  MoreHorizontal,
  Eye,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Chip,
  FinanceStatePanel,
  TableShell,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/features/finance/finance-display";
import PaymentReviewDialog from "./dialogs/payment-review-dialog";
import PaymentDetailDialog from "./dialogs/payment-detail-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

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
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  const payments = useQuery(
    api.planPayments.getByOrganization,
    canQuery
      ? statusFilter === "all"
        ? {}
        : { status: statusFilter }
      : "skip",
  );

  // Distinct billing periods present in the results, most recent first.
  const periodOptions = useMemo(() => {
    const periods = Array.from(
      new Set((payments ?? []).map((p) => p.billingPeriod)),
    ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return periods.map((value) => ({
      value,
      label: formatBillingPeriod(value),
    }));
  }, [payments]);

  const visiblePayments = useMemo(() => {
    if (!payments) return payments;
    if (periodFilter === "all") return payments;
    return payments.filter((p) => p.billingPeriod === periodFilter);
  }, [payments, periodFilter]);

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
  ): SelectedPayment => {
    const amountArs =
      payment.payableAmountArs ?? payment.totalAmountArs ?? payment.amountArs;
    return {
      id: payment._id,
      memberName: payment.userFullName,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amountArs,
      status: payment.status,
      coveredMembers: payment.coveredMemberNames,
    };
  };

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full gap-2 sm:w-[190px]">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Filtrar por mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {periodOptions.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as PaymentStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[190px]">
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
        </div>

        {visiblePayments === undefined ? (
          <FinanceStatePanel
            icon={Loader2}
            iconClassName="animate-spin"
            title="Cargando historial..."
          />
        ) : visiblePayments.length === 0 ? (
          <FinanceStatePanel
            icon={Receipt}
            title="Sin pagos registrados"
            description={
              statusFilter === "all" && periodFilter === "all"
                ? "Los pagos de los miembros aparecerán acá."
                : "No hay pagos que coincidan con los filtros."
            }
          />
        ) : (
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className={tableHeadClassName}>Miembro</TableHead>
                  <TableHead
                    className={cn(tableHeadClassName, "hidden md:table-cell")}
                  >
                    Plan
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClassName, "hidden sm:table-cell")}
                  >
                    Periodo
                  </TableHead>
                  <TableHead className={cn(tableHeadClassName, "text-right")}>
                    Monto
                  </TableHead>
                  <TableHead className={tableHeadClassName}>Estado</TableHead>
                  <TableHead
                    className={cn(tableHeadClassName, "hidden lg:table-cell")}
                  >
                    Fecha
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePayments.map((payment) => {
                  const statusInfo = STATUS_LABELS[payment.status];
                  const amountArs =
                    payment.payableAmountArs ??
                    payment.totalAmountArs ??
                    payment.amountArs;
                  return (
                    <TableRow key={payment._id} className={tableRowClassName}>
                      <TableCell>
                        <p className="font-medium">{payment.userFullName}</p>
                        <p className="text-xs text-muted-foreground md:hidden">
                          {payment.planName}
                        </p>
                        {payment.coveredMemberCount > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            Asociados:{" "}
                            {payment.coveredMemberNames.slice(1).join(", ")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {payment.planName}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {formatBillingPeriod(payment.billingPeriod)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        ${amountArs.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={statusInfo?.variant ?? "secondary"}>
                            {statusInfo?.label ?? payment.status}
                          </Badge>
                          {payment.isBonification && (
                            <Chip className="border-purple-500/25 bg-purple-500/10 text-purple-600 dark:text-purple-400">
                              <Gift className="size-3" />
                              Bonificado
                            </Chip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                        {formatDate(payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleView(payment)}
                            >
                              <Eye className="mr-2 size-4" />
                              Ver
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(payment)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableShell>
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
