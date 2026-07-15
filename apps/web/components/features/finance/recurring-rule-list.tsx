"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Ban,
  Edit,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
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

export type RecurringRuleRow = {
  _id: Id<"financeRecurringRules">;
  type: "income" | "expense";
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

const STATUS_CHIPS: Record<
  RecurringRuleRow["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Activo",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
  },
  paused: {
    label: "Pausado",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-600",
  },
  cancelled: {
    label: "Cancelado",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function RecurringRuleList({
  rules,
  isLoading,
  onEdit,
}: {
  rules?: RecurringRuleRow[];
  isLoading: boolean;
  onEdit: (rule: RecurringRuleRow) => void;
}) {
  const pauseRecurringRule = useMutation(api.finance.pauseRecurringRule);
  const resumeRecurringRule = useMutation(api.finance.resumeRecurringRule);
  const cancelRecurringRule = useMutation(api.finance.cancelRecurringRule);
  const [selected, setSelected] = useState<RecurringRuleRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const handlePause = async (rule: RecurringRuleRow) => {
    try {
      await pauseRecurringRule({ ruleId: rule._id });
      toast.success("Recurrente pausado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al pausar");
    }
  };

  const handleResume = async (rule: RecurringRuleRow) => {
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
      <FinanceStatePanel
        icon={Loader2}
        iconClassName="animate-spin"
        title="Cargando recurrentes..."
      />
    );
  }

  if (!rules || rules.length === 0) {
    return (
      <FinanceStatePanel
        icon={Repeat}
        title="Sin movimientos recurrentes"
        description="Creá uno para que se registre solo todos los meses."
      />
    );
  }

  return (
    <>
      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
              <TableHead className={tableHeadClassName}>Detalle</TableHead>
              <TableHead
                className={cn(tableHeadClassName, "hidden md:table-cell")}
              >
                Categoría
              </TableHead>
              <TableHead className={tableHeadClassName}>Repetición</TableHead>
              <TableHead
                className={cn(tableHeadClassName, "hidden lg:table-cell")}
              >
                Próximo
              </TableHead>
              <TableHead
                className={cn(tableHeadClassName, "hidden xl:table-cell")}
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
            {rules.map((rule) => {
              const status = STATUS_CHIPS[rule.status];
              const isCancelled = rule.status === "cancelled";
              return (
                <TableRow
                  key={rule._id}
                  className={cn(tableRowClassName, isCancelled && "opacity-55")}
                >
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <TypeAvatar type={rule.type} />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{rule.title}</span>
                          <Chip className={status.className}>
                            {status.label}
                          </Chip>
                        </div>
                        <p className="truncate text-xs text-muted-foreground md:hidden">
                          {rule.category}
                        </p>
                        {rule.notes ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {rule.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <Chip>{rule.category}</Chip>
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    <p className="text-sm">Día {rule.dayOfMonth} de cada mes</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPeriod(rule.startPeriod)}
                      {rule.endPeriod
                        ? ` — ${formatPeriod(rule.endPeriod)}`
                        : " — sin fin"}
                    </p>
                  </TableCell>

                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">
                    {isCancelled ? "—" : formatPeriod(rule.nextDuePeriod)}
                  </TableCell>

                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {rule.paymentMethod
                      ? PAYMENT_METHOD_LABELS[rule.paymentMethod]
                      : "—"}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right font-semibold tabular-nums",
                      amountToneClassName(rule.type),
                      isCancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {formatSignedCurrency(rule.type, rule.amountArs)}
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
                          disabled={isCancelled}
                          onClick={() => onEdit(rule)}
                        >
                          <Edit className="mr-2 size-4" />
                          Editar
                        </DropdownMenuItem>
                        {rule.status === "active" ? (
                          <DropdownMenuItem onClick={() => handlePause(rule)}>
                            <Pause className="mr-2 size-4" />
                            Pausar
                          </DropdownMenuItem>
                        ) : null}
                        {rule.status === "paused" ? (
                          <DropdownMenuItem onClick={() => handleResume(rule)}>
                            <Play className="mr-2 size-4" />
                            Reactivar
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isCancelled}
                          className="text-destructive focus:text-destructive"
                          onClick={() => setSelected(rule)}
                        >
                          <Ban className="mr-2 size-4" />
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
      </TableShell>

      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recurrente</AlertDialogTitle>
            <AlertDialogDescription>
              Los movimientos ya generados se conservan. No se crearán nuevos
              movimientos para este recurrente.
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
