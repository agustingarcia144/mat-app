"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CheckCircle2, Clock, CircleDashed, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgRoleLabel } from "@/lib/security/roles";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import StaffPaymentDialog from "./staff-payment-dialog";

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

type PayRow = {
  userId: string;
  name: string;
  email?: string;
  imageUrl?: string;
  role: string;
  payrollType: "hourly" | "monthly";
  pricePerMonth?: number;
  hours: number;
  classesInCharge: number;
  total: number;
  paidAmount: number;
  remaining: number;
  status: "pending" | "partial" | "paid";
};

export default function PayrollPanel() {
  const canQueryOrgData = useCanQueryCurrentOrganization();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [payTarget, setPayTarget] = useState<PayRow | null>(null);

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
  ) as PayRow[] | undefined;

  const totals = useMemo(() => {
    const rows = summary ?? [];
    let total = 0;
    let paid = 0;
    let pending = 0;
    let pendingCount = 0;
    for (const row of rows) {
      total += row.total;
      paid += row.paidAmount;
      pending += row.remaining;
      if (row.remaining > 0) pendingCount += 1;
    }
    return { total, paid, pending, pendingCount };
  }, [summary]);

  const monthLabel = `${MONTH_LABELS[monthIndex]} ${year}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">
            Liquidación de Sueldos
          </h2>
          <p className="text-sm text-muted-foreground">
            Horas y clases por empleado según los precios configurados.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Select
            value={String(monthIndex)}
            onValueChange={(v) => setMonthIndex(Number(v))}
          >
            <SelectTrigger className="h-10 flex-1 sm:w-[150px]" aria-label="Mes">
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
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-10 w-[100px]" aria-label="Año">
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

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Total del período",
            value: formatMoney(totals.total),
            detail: monthLabel,
            icon: Wallet,
            iconClassName: "border-border bg-muted text-foreground",
            valueClassName: "text-foreground",
          },
          {
            title: "Pagado",
            value: formatMoney(totals.paid),
            detail: "Egresos ya registrados",
            icon: CheckCircle2,
            iconClassName:
              "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
            valueClassName: "text-emerald-600",
          },
          {
            title: "Pendiente",
            value: formatMoney(totals.pending),
            detail: `${totals.pendingCount} por pagar`,
            icon: Clock,
            iconClassName: "border-amber-500/25 bg-amber-500/10 text-amber-600",
            valueClassName:
              totals.pending > 0 ? "text-amber-600" : "text-foreground",
          },
        ].map((card) => (
          <Card key={card.title} className="border-border/70 shadow-sm">
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p
                  className={cn(
                    "text-2xl font-semibold tracking-tight tabular-nums",
                    card.valueClassName,
                  )}
                >
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground">{card.detail}</p>
              </div>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border",
                  card.iconClassName,
                )}
              >
                <card.icon className="size-4" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-0">
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
                    <TableHead>Empleado</TableHead>
                    <TableHead>Modalidad</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">Clases</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-0 text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row) => {
                    const isMonthly = row.payrollType === "monthly";
                    return (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {row.imageUrl && (
                                <AvatarImage src={row.imageUrl} />
                              )}
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
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {isMonthly ? "Mensual" : "Por hora"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {isMonthly ? "—" : formatHours(row.hours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {isMonthly ? "—" : row.classesInCharge}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="font-semibold">
                            {formatMoney(row.total)}
                          </span>
                          {row.status === "partial" && (
                            <span className="block text-xs text-muted-foreground">
                              Resta {formatMoney(row.remaining)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.status === "paid" ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Pagado
                            </Badge>
                          ) : row.status === "partial" ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600"
                            >
                              <CircleDashed className="h-3 w-3" />
                              Parcial
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="gap-1 text-muted-foreground"
                            >
                              <Clock className="h-3 w-3" />
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={row.status === "paid" ? "ghost" : "outline"}
                            disabled={row.total < 1}
                            onClick={() => setPayTarget(row)}
                          >
                            {row.status === "paid" ? "Detalle" : "Pagar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="font-medium">
                      Total
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
        </CardContent>
      </Card>

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
