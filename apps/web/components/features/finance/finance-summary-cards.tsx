"use client";

import { ArrowDown, ArrowUp, Repeat, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

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
  const cards = [
    {
      title: "Ingresos externos",
      value: formatCurrency(incomeArs),
      detail: "Fuera de pagos de membresía",
      icon: ArrowUp,
      className: "text-emerald-600",
    },
    {
      title: "Egresos",
      value: formatCurrency(expenseArs),
      detail: "Gastos del período",
      icon: ArrowDown,
      className: "text-amber-600",
    },
    {
      title: "Resultado neto",
      value: formatCurrency(netResultArs),
      detail: "Ingresos externos menos egresos",
      icon: Wallet,
      className: netResultArs < 0 ? "text-red-600" : "text-foreground",
    },
    {
      title: "Recurrentes activos",
      value: `${activeRecurringRules}`,
      detail: "Egresos mensuales configurados",
      icon: Repeat,
      className: "text-blue-600",
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="bg-card/70">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`size-4 ${card.className}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${card.className}`}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
