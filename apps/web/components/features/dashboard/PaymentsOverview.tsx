"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";
import { Panel, PanelSkeleton } from "./dashboard-panel";

function formatPeriod(period: string, month: "long" | "short" = "long") {
  const [year, monthNumber] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    month,
    ...(month === "long" ? { year: "numeric" } : {}),
  })
    .format(new Date(year, monthNumber - 1, 1))
    .replace(".", "");
}

/** "$969 mil", "$5,1 M": short enough to fit a tile at any width. */
function formatCompactArs(value: number) {
  const rounded = Math.round(value);
  const compact = new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: Math.abs(rounded) >= 1_000_000 ? 1 : 0,
  }).format(Math.abs(rounded));
  return `${rounded < 0 ? "−" : ""}$${compact}`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

type Tone = "neutral" | "good" | "bad" | "warning";

const TILE_TONE: Record<Tone, string> = {
  neutral: "",
  good: "border-emerald-500/25 bg-emerald-500/5",
  bad: "border-red-500/25 bg-red-500/5",
  warning: "border-amber-500/25 bg-amber-500/5",
};

const VALUE_TONE: Record<Tone, string> = {
  neutral: "",
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

function FinanceTile({
  label,
  value,
  detail,
  tone = "neutral",
  href,
  children,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: Tone;
  href?: string;
  children?: ReactNode;
}) {
  const className = cn(
    "flex min-h-[120px] min-w-0 flex-col gap-1 rounded-lg border p-3",
    TILE_TONE[tone],
    href && "transition-colors hover:bg-accent/40",
  );
  const content = (
    <>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-2xl font-semibold tabular-nums",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {children}
      {detail ? (
        <div className="mt-auto line-clamp-2 pt-1 text-xs text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** Org-wide money for the month: income and expenses aren't per staff member. */
export default function PaymentsOverview() {
  const canQuery = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery ? {} : "skip",
  );

  if (!canQuery || data === undefined) return <PanelSkeleton rows={3} />;

  const { overview, financialBalance: balance, selectedOverview } = data;
  const hasExpenses = balance.hasExpenseData;
  const collectionRate = selectedOverview?.collectionRatePct ?? 0;
  const expectedArs = selectedOverview?.expectedAmountArs ?? 0;
  const pendingCount =
    (selectedOverview?.pendingPayments ?? 0) +
    (selectedOverview?.inReviewPayments ?? 0);

  // Profitability per month, oldest first, for the sparkline.
  const months = [...data.monthlyOverview]
    .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod))
    .slice(-6)
    .map((month) => ({
      period: month.billingPeriod,
      pct:
        month.totalIncomeArs > 0 && month.expenseArs > 0
          ? Math.round(
              ((month.totalIncomeArs - month.expenseArs) /
                month.totalIncomeArs) *
                1000,
            ) / 10
          : null,
    }));
  const maxAbsPct = Math.max(
    1,
    ...months.map((month) => Math.abs(month.pct ?? 0)),
  );

  const profitability = balance.profitabilityPct;

  return (
    <Panel
      title="Balance financiero"
      description={
        <>
          <span className="inline-block first-letter:uppercase">
            {formatPeriod(data.currentPeriod)}
          </span>{" "}
          · toda la organización
        </>
      }
      href="/dashboard/metrics/payments"
      linkLabel="Ver más"
      className="@container"
    >
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {hasExpenses ? (
          <FinanceTile
            label="Resultado del mes"
            value={formatCompactArs(balance.netResultArs)}
            tone={balance.netResultArs < 0 ? "bad" : "good"}
            detail={`${formatCompactArs(balance.incomeArs)} − ${formatCompactArs(balance.expenseArs)}`}
          />
        ) : (
          <FinanceTile
            label="Ingresos del mes"
            value={formatCompactArs(balance.incomeArs)}
            tone={balance.incomeArs > 0 ? "good" : "neutral"}
            detail="Sin egresos cargados"
            href="/dashboard/income-expenses"
          />
        )}

        <FinanceTile
          label="Cobranza"
          value={formatPercent(collectionRate)}
          detail={`Sobre ${formatCompactArs(expectedArs)} esperado`}
        >
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={collectionRate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(collectionRate, 100)}%` }}
            />
          </div>
        </FinanceTile>

        <FinanceTile
          label="Pendientes"
          value={`${pendingCount}`}
          tone={pendingCount > 0 ? "warning" : "neutral"}
          detail={
            overview.outstandingRevenueArs > 0
              ? `${formatCompactArs(overview.outstandingRevenueArs)} por cobrar`
              : "Pagos sin cerrar"
          }
          href="/dashboard/payments"
        />

        <FinanceTile
          label="Rentabilidad"
          value={
            profitability === null
              ? "—"
              : `${profitability > 0 ? "+" : ""}${formatPercent(profitability)}`
          }
          tone={
            profitability === null
              ? "neutral"
              : profitability < 0
                ? "bad"
                : "good"
          }
          detail={profitability === null ? "Necesita egresos" : undefined}
        >
          {profitability !== null && (
            <div className="mt-auto">
              <div
                className="flex h-8 items-end gap-1"
                role="img"
                aria-label="Rentabilidad de los últimos meses"
              >
                {months.map((month) => (
                  <Tooltip key={month.period}>
                    <TooltipTrigger asChild>
                      <div className="flex h-full flex-1 cursor-default items-end">
                        <div
                          className={cn(
                            "w-full rounded-sm",
                            month.pct === null
                              ? "bg-muted"
                              : month.pct < 0
                                ? "bg-red-500/70"
                                : "bg-emerald-500/70",
                            month.period === data.currentPeriod &&
                              month.pct !== null &&
                              (month.pct < 0 ? "bg-red-500" : "bg-emerald-500"),
                          )}
                          style={{
                            height: `${month.pct === null ? 8 : Math.max((Math.abs(month.pct) / maxAbsPct) * 100, 8)}%`,
                          }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="first-letter:uppercase">
                        {formatPeriod(month.period)}
                      </p>
                      <p>
                        {month.pct === null
                          ? "Sin egresos cargados"
                          : `${formatPercent(month.pct)} de rentabilidad`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                {months.map((month) => (
                  <span
                    key={month.period}
                    className="flex-1 truncate text-center text-[10px] text-muted-foreground"
                  >
                    {formatPeriod(month.period, "short")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </FinanceTile>
      </div>
    </Panel>
  );
}
