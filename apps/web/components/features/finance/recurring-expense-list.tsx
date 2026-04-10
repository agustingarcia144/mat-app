"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Ban, Edit, MoreHorizontal, Pause, Play } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RecurringExpenseRow = {
  _id: Id<"financeRecurringRules">;
  title: string;
  category: string;
  amountArs: number;
  dayOfMonth: number;
  startPeriod: string;
  endPeriod?: string;
  nextDuePeriod: string;
  paymentMethod?: "cash" | "bank_transfer" | "card" | "other";
  notes?: string;
  status: "active" | "paused" | "cancelled";
};

const STATUS_LABELS: Record<
  RecurringExpenseRow["status"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Activo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "outline" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function RecurringExpenseList({
  rules,
  isLoading,
  onEdit,
}: {
  rules?: RecurringExpenseRow[];
  isLoading: boolean;
  onEdit: (rule: RecurringExpenseRow) => void;
}) {
  const pauseRecurringRule = useMutation(api.finance.pauseRecurringRule);
  const resumeRecurringRule = useMutation(api.finance.resumeRecurringRule);
  const cancelRecurringRule = useMutation(api.finance.cancelRecurringRule);
  const [selected, setSelected] = useState<RecurringExpenseRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const handlePause = async (rule: RecurringExpenseRow) => {
    try {
      await pauseRecurringRule({ ruleId: rule._id });
      toast.success("Recurrente pausado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al pausar");
    }
  };

  const handleResume = async (rule: RecurringExpenseRow) => {
    try {
      await resumeRecurringRule({ ruleId: rule._id });
      toast.success("Recurrente reactivado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reactivar");
    }
  };

  const handleCancel = async () => {
    if (!selected) return;
    setIsCancelling(true);
    try {
      await cancelRecurringRule({ ruleId: selected._id });
      toast.success("Recurrente cancelado");
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cancelar");
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
        Cargando recurrentes...
      </div>
    );
  }

  if (!rules || rules.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay egresos recurrentes configurados.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Detalle</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Próximo</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => {
              const status = STATUS_LABELS[rule.status];
              return (
                <TableRow key={rule._id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{rule.title}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {rule.notes ? (
                        <p className="text-xs text-muted-foreground">
                          {rule.notes}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>{rule.dayOfMonth}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatPeriod(rule.startPeriod)}
                    {rule.endPeriod ? ` a ${formatPeriod(rule.endPeriod)}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatPeriod(rule.nextDuePeriod)}
                  </TableCell>
                  <TableCell>
                    {rule.paymentMethod
                      ? PAYMENT_METHOD_LABELS[rule.paymentMethod]
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-amber-600">
                    {formatCurrency(rule.amountArs)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Acciones</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={rule.status === "cancelled"}
                          onClick={() => onEdit(rule)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {rule.status === "active" ? (
                          <DropdownMenuItem onClick={() => handlePause(rule)}>
                            <Pause className="mr-2 h-4 w-4" />
                            Pausar
                          </DropdownMenuItem>
                        ) : null}
                        {rule.status === "paused" ? (
                          <DropdownMenuItem onClick={() => handleResume(rule)}>
                            <Play className="mr-2 h-4 w-4" />
                            Reactivar
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={rule.status === "cancelled"}
                          className="text-destructive focus:text-destructive"
                          onClick={() => setSelected(rule)}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Cancelar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recurrente</AlertDialogTitle>
            <AlertDialogDescription>
              Los movimientos ya generados se conservan. No se crearán nuevos
              egresos para este recurrente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleCancel();
              }}
            >
              {isCancelling ? "Cancelando..." : "Cancelar recurrente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
