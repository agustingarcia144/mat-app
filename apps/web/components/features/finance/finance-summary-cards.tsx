"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatCurrency } from "@/components/features/finance/finance-display";
import { cn } from "@/lib/utils";

type Summary = {
  incomeArs: number;
  expenseArs: number;
  netResultArs: number;
  activeRecurringRules: number;
};

/**
 * Change vs the previous period. `higherIsBetter` decides the color: more
 * income is good, more expenses is not.
 */
function Delta({
  current,
  previous,
  higherIsBetter,
}: {
  current: number;
  previous?: number;
  higherIsBetter: boolean;
}) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) {
    return <span className="text-muted-foreground">Igual que el mes anterior</span>;
  }
  const isGood = higherIsBetter ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        isGood
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatCurrency(Math.abs(diff))} vs mes anterior
    </span>
  );
}

function Tile({
  label,
  value,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-2xl font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </p>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

export default function FinanceSummaryCards({
  current,
  previous,
}: {
  current: Summary;
  previous?: Summary;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile
        label="Ingresos externos"
        value={formatCurrency(current.incomeArs)}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      >
        <Delta
          current={current.incomeArs}
          previous={previous?.incomeArs}
          higherIsBetter
        />
      </Tile>
      <Tile
        label="Egresos"
        value={formatCurrency(current.expenseArs)}
        valueClassName="text-rose-600 dark:text-rose-400"
      >
        <Delta
          current={current.expenseArs}
          previous={previous?.expenseArs}
          higherIsBetter={false}
        />
      </Tile>
      <Tile
        label="Balance de movimientos"
        value={formatCurrency(current.netResultArs)}
        valueClassName={
          current.netResultArs < 0 ? "text-rose-600 dark:text-rose-400" : undefined
        }
      >
        Sin membresías ·{" "}
        <Link
          href="/dashboard/metrics/payments"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          ver resultado total
        </Link>
      </Tile>
      <Tile
        label="Recurrentes activos"
        value={String(current.activeRecurringRules)}
      >
        Se registran solos cada mes
      </Tile>
    </div>
  );
}
