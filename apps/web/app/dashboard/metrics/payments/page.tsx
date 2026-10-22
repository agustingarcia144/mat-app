"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatBillingPeriod(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
  bonification: "Bonificacion",
};

function formatPaymentMethod(method: string) {
  return PAYMENT_METHOD_LABELS[method] ?? method.replaceAll("_", " ");
}

function formatDelta(
  value?: number | null,
  kind: "currency" | "percent" | "count" = "count",
) {
  if (value === null || value === undefined) return "-";
  const prefix = value > 0 ? "+" : "";
  if (kind === "currency") return `${prefix}${formatCurrency(value)}`;
  if (kind === "percent") return `${prefix}${formatPercent(value)}`;
  return `${prefix}${value.toLocaleString("es-AR")}`;
}

function DeltaPill({
  value,
  kind,
  invert = false,
}: {
  value?: number | null;
  kind?: "currency" | "percent" | "count";
  invert?: boolean;
}) {
  if (value === null || value === undefined || value === 0) return null;

  const isGood = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isGood
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatDelta(value, kind)}
    </span>
  );
}

function KpiTile({
  label,
  value,
  valueClassName,
  delta,
  detail,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  delta?: React.ReactNode;
  detail?: React.ReactNode;
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
      {delta}
      {detail ? (
        <div className="text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}

/** A labelled share bar: name, amount/count on the right, bar underneath. */
function ShareRow({
  label,
  right,
  share,
  barClassName,
}: {
  label: string;
  right: string;
  share: number;
  barClassName: string;
}) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {right}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", barClassName)}
          style={{ width: `${Math.min(Math.max(share, 0), 100)}%` }}
        />
      </div>
    </li>
  );
}

type MonthlyOverviewItem = {
  billingPeriod: string;
  totalIncomeArs: number;
  expenseArs: number;
  netResultArs: number;
  collectionRatePct: number;
};

function profitability(item: { totalIncomeArs: number; expenseArs: number }) {
  return item.totalIncomeArs > 0 && item.expenseArs > 0
    ? Math.round(
        ((item.totalIncomeArs - item.expenseArs) / item.totalIncomeArs) * 1000,
      ) / 10
    : null;
}

/**
 * Income, expenses and net result share one money axis. Profitability (a %)
 * lives in the table below instead of a second y-axis.
 */
function MonthlyFinanceChart({
  monthlyOverview,
  hasAnyExpense,
}: {
  monthlyOverview: MonthlyOverviewItem[];
  hasAnyExpense: boolean;
}) {
  const chartData = [...monthlyOverview]
    .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod))
    .map((item) => ({
      period: formatBillingPeriod(item.billingPeriod),
      Ingresos: item.totalIncomeArs,
      Egresos: item.expenseArs,
      Resultado: hasAnyExpense ? item.netResultArs : null,
    }));

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolución mensual</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hasAnyExpense
            ? "Ingresos y egresos por mes, con el resultado neto."
            : "Ingresos por mes. Cargá egresos en Ingresos y egresos para ver el resultado."}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barGap={2}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              className="stroke-border/50"
            />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => {
                const word = v.split(" ")[0] ?? v;
                return word.charAt(0).toUpperCase() + word.slice(1, 3);
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              tick={{ fontSize: 11 }}
              width={56}
            />
            <Tooltip
              cursor={{ className: "fill-muted/40" }}
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
              labelClassName="capitalize"
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="Ingresos"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            {hasAnyExpense && (
              <Bar
                dataKey="Egresos"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            )}
            {hasAnyExpense && (
              <Line
                type="monotone"
                dataKey="Resultado"
                stroke="currentColor"
                className="text-foreground"
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function PaymentMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(
    undefined,
  );
  const data = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery && isAdmin ? { selectedPeriod } : "skip",
  );

  const header = (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <Link
          href="/dashboard/finance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Finanzas
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">Balance financiero</h1>
        {data?.previousPeriod ? (
          <p className="text-sm text-muted-foreground">
            <span className="capitalize">
              {formatBillingPeriod(data.selectedPeriod)}
            </span>{" "}
            comparado con {formatBillingPeriod(data.previousPeriod)}
          </p>
        ) : null}
      </div>
      {data && (
        <Select
          value={data.selectedPeriod}
          onValueChange={(value) => setSelectedPeriod(value)}
        >
          <SelectTrigger className="w-full capitalize md:w-60">
            <SelectValue placeholder="Elegí un período" />
          </SelectTrigger>
          <SelectContent>
            {data.availablePeriods.map((period) => (
              <SelectItem key={period} value={period} className="capitalize">
                {formatBillingPeriod(period)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  if (!canQuery || membership === undefined || (isAdmin && data === undefined)) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[380px] rounded-xl" />
      </DashboardPageContainer>
    );
  }

  if (!isAdmin || data === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo administradores pueden ver el balance financiero.
        </div>
      </DashboardPageContainer>
    );
  }

  const {
    paymentMethods,
    planBreakdown,
    monthlyOverview,
    selectedOverview,
    comparison,
    financialBalance,
  } = data;
  const hasAnyExpense = monthlyOverview.some((m) => m.expenseArs > 0);
  const expenseByCategory = financialBalance.expenseByCategory ?? [];
  const pendingTotal =
    (selectedOverview?.pendingPayments ?? 0) +
    (selectedOverview?.inReviewPayments ?? 0);

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {header}

      {/* 1. Balance del período */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          label="Ingresos totales"
          value={formatCurrency(financialBalance.incomeArs)}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          delta={
            <DeltaPill value={financialBalance.incomeDeltaArs} kind="currency" />
          }
          detail={
            <>
              Membresías {formatCurrency(financialBalance.membershipIncomeArs)}
              {financialBalance.otherIncomeArs > 0 &&
                ` · Otros ${formatCurrency(financialBalance.otherIncomeArs)}`}
              {financialBalance.interestIncomeArs > 0 &&
                ` · Interés ${formatCurrency(financialBalance.interestIncomeArs)}`}
            </>
          }
        />
        <KpiTile
          label="Egresos"
          value={
            financialBalance.hasExpenseData
              ? formatCurrency(financialBalance.expenseArs)
              : "Sin cargar"
          }
          valueClassName={
            financialBalance.hasExpenseData
              ? "text-rose-600 dark:text-rose-400"
              : "text-muted-foreground"
          }
          delta={
            <DeltaPill
              value={financialBalance.expenseDeltaArs}
              kind="currency"
              invert
            />
          }
          detail={
            financialBalance.hasExpenseData ? (
              expenseByCategory[0] ? (
                `Mayor gasto: ${expenseByCategory[0].category}`
              ) : null
            ) : (
              <Link
                href="/dashboard/income-expenses"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Registrar egresos
              </Link>
            )
          }
        />
        <KpiTile
          label="Resultado neto"
          value={formatCurrency(financialBalance.netResultArs)}
          valueClassName={
            financialBalance.netResultArs < 0
              ? "text-red-600 dark:text-red-400"
              : undefined
          }
          delta={
            <DeltaPill
              value={financialBalance.netResultDeltaArs}
              kind="currency"
            />
          }
          detail={
            financialBalance.incomeTrend
              ? `Ingresos ${financialBalance.incomeTrend.trendPct >= 0 ? "+" : ""}${formatPercent(financialBalance.incomeTrend.trendPct)} vs promedio de ${financialBalance.incomeTrend.periodCount} meses`
              : null
          }
        />
        <KpiTile
          label="Rentabilidad"
          value={
            financialBalance.hasExpenseData
              ? formatPercent(financialBalance.profitabilityPct)
              : "—"
          }
          detail={
            financialBalance.hasExpenseData
              ? "Resultado sobre ingresos"
              : "Necesita egresos cargados"
          }
        />
      </section>

      {/* 2. Evolución */}
      <MonthlyFinanceChart
        monthlyOverview={monthlyOverview}
        hasAnyExpense={hasAnyExpense}
      />

      {/* 3. Cobranza, métodos y egresos */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cobranza de cuotas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {formatPercent(selectedOverview?.collectionRatePct)}
                </span>
                <DeltaPill
                  value={comparison?.collectionRateDeltaPct}
                  kind="percent"
                />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.min(selectedOverview?.collectionRatePct ?? 0, 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(selectedOverview?.approvedAmountArs)} de{" "}
                {formatCurrency(selectedOverview?.expectedAmountArs)} esperado
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Aprobados</dt>
                <dd className="flex items-baseline gap-2 font-medium tabular-nums">
                  {selectedOverview?.approvedPayments ?? 0}
                  <DeltaPill
                    value={comparison?.approvedPaymentsDelta}
                    kind="count"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Pendientes / en revisión
                </dt>
                <dd className="flex items-baseline gap-2 font-medium tabular-nums">
                  {pendingTotal}
                  <DeltaPill
                    value={comparison?.pendingPaymentsDelta}
                    kind="count"
                    invert
                  />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Métodos de pago</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay pagos registrados.
              </p>
            ) : (
              <ul className="space-y-3">
                {paymentMethods.map((method) => (
                  <ShareRow
                    key={method.method}
                    label={formatPaymentMethod(method.method)}
                    right={`${formatPercent(method.percentage)} · ${method.count}`}
                    share={method.percentage}
                    barClassName="bg-foreground/70"
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Egresos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin egresos registrados para este período.
              </p>
            ) : (
              <ul className="max-h-48 space-y-3 overflow-y-auto pr-1">
                {expenseByCategory.map((item) => (
                  <ShareRow
                    key={item.category}
                    label={item.category}
                    right={formatCurrency(item.amountArs)}
                    share={
                      financialBalance.expenseArs > 0
                        ? (item.amountArs / financialBalance.expenseArs) * 100
                        : 0
                    }
                    barClassName="bg-rose-500/70"
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 4. Rendimiento por plan */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rendimiento por plan</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-72 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="pl-6">Plan</TableHead>
                  <TableHead className="text-right">Miembros</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="w-[40%] pr-6">% de cobro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="px-6 text-muted-foreground"
                    >
                      No hay planes activos para resumir.
                    </TableCell>
                  </TableRow>
                ) : (
                  planBreakdown.map((plan) => (
                    <TableRow key={plan.planId}>
                      <TableCell className="pl-6 font-medium">
                        {plan.planName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {plan.members}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(plan.approvedRevenueArs)}
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${Math.min(plan.collectionRatePct, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                            {formatPercent(plan.collectionRatePct)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Historial por período */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos períodos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tocá un período para verlo en detalle.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Período</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Egresos</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="text-right">Rentabilidad</TableHead>
                  <TableHead className="pr-6 text-right">% de cobro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyOverview.map((period) => {
                  const isSelected =
                    period.billingPeriod === data.selectedPeriod;
                  return (
                    <TableRow
                      key={period.billingPeriod}
                      onClick={() => setSelectedPeriod(period.billingPeriod)}
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-accent/40 hover:bg-accent/50",
                      )}
                      aria-selected={isSelected}
                    >
                      <TableCell className="pl-6 font-medium capitalize">
                        {formatBillingPeriod(period.billingPeriod)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(period.totalIncomeArs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {period.expenseArs > 0
                          ? formatCurrency(period.expenseArs)
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          period.netResultArs < 0 &&
                            "text-red-600 dark:text-red-400",
                        )}
                      >
                        {formatCurrency(period.netResultArs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(profitability(period))}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {formatPercent(period.collectionRatePct)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
