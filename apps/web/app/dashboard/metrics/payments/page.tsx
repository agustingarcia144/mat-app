"use client";

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Landmark,
} from "lucide-react";
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

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const toneClasses = {
    default: "text-foreground",
    green: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    blue: "text-blue-600",
  };

  return (
    <Card className="bg-card/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("size-4", toneClasses[tone])} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-semibold", toneClasses[tone])}>
          {value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
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
  if (value === null || value === undefined) {
    return (
      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
        Sin comparacion
      </span>
    );
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const isGood = invert ? isNegative : isPositive;
  const isBad = invert ? isPositive : isNegative;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
        isGood && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        isBad && !invert && "border-red-500/30 bg-red-500/10 text-red-600",
        isBad && invert && "border-orange-500/30 bg-orange-500/10 text-orange-600",
        !isPositive && !isNegative && "border-blue-500/30 bg-blue-500/10 text-blue-600",
      )}
    >
      {isPositive ? <ArrowUp className="size-3" /> : null}
      {isNegative ? <ArrowDown className="size-3" /> : null}
      {formatDelta(value, kind)}
    </span>
  );
}

type MonthlyOverviewItem = {
  billingPeriod: string;
  totalIncomeArs: number;
  expenseArs: number;
  netResultArs: number;
  collectionRatePct: number;
};

function MonthlyFinanceChart({
  monthlyOverview,
}: {
  monthlyOverview: MonthlyOverviewItem[];
}) {
  const chartData = [...monthlyOverview]
    .reverse()
    .map((item) => ({
      period: formatBillingPeriod(item.billingPeriod),
      rawPeriod: item.billingPeriod,
      Ingresos: item.totalIncomeArs,
      Egresos: item.expenseArs > 0 ? item.expenseArs : null,
      rentabilidad:
        item.totalIncomeArs > 0 && item.expenseArs > 0
          ? Math.round(
              ((item.totalIncomeArs - item.expenseArs) /
                item.totalIncomeArs) *
                1000,
            ) / 10
          : null,
    }));

  const hasAnyExpense = chartData.some((d) => d.Egresos !== null);

  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle>Ingresos, egresos y rentabilidad mensual</CardTitle>
        <p className="text-sm text-muted-foreground">
          Comparacion mensual de ingresos vs egresos con porcentaje de
          rentabilidad.{" "}
          {!hasAnyExpense && (
            <span className="text-amber-600">
              · Sin egresos registrados en ningún periodo mostrado.
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => {
                const parts = v.split(" ");
                return parts[0]
                  ? parts[0].charAt(0).toUpperCase() + parts[0].slice(0, 3)
                  : v;
              }}
            />
            <YAxis
              yAxisId="money"
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              tick={{ fontSize: 11 }}
              width={56}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11 }}
              domain={[-100, 100]}
              width={44}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = Number(value);
                if (name === "rentabilidad")
                  return [`${v}%`, "Rentabilidad"];
return [
                  `$${Math.round(v).toLocaleString("es-AR")}`,
                  String(name),
                ];
              }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "rentabilidad" ? "Rentabilidad %" : value
              }
            />
            <Bar
              yAxisId="money"
              dataKey="Ingresos"
              fill="#10b981"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              yAxisId="money"
              dataKey="Egresos"
              fill="#ef4444"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
