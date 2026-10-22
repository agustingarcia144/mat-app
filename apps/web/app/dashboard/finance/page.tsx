"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileSearch,
  Plus,
  TrendingDown,
  TrendingUp,
  UserX,
  Wallet,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import RecordPaymentDialog from "@/components/features/payments/dialogs/record-payment-dialog";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

function formatArs(value: number) {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function formatPeriod(period: string, month: "long" | "short" = "long") {
  const [year, monthNumber] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    month,
    ...(month === "long" ? { year: "numeric" } : {}),
  }).format(new Date(year, monthNumber - 1, 1));
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function DeltaLabel({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  const isUp = value > 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        isUp
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {isUp ? "+" : "−"}
      {formatArs(Math.abs(value))} vs mes anterior
    </span>
  );
}

function KpiTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
      {children}
      {detail ? (
        <div className="text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}

type ActionItem = {
  key: string;
  icon: typeof FileSearch;
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
  href: string;
};

const ACTION_TONE: Record<ActionItem["tone"], string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

type MonthlyPoint = {
  billingPeriod: string;
  totalIncomeArs: number;
  expenseArs: number;
  netResultArs: number;
};

/** Income vs expenses per month on one shared axis, oldest to newest. */
function IncomeExpenseChart({
  data,
  currentPeriod,
  showExpenses,
}: {
  data: MonthlyPoint[];
  currentPeriod: string;
  showExpenses: boolean;
}) {
  const max = Math.max(
    1,
    ...data.map((m) =>
      Math.max(m.totalIncomeArs, showExpenses ? m.expenseArs : 0),
    ),
  );

  return (
    <div className="space-y-3">
      {showExpenses && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/80" aria-hidden />
            Ingresos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm bg-muted-foreground/40"
              aria-hidden
            />
            Egresos
          </span>
        </div>
      )}
      <div
        className="flex h-36 items-end gap-3 border-b border-border/60"
        role="img"
        aria-label="Ingresos y egresos de los últimos meses"
      >
        {data.map((month) => (
          <Tooltip key={month.billingPeriod}>
            <TooltipTrigger asChild>
              <div className="flex h-full flex-1 cursor-default items-end justify-center gap-0.5 rounded-sm hover:bg-muted/40">
                <div
                  className="w-full max-w-5 rounded-t bg-foreground/80"
                  style={{
                    height: `${(month.totalIncomeArs / max) * 100}%`,
                  }}
                />
                {showExpenses && (
                  <div
                    className="w-full max-w-5 rounded-t bg-muted-foreground/40"
                    style={{ height: `${(month.expenseArs / max) * 100}%` }}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="space-y-0.5">
              <p className="font-medium capitalize">
                {formatPeriod(month.billingPeriod)}
              </p>
              <p>Ingresos: {formatArs(month.totalIncomeArs)}</p>
              {showExpenses && (
                <>
                  <p>Egresos: {formatArs(month.expenseArs)}</p>
                  <p>Resultado: {formatArs(month.netResultArs)}</p>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex gap-3">
        {data.map((month) => (
          <span
            key={month.billingPeriod}
            className={cn(
              "flex-1 text-center text-xs capitalize text-muted-foreground",
              month.billingPeriod === currentPeriod &&
                "font-medium text-foreground",
            )}
          >
            {formatPeriod(month.billingPeriod, "short").replace(".", "")}
          </span>
        ))}
      </div>
    </div>
  );
}

const FINANCE_MODULES = [
  {
    title: "Pagos",
    description: "Cuotas, comprobantes, planes y bonificaciones.",
    href: "/dashboard/payments",
    icon: CreditCard,
  },
  {
    title: "Ingresos y egresos",
    description: "Movimientos externos y gastos recurrentes.",
    href: "/dashboard/income-expenses",
    icon: Wallet,
    requiresFinance: true,
  },
  {
    title: "Balance financiero",
    description: "Rentabilidad, métodos de pago y comparación por período.",
    href: "/dashboard/metrics/payments",
    icon: TrendingUp,
  },
] as const;

export default function FinanceIndexPage() {
  const settings = useOrgSettings();
  const canQuery = useCanQueryCurrentOrganization();
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const metrics = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery && isAdmin ? {} : "skip",
  );
  const [recordOpen, setRecordOpen] = useState(false);

  const financeEnabled = settings?.financeEnabled !== false;
  const visibleModules = FINANCE_MODULES.filter(
    (module) => !("requiresFinance" in module) || financeEnabled,
  );

  const overview = metrics?.overview;
  const balance = metrics?.financialBalance;
  const monthly = metrics
    ? [...metrics.monthlyOverview]
        .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod))
        .slice(-6)
    : [];

  const actionItems: ActionItem[] = overview
    ? [
        overview.inReviewCount > 0 && {
          key: "review",
          icon: FileSearch,
          tone: "info" as const,
          title: `${plural(overview.inReviewCount, "comprobante", "comprobantes")} para revisar`,
          detail: "Aprobalos para que la cuota quede al día.",
          href: "/dashboard/payments",
        },
        overview.unpaidCount > 0 && {
          key: "unpaid",
          icon: AlertTriangle,
          tone: "warning" as const,
          title: `${plural(overview.unpaidCount, "miembro", "miembros")} sin pagar este mes`,
          detail: `${formatArs(overview.outstandingRevenueArs)} por cobrar.`,
          href: "/dashboard/members",
        },
        overview.suspendedCount > 0 && {
          key: "suspended",
          icon: UserX,
          tone: "danger" as const,
          title: `${plural(overview.suspendedCount, "suscripción suspendida", "suscripciones suspendidas")}`,
          detail: "Suspendidas por falta de pago.",
          href: "/dashboard/members",
        },
      ].filter((item): item is ActionItem => Boolean(item))
    : [];

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Finanzas</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {metrics ? (
              <>
                Resumen de{" "}
                <span className="capitalize">
                  {formatPeriod(metrics.currentPeriod)}
                </span>
              </>
            ) : (
              "Cobros, gastos y resultado del mes."
            )}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setRecordOpen(true)} className="self-start">
            <Plus className="mr-1 size-4" />
            Registrar pago
          </Button>
        )}
      </div>

      {/* KPIs */}
      {isAdmin &&
        (!overview || !balance ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[112px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Cobrado este mes"
              value={formatArs(overview.approvedRevenueArs)}
              detail={`${overview.collectionRatePct}% de ${formatArs(overview.expectedRevenueArs)} esperado`}
            >
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={overview.collectionRatePct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.min(overview.collectionRatePct, 100)}%`,
                  }}
                />
              </div>
            </KpiTile>
            <KpiTile
              label="Por cobrar"
              value={formatArs(overview.outstandingRevenueArs)}
              detail={
                overview.unpaidCount > 0
                  ? plural(overview.unpaidCount, "miembro", "miembros") +
                    " sin pagar"
                  : "Todos pagaron"
              }
            />
            <KpiTile
              label="Ingresos totales"
              value={formatArs(balance.incomeArs)}
              detail={
                balance.incomeDeltaArs ? (
                  <DeltaLabel value={balance.incomeDeltaArs} />
                ) : balance.otherIncomeArs > 0 ? (
                  `Incluye ${formatArs(balance.otherIncomeArs)} de otros ingresos`
                ) : null
              }
            />
            <KpiTile
              label={balance.hasExpenseData ? "Resultado neto" : "Egresos"}
              value={
                balance.hasExpenseData
                  ? formatArs(balance.netResultArs)
                  : "Sin cargar"
              }
              detail={
                balance.hasExpenseData ? (
                  <>
                    {formatArs(balance.expenseArs)} en egresos
                    {balance.profitabilityPct !== null &&
                      ` · ${balance.profitabilityPct}% margen`}
                  </>
                ) : financeEnabled ? (
                  <Link
                    href="/dashboard/income-expenses"
                    className="underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Cargá tus gastos para ver el resultado
                  </Link>
                ) : null
              }
            />
          </div>
        ))}

      {isAdmin && metrics && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Para atender */}
          <section className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">Para atender</h2>
            {actionItems.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 text-sm">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium">Todo al día</p>
                  <p className="text-xs text-muted-foreground">
                    No hay comprobantes ni cuotas pendientes.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {actionItems.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full border",
                          ACTION_TONE[item.tone],
                        )}
                      >
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Últimos meses */}
          <section className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Últimos meses</h2>
              <Link
                href="/dashboard/metrics/payments"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver balance completo
              </Link>
            </div>
            {monthly.length > 0 ? (
              <IncomeExpenseChart
                data={monthly}
                currentPeriod={metrics.currentPeriod}
                showExpenses={balance?.hasExpenseData ?? false}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Todavía no hay movimientos registrados.
              </p>
            )}
          </section>
        </div>
      )}

      {/* Módulos */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Ir a
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {visibleModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                <module.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {module.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {module.description}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </DashboardPageContainer>
  );
}
