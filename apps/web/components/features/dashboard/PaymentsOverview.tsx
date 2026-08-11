"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function formatCompactCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";

  const rounded = Math.round(value);
  const compact = new Intl.NumberFormat("es-AR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: rounded >= 1000000 ? 1 : 0,
  }).format(rounded);

  return `$${compact}`;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatShortPeriod(period: string) {
  const [year, month] = period.split("-");
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

export default function PaymentsOverview() {
  const canQuery = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery ? {} : "skip",
  );

  const chartData = !data?.monthlyOverview?.length
    ? []
    : (() => {
        const periods = [...data.monthlyOverview].slice(0, 6).reverse();
        const maxAmount = Math.max(
          ...periods.map((period) => Math.abs(period.netResultArs)),
          1,
        );

        return periods.map((period) => ({
          ...period,
          heightPct: Math.max(
            (Math.abs(period.netResultArs) / maxAmount) * 100,
            10,
          ),
        }));
      })();

  if (!canQuery || data === undefined) {
    return (
      <Card className="flex h-full min-h-[220px] w-full flex-col rounded-2xl border bg-background/60 p-4 md:h-[220px] md:p-5">
        <div className="text-sm text-muted-foreground">Pagos</div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Cargando resumen financiero...
        </div>
      </Card>
    );
  }

  const selectedOverview = data.selectedOverview;
  const selectedNetResultArs = selectedOverview?.netResultArs ?? 0;
  const selectedIncomeArs = selectedOverview?.totalIncomeArs ?? 0;
  const selectedExpenseArs = selectedOverview?.expenseArs ?? 0;
  const balanceTone =
    selectedNetResultArs < 0 ? "text-red-600" : "text-emerald-600";

  return (
    <Card className="flex h-full min-h-[220px] w-full flex-col overflow-hidden rounded-2xl border bg-background/60 p-4 md:h-[220px] md:px-5 md:pb-5 md:pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Balance Financiero</h3>
          {/* Always org-wide: income/expenses are not attributable to a
              responsible staff member. */}
          <p className="text-xs text-muted-foreground">Toda la organización</p>
        </div>
        <Link
          href="/dashboard/metrics/payments"
          className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/40"
        >
          <BarChart3 className="h-4 w-4" />
          Ver mas +
        </Link>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-stretch">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-stretch">
          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-emerald-500/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Balance de cuentas
              </span>
              <Wallet className={`h-4 w-4 ${balanceTone}`} />
            </div>
            <p
              className={`mt-2 text-xl font-semibold md:text-2xl ${balanceTone}`}
            >
              {formatCompactCurrency(selectedNetResultArs)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              {formatCompactCurrency(selectedIncomeArs)} -{" "}
              {formatCompactCurrency(selectedExpenseArs)}
            </p>
          </div>

          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Cobranza</span>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {formatPercent(selectedOverview?.collectionRatePct ?? 0)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              Sobre{" "}
              {formatCompactCurrency(selectedOverview?.expectedAmountArs ?? 0)}
            </p>
          </div>

          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-amber-500/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Pendientes</span>
              <Clock3 className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-600">
              {(selectedOverview?.pendingPayments ?? 0) +
                (selectedOverview?.inReviewPayments ?? 0)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              Pagos sin cerrar
            </p>
          </div>
        </div>

        <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-background/40 p-3 xl:max-w-[220px]">
          <p className="text-xs text-muted-foreground">Rentabilidad</p>
          {data.financialBalance.profitabilityPct != null ? (
            <p className={cn(
              "mt-1 text-4xl font-semibold",
              data.financialBalance.profitabilityPct >= 0 ? "text-emerald-600" : "text-red-600",
            )}>
              {data.financialBalance.profitabilityPct > 0 ? "+" : ""}
              {data.financialBalance.profitabilityPct}%
            </p>
          ) : (
            <p className="mt-1 text-2xl font-semibold text-muted-foreground">-</p>
          )}

          {chartData.length > 0 && (() => {
            const profData = chartData.map((p) => ({
              label: formatShortPeriod(p.billingPeriod),
              pct: p.totalIncomeArs > 0 && p.expenseArs > 0
                ? Math.round(((p.totalIncomeArs - p.expenseArs) / p.totalIncomeArs) * 1000) / 10
                : null,
              isCurrent: p.billingPeriod === data.selectedPeriod,
            }));
            const maxAbs = Math.max(...profData.map((d) => Math.abs(d.pct ?? 0)), 1);
            return (
              <div className="mt-auto flex items-end gap-1 pt-2">
                {profData.map((d, i) => {
                  const heightPct = d.pct != null ? Math.max((Math.abs(d.pct) / maxAbs) * 40, 4) : 4;
                  const isPos = (d.pct ?? 0) >= 0;
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                      <div className="flex h-[40px] w-full items-end justify-center">
                        <div
                          className={cn(
                            "w-full max-w-[18px] rounded-t-sm transition-all",
                            d.pct == null ? "bg-muted" : isPos ? "bg-emerald-500/70" : "bg-red-500/70",
                            d.isCurrent ? "opacity-100" : "opacity-40",
                          )}
                          style={{ height: `${heightPct}px` }}
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground">{d.label}</p>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}