<Line
              yAxisId="pct"
              type="monotone"
              dataKey="rentabilidad"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4, fill: "#6366f1" }}
              connectNulls={false}
            />
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

  const selectedPeriodLabel = data?.selectedPeriod
    ? formatBillingPeriod(data.selectedPeriod)
    : "";
  const previousPeriodLabel = data?.previousPeriod
    ? formatBillingPeriod(data.previousPeriod)
    : null;

  if (
    !canQuery ||
    membership === undefined ||
    (isAdmin && data === undefined)
  ) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold md:text-3xl">Balance Financiero</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Cargando resumen financiero y comparaciones entre periodos...
          </p>
        </div>
      </DashboardPageContainer>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo administradores pueden ver el balance financiero.
        </div>
      </DashboardPageContainer>
    );
  }

  if (data === undefined) {
    return null;
  }

  const {
    paymentMethods,
    planBreakdown,
    monthlyOverview,
    availablePeriods,
    selectedOverview,
    comparison,
    financialBalance,
  } = data;

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-3">
        <Link
          href="/dashboard/metrics"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a metricas
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold md:text-3xl">Balance Financiero</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            El foco principal es el dinero que ingreso al gimnasio y el estado
            del balance del periodo.
          </p>
        </div>
      </div>

      {/* 1. Balance del periodo */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Balance del periodo</h2>
            <p className="text-sm text-muted-foreground">
              {selectedPeriodLabel}
              {previousPeriodLabel
                ? ` comparado con ${previousPeriodLabel}`
                : ""}
            </p>
          </div>
          <div className="w-full md:w-72">
            <Select
              value={data.selectedPeriod}
              onValueChange={(value) => setSelectedPeriod(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elegi un periodo" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.map((period) => (
                  <SelectItem key={period} value={period}>
                    {formatBillingPeriod(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="bg-card/80">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <Landmark className="size-3.5 text-emerald-600" />
                Resumen principal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-emerald-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Ingresos totales
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <p className="text-3xl font-semibold text-emerald-600">
                      {formatCurrency(financialBalance.incomeArs)}
                    </p>
                    <DeltaPill
                      value={financialBalance.incomeDeltaArs}
                      kind="currency"
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-red-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Egresos totales
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <p className="text-3xl font-semibold text-red-600">
                      {formatCurrency(financialBalance.expenseArs)}
                    </p>
                    <DeltaPill
                      value={financialBalance.expenseDeltaArs}
                      kind="currency"
                      invert
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-background/60 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Resultado neto
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <p className={cn(
                      "text-3xl font-semibold",
                      financialBalance.netResultArs >= 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {formatCurrency(financialBalance.netResultArs)}
                    </p>
                    <DeltaPill
                      value={financialBalance.netResultDeltaArs}
                      kind="currency"
                    />
                  </div>
                </div>
              </div>


              <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                <div className="rounded-lg border bg-background/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Membresias</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">
                    {formatCurrency(financialBalance.membershipIncomeArs)}
                  </p>
                </div>

                <div className="rounded-lg border bg-background/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Otros ingresos</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">
                    {formatCurrency(financialBalance.otherIncomeArs)}
                  </p>
                </div>

                <div className="rounded-lg border bg-background/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Interes</p>
                  <p className="mt-1 text-lg font-semibold text-blue-600">
                    {formatCurrency(financialBalance.interestIncomeArs)}
                  </p>
                </div>

                <div className="rounded-lg border bg-background/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Rentabilidad</p>
                  <p className="mt-1 text-lg font-semibold">
                    {financialBalance.hasExpenseData
                      ? formatPercent(financialBalance.profitabilityPct)
                      : "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Desglose de egresos por categoria */}
          <Card className="bg-card/80">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Egresos por categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {(financialBalance.expenseByCategory ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin egresos registrados para este periodo.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {(financialBalance.expenseByCategory ?? []).map((item) => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate pr-2">{item.category}</span>
                        <span className="text-red-600 font-medium shrink-0">
                          {formatCurrency(item.amountArs)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-red-500/70 transition-all"
                          style={{
                            width: `${financialBalance.expenseArs > 0 ? Math.min((item.amountArs / financialBalance.expenseArs) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 2. Grafico mensual */}
      <section>
        <MonthlyFinanceChart monthlyOverview={monthlyOverview} />
      </section>

      {/* 3. Metodos de pago + Rendimiento por plan */}
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Metodos de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavia no hay metodos de pago registrados en la base.
              </p>
            ) : (
              paymentMethods.map((method) => (
                <div key={method.method} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {formatPaymentMethod(method.method)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatPercent(method.percentage)} · {method.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(method.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70 flex flex-col">
          <CardHeader>
            <CardTitle>Rendimiento por plan</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Miembros</TableHead>
                    <TableHead>Cobrado</TableHead>
                    <TableHead>% de cobro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground px-4">
                        No hay planes activos para resumir.
                      </TableCell>
                    </TableRow>
                  ) : (
                    planBreakdown.map((plan) => (
                      <TableRow key={plan.planId}>
                        <TableCell className="font-medium">
                          {plan.planName}
                        </TableCell>
                        <TableCell>{plan.members}</TableCell>
                        <TableCell>
                          {formatCurrency(plan.approvedRevenueArs)}
                        </TableCell>
                        <TableCell>
                          {formatPercent(plan.collectionRatePct)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Comparacion con el mes anterior */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Comparacion mensual</h2>
          <p className="text-sm text-muted-foreground">
            Variacion del periodo seleccionado contra el mes anterior.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="bg-card/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                % de cobro vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold">
                {formatPercent(selectedOverview?.collectionRatePct)}
              </p>
              <DeltaPill
                value={comparison?.collectionRateDeltaPct}
                kind="percent"
              />
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aprobados vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold">
                {selectedOverview?.approvedPayments ?? 0}
              </p>
              <DeltaPill
                value={comparison?.approvedPaymentsDelta}
                kind="count"
              />
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendientes vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold">
                {(selectedOverview?.pendingPayments ?? 0) +
                  (selectedOverview?.inReviewPayments ?? 0)}
              </p>
              <DeltaPill
                value={comparison?.pendingPaymentsDelta}
                kind="count"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 5. Tabla historica */}
      <section>
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Ultimos periodos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Pagos</TableHead>
                  <TableHead>Aprobados</TableHead>
                  <TableHead>En revision</TableHead>
                  <TableHead>% de cobro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyOverview.map((period) => (
                  <TableRow
                    key={period.billingPeriod}
                    className={cn(
                      period.billingPeriod === data.selectedPeriod &&
                        "bg-accent/20",
                    )}
                  >
                    <TableCell className="font-medium">
                      {formatBillingPeriod(period.billingPeriod)}
                    </TableCell>
                    <TableCell>{period.totalPayments}</TableCell>
                    <TableCell>{period.approvedPayments}</TableCell>
                    <TableCell>{period.inReviewPayments}</TableCell>
                    <TableCell>
                      {formatPercent(period.collectionRatePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </DashboardPageContainer>
  );
}
