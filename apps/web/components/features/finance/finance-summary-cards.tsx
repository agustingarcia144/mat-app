"use client";

import { ArrowDownLeft, ArrowUpRight, Repeat, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/components/features/finance/finance-display";
import { cn } from "@/lib/utils";

export default function FinanceSummaryCards({
  incomeArs,
  expenseArs,
  netResultArs,
  activeRecurringRules,
}: {
  incomeArs: number;
  expenseArs: number;
  netResultArs: number;
  activeRecurringRules: number;
}) {
  const isNegative = netResultArs < 0;

  const cards = [
    {
      title: "Ingresos externos",
      value: formatCurrency(incomeArs),
      detail: "Fuera de pagos de membresía",
      icon: ArrowDownLeft,
      valueClassName: "text-emerald-600",
      iconClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "Egresos",
      value: formatCurrency(expenseArs),
      detail: "Gastos del período",
      icon: ArrowUpRight,
      valueClassName: "text-rose-600",
      iconClassName: "border-rose-500/25 bg-rose-500/10 text-rose-600",
    },
    {
      title: "Resultado neto",
      value: formatCurrency(netResultArs),
      detail: "Ingresos externos menos egresos",
      icon: Wallet,
      valueClassName: isNegative ? "text-rose-600" : "text-foreground",
      iconClassName: isNegative
        ? "border-rose-500/25 bg-rose-500/10 text-rose-600"
        : "border-border bg-muted text-foreground",
    },
    {
      title: "Recurrentes activos",
      value: `${activeRecurringRules}`,
      detail: "Se registran solos cada mes",
      icon: Repeat,
      valueClassName: "text-foreground",
      iconClassName: "border-blue-500/25 bg-blue-500/10 text-blue-600",
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className="border-border/70 shadow-sm transition-colors hover:border-border"
        >
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
  );
}
