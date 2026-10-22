"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Dumbbell,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Skeleton } from "@/components/ui/skeleton";

const METRIC_MODULES = [
  {
    title: "Ejercicios",
    description: "Pesos, repeticiones y progreso de cada alumno por plani.",
    href: "/dashboard/metrics/exercises",
    icon: Dumbbell,
  },
  {
    title: "Asistencia por miembro",
    description:
      "Quiénes vienen más, quiénes menos y quiénes dejaron de venir.",
    href: "/dashboard/metrics/attendance",
    icon: UserCheck,
  },
  {
    title: "Clases",
    description: "Asistencia, no-shows, ocupación y horarios pico.",
    href: "/dashboard/metrics/classes",
    icon: CalendarDays,
    adminOnly: true,
  },
  {
    title: "Churn",
    description: "Retención, bajas, altas y crecimiento neto por mes.",
    href: "/dashboard/metrics/churn",
    icon: UserMinus,
    adminOnly: true,
  },
] as const;

export default function MetricsIndexPage() {
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const visibleModules = METRIC_MODULES.filter(
    (module) => !("adminOnly" in module && module.adminOnly) || isAdmin,
  );

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">Métricas</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Progreso de los alumnos, asistencia y retención del gimnasio.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {membership === undefined
          ? Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))
          : visibleModules.map((module) => (
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
    </DashboardPageContainer>
  );
}
