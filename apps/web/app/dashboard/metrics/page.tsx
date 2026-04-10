"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Dumbbell } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METRIC_CARDS = [
  {
    title: "Balance Financiero",
    description:
      "Estado general de pagos, cobrado aprobado, pendientes y evolucion mensual con graficos.",
    href: "/dashboard/metrics/payments",
    icon: BarChart3,
  },
  {
    title: "Metricas de Ejercicios",
    description:
      "Seguimiento por alumno para revisar actividad, pesos y progreso por planificacion.",
    href: "/dashboard/metrics/exercises",
    icon: Dumbbell,
  },
] as const;

export default function MetricsIndexPage() {
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const visibleCards = METRIC_CARDS.filter(
    (card) =>
      card.href !== "/dashboard/metrics/payments" ||
      membership?.role === "admin",
  );

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">Metricas</h1>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Cada metrica vive en su propia card para entrar directo al analisis
          que necesites.
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
