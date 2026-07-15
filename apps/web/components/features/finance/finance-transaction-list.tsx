"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Edit,
  Loader2,
  MoreHorizontal,
  Receipt,
  Repeat,
  Trash2,
} from "lucide-react";
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
import {
  amountToneClassName,
  Chip,
  FinanceStatePanel,
  formatSignedCurrency,
  TableShell,
  tableHeadClassName,
  tableRowClassName,
  TypeAvatar,
} from "@/components/features/finance/finance-display";
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
      <FinanceStatePanel
        icon={Loader2}
        iconClassName="animate-spin"
        title="Cargando movimientos..."
      />
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <FinanceStatePanel
        icon={Receipt}
        title="Sin movimientos en este período"
        description="Registrá un ingreso o egreso para verlo acá."
      />
    );
  }

  return (
    <>
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
              <TableHead className={cn(tableHeadClassName, "w-[110px]")}>
                Fecha
              </TableHead>
              <TableHead className={tableHeadClassName}>Detalle</TableHead>
              <TableHead
                className={cn(tableHeadClassName, "hidden md:table-cell")}
              >
                Categoría
              </TableHead>
              <TableHead
                className={cn(tableHeadClassName, "hidden lg:table-cell")}
              >
                Método
              </TableHead>
              <TableHead className={cn(tableHeadClassName, "text-right")}>
                Monto
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => {
              const isVoided = transaction.status === "voided";
              return (
                <TableRow
                  key={transaction._id}
                  className={cn(tableRowClassName, isVoided && "opacity-55")}
                >
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                    {formatDate(transaction.occurredOn)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-start gap-3">
                      <TypeAvatar type={transaction.type} />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              isVoided && "line-through",
                            )}
                          >
                            {transaction.title}
                          </span>
                          {transaction.source === "recurring" ? (
                            <Chip>
                              <Repeat className="size-3" />
                              Recurrente
                            </Chip>
                          ) : null}
                          {isVoided ? (
                            <Chip className="border-destructive/30 bg-destructive/10 text-destructive">
                              Anulado
                            </Chip>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground md:hidden">
                          {transaction.category}
                        </p>
                        {transaction.notes ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {transaction.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <Chip>{transaction.category}</Chip>
                  </TableCell>

                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {transaction.paymentMethod
                      ? PAYMENT_METHOD_LABELS[transaction.paymentMethod]
                      : "—"}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right font-semibold tabular-nums",
                      amountToneClassName(transaction.type),
                      isVoided && "text-muted-foreground line-through",
                    )}
                  >
                    {formatSignedCurrency(
                      transaction.type,
                      transaction.amountArs,
                    )}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Acciones</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={isVoided}
                          onClick={() => onEdit(transaction)}
                        >
                          <Edit className="mr-2 size-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isVoided}
                          className="text-destructive focus:text-destructive"
                          onClick={() => setSelected(transaction)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Anular
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
