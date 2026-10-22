"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgRoleLabel } from "@/lib/security/roles";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import StaffPaymentDialog from "./staff-payment-dialog";
import StaffCompensationDialog from "./staff-compensation-dialog";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), "LLLL", { locale: es }),
).map((label) => label.charAt(0).toUpperCase() + label.slice(1));

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function formatHours(value: number) {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function initialsFor(name: string, email?: string) {
  const fromName = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return fromName || email?.[0]?.toUpperCase() || "?";
}

type PayRow = FunctionReturnType<typeof api.payroll.getPayrollSummary>[number];

/** No price of any kind configured: the row can only ever total $0. */
function hasNoPrices(row: PayRow) {
  return (
    row.pricePerHour === undefined &&
    row.pricePerClass === undefined &&
    row.pricePerMonth === undefined &&
    !row.commissionPercentage
  );
}

function SummaryTile({
  label,
  value,
  detail,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-2xl font-semibold tabular-nums md:text-3xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      {children}
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PayRow["status"] }) {
  if (status === "paid") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <CheckCircle2 className="size-3" />
        Pagado
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      >
        <CircleDashed className="size-3" />
        Parcial
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 font-normal text-muted-foreground"
    >
      <Clock className="size-3" />
      Pendiente
    </Badge>
  );
}

export default function PayrollPanel() {
  const canQueryOrgData = useCanQueryCurrentOrganization();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [payTarget, setPayTarget] = useState<PayRow | null>(null);
  const [pricesTarget, setPricesTarget] = useState<PayRow | null>(null);

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 3 + i);
  }, [now]);

  const period = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  const range = useMemo(() => {
    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { startDate: start.getTime(), endDate: end.getTime() };
  }, [year, monthIndex]);

  const summary = useQuery(
    api.payroll.getPayrollSummary,
    canQueryOrgData ? { period, ...range } : "skip",
  );

  const totals = useMemo(() => {
    const rows = summary ?? [];
    let total = 0;
    let paid = 0;
    let pending = 0;
    let pendingCount = 0;
    let commission = 0;
    for (const row of rows) {
      total += row.total;
      paid += row.paidAmount;
      pending += row.remaining;
      commission += row.commissionAmount;
      if (row.remaining > 0) pendingCount += 1;
    }
    // Admins are often owners who don't draw a salary, so only staff count.
    const withoutPrices = rows.filter(
      (row) => hasNoPrices(row) && row.role !== "admin",
    ).length;
    return { total, paid, pending, pendingCount, commission, withoutPrices };
  }, [summary]);

  const monthLabel = `${MONTH_LABELS[monthIndex]} ${year}`;

  const paidPct = totals.total > 0 ? (totals.paid / totals.total) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            Liquidación de {monthLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            Horas, clases y comisiones de cada persona según sus precios.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Select
            value={String(monthIndex)}
            onValueChange={(v) => setMonthIndex(Number(v))}
          >
            <SelectTrigger className="flex-1 sm:w-[150px]" aria-label="Mes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="w-[100px]" aria-label="Año">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      {summary === undefined ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Total a liquidar"
            value={formatMoney(totals.total)}
            detail={
              totals.commission > 0
                ? `Incluye ${formatMoney(totals.commission)} de comisiones`
                : `${summary.length} personas en el equipo`
            }
          />
          <SummaryTile
            label="Pagado"
            value={formatMoney(totals.paid)}
            valueClassName={
              totals.paid > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : undefined
            }
            detail={
              totals.total > 0
                ? `${Math.round(paidPct)}% del total`
                : "Egresos ya registrados"
            }
          >
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(paidPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(paidPct, 100)}%` }}
              />
            </div>
          </SummaryTile>
          <SummaryTile
            label="Pendiente"
            value={formatMoney(totals.pending)}
            valueClassName={
              totals.pending > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
            }
            detail={
              totals.pendingCount > 0
                ? `${totals.pendingCount} ${totals.pendingCount === 1 ? "persona" : "personas"} por pagar`
                : "Todo pagado"
            }
          />
        </div>
      )}

      {summary !== undefined && totals.withoutPrices > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-medium">
              {totals.withoutPrices === 1
                ? "1 persona no tiene precios cargados"
                : `${totals.withoutPrices} personas no tienen precios cargados`}
            </span>
            <span className="text-muted-foreground">
              {" "}
              y su sueldo da $0. Cargalos desde su fila.
            </span>
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {summary === undefined ? (
          <Skeleton className="m-4 h-64 rounded-lg" />
        ) : summary.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No hay personal para calcular los sueldos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Persona</TableHead>
                  <TableHead>Modalidad</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Clases</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-0 pr-4 text-right">
                    <span className="sr-only">Acción</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row) => {
                  const isMonthly = row.payrollType === "monthly";
                  const hasCommission = (row.commissionPercentage ?? 0) > 0;
                  const noPrices = hasNoPrices(row);
                  return (
                    <TableRow key={row.userId}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            {row.imageUrl && <AvatarImage src={row.imageUrl} />}
                            <AvatarFallback className="text-xs">
                              {initialsFor(row.name, row.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {getOrgRoleLabel(row.role)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {noPrices ? (
                          <span
                            className={cn(
                              row.role !== "admin" &&
                                "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            Sin precios
                          </span>
                        ) : isMonthly ? (
                          "Mensual"
                        ) : (
                          "Por hora"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isMonthly || row.hours === 0
                          ? "—"
                          : formatHours(row.hours)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isMonthly || row.classesInCharge === 0
                          ? "—"
                          : row.classesInCharge}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasCommission ? (
                          <>
                            <span>{formatMoney(row.commissionAmount)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {row.commissionPercentage}% de{" "}
                              {formatMoney(row.commissionBase)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={cn(
                            "font-semibold",
                            row.total < 1 &&
                              "font-normal text-muted-foreground",
                          )}
                        >
                          {formatMoney(row.total)}
                        </span>
                        {row.status === "partial" && (
                          <span className="block text-xs text-muted-foreground">
                            Resta {formatMoney(row.remaining)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.total < 1 ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {noPrices ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => setPricesTarget(row)}
                          >
                            Cargar precios
                          </Button>
                        ) : row.total < 1 ? null : (
                          <Button
                            size="sm"
                            variant={
                              row.status === "paid" ? "ghost" : "default"
                            }
                            disabled={row.total < 1}
                            onClick={() => setPayTarget(row)}
                          >
                            {row.status === "paid" ? "Detalle" : "Pagar"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="pl-4 font-medium">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totals.commission)}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {formatMoney(totals.total)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {pricesTarget && (
        <StaffCompensationDialog
          open={pricesTarget !== null}
          onOpenChange={(open) => {
            if (!open) setPricesTarget(null);
          }}
          staff={{
            userId: pricesTarget.userId,
            name: pricesTarget.name,
            payrollType: pricesTarget.payrollType,
            pricePerHour: pricesTarget.pricePerHour,
            pricePerClass: pricesTarget.pricePerClass,
            pricePerMonth: pricesTarget.pricePerMonth,
            commissionPercentage: pricesTarget.commissionPercentage,
          }}
        />
      )}

      {/* Payment dialog (full or partial) */}
      {payTarget && (
        <StaffPaymentDialog
          open={payTarget !== null}
          onOpenChange={(open) => {
            if (!open) setPayTarget(null);
          }}
          userId={payTarget.userId}
          name={payTarget.name}
          total={payTarget.total}
          period={period}
          periodLabel={monthLabel}
          startDate={range.startDate}
          endDate={range.endDate}
        />
      )}
    </div>
  );
}
