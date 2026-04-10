"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Edit, MoreHorizontal, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

export type FinanceTransactionRow = {
  _id: Id<"financeTransactions">;
  type: "income" | "expense";
  title: string;
  category: string;
  amountArs: number;
  occurredOn: string;
  period: string;
  paymentMethod?: "cash" | "bank_transfer" | "card" | "other";
  notes?: string;
  source: "manual" | "recurring";
  status: "active" | "voided";
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function FinanceTransactionList({
  transactions,
  isLoading,
  onEdit,
}: {
  transactions?: FinanceTransactionRow[];
  isLoading: boolean;
  onEdit: (transaction: FinanceTransactionRow) => void;
}) {
  const voidTransaction = useMutation(api.finance.voidTransaction);
  const [selected, setSelected] = useState<FinanceTransactionRow | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const handleVoid = async () => {
    if (!selected) return;
    setIsVoiding(true);
    try {
      await voidTransaction({ transactionId: selected._id });
      toast.success("Movimiento anulado");
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al anular");
    } finally {
      setIsVoiding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
        Cargando movimientos...
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay movimientos registrados para este período.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow
                key={transaction._id}
                className={cn(transaction.status === "voided" && "opacity-60")}
              >
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(transaction.occurredOn)}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{transaction.title}</span>
                      <Badge
                        variant={
                          transaction.type === "income"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {transaction.type === "income" ? "Ingreso" : "Egreso"}
                      </Badge>
                      {transaction.status === "voided" ? (
                        <Badge variant="outline">Anulado</Badge>
                      ) : null}
                    </div>
                    {transaction.notes ? (
                      <p className="text-xs text-muted-foreground">
                        {transaction.notes}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{transaction.category}</TableCell>
                <TableCell>
                  {transaction.paymentMethod
                    ? PAYMENT_METHOD_LABELS[transaction.paymentMethod]
                    : "-"}
                </TableCell>
                <TableCell>
                  {transaction.source === "recurring" ? "Recurrente" : "Manual"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    transaction.type === "income"
                      ? "text-emerald-600"
                      : "text-amber-600",
                  )}
                >
                  {transaction.type === "income" ? "+" : "-"}
                  {formatCurrency(transaction.amountArs)}
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
                        disabled={transaction.status === "voided"}
                        onClick={() => onEdit(transaction)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={transaction.status === "voided"}
                        className="text-destructive focus:text-destructive"
                        onClick={() => setSelected(transaction)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Anular
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular movimiento</AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento quedará fuera de las métricas, pero seguirá en el
              historial para auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isVoiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleVoid();
              }}
            >
              {isVoiding ? "Anulando..." : "Anular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
