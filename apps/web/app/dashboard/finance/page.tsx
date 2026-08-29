"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgSettings } from "@/hooks/use-org-settings";

const FINANCE_CARDS = [
  {
    title: "Pagos",
    description:
      "Gestiona pagos pendientes, comprobantes, bonificaciones y el historial de cobros.",
    href: "/dashboard/payments",
    icon: CreditCard,
  },
  {
    title: "Ingresos y egresos",
    description:
      "Registra movimientos externos, egresos recurrentes y el balance operativo.",
    href: "/dashboard/income-expenses",
    icon: Wallet,
    featureFlag: "financeEnabled",
  },
  {
    title: "Balance financiero",
    description:
      "Resumen mensual de ingresos, egresos, rentabilidad y métodos de pago por período.",
    href: "/dashboard/metrics/payments",
    icon: TrendingUp,
  },
] as const;

export default function FinanceIndexPage() {
  const settings = useOrgSettings();
  const visibleCards = FINANCE_CARDS.filter(
    (card) =>
      !("featureFlag" in card) ||
      card.featureFlag !== "financeEnabled" ||
      settings?.financeEnabled !== false,
  );

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">Finanzas</h1>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Cada modulo financiero vive en su propia card para entrar directo a
          la gestion que necesites.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {visibleCards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <Card className="h-full border-border/70 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="space-y-4">
                <div className="flex size-12 items-center justify-center rounded-2xl border bg-background/70">
                  <card.icon className="size-5" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl">{card.title}</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm font-medium text-foreground">
                <span>Abrir vista</span>
                <ArrowRight className="size-4" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </DashboardPageContainer>
  );
}
