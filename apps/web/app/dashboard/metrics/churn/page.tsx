"use client";

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Percent,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
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
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, 1));
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
  suffix = "",
}: {
  value?: number | null;
  suffix?: string;
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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
        isPositive &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        isNegative && "border-red-500/30 bg-red-500/10 text-red-600",
        !isPositive &&
          !isNegative &&
          "border-blue-500/30 bg-blue-500/10 text-blue-600",
      )}
    >
      {isPositive ? <ArrowUp className="size-3" /> : null}
      {isNegative ? <ArrowDown className="size-3" /> : null}
      {value > 0 ? "+" : ""}
      {value.toLocaleString("es-AR", {
        maximumFractionDigits: 1,
      })}
      {suffix}
    </span>
  );
}

export default function ChurnMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>();
  const data = useQuery(
    api.metrics.getChurnMetrics,
    canQuery && isAdmin ? { selectedPeriod } : "skip",
  );

  if (
    !canQuery ||
    membership === undefined ||
    (isAdmin && data === undefined)
  ) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <h1 className="text-2xl font-bold md:text-3xl">Churn</h1>
        <p className="text-sm text-muted-foreground">
          Cargando retencion y bajas de alumnos...
        </p>
      </DashboardPageContainer>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Solo administradores pueden ver churn.
        </div>
      </DashboardPageContainer>
    );
  }

  if (data === undefined) {
    return null;
  }

  const selected = data.selectedOverview;
  const previousPeriodLabel = data.previousPeriod
    ? formatPeriod(data.previousPeriod)
    : null;

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
          <h1 className="text-2xl font-bold md:text-3xl">Churn</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Bajas de alumnos contra la base activa al inicio del periodo.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Retencion del periodo</h2>
            <p className="text-sm text-muted-foreground">
              {formatPeriod(data.selectedPeriod)}
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
                {data.availablePeriods.map((period) => (
                  <SelectItem key={period} value={period}>
                    {formatPeriod(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Churn"
            value={formatPercent(selected.churnRatePct)}
            detail={`${selected.churnedMembers} bajas sobre ${selected.startingMembers} alumnos iniciales`}
            icon={Percent}
            tone={selected.churnRatePct > 0 ? "red" : "green"}
          />
          <MetricCard
            title="Retencion"
            value={formatPercent(selected.retentionRatePct)}
            detail="Alumnos iniciales que siguieron activos"
            icon={Users}
            tone="green"
          />
          <MetricCard
            title="Altas"
            value={`${selected.newMembers}`}
            detail="Nuevas suscripciones del periodo"
            icon={UserPlus}
            tone="blue"
          />
          <MetricCard
            title="Crecimiento neto"
            value={`${selected.netGrowth > 0 ? "+" : ""}${selected.netGrowth}`}
            detail={`${selected.endingMembers} alumnos vigentes al cierre`}
            icon={selected.netGrowth < 0 ? UserMinus : Users}
            tone={selected.netGrowth < 0 ? "red" : "green"}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Ultimos periodos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Altas</TableHead>
                  <TableHead>Bajas</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead>Churn</TableHead>
                  <TableHead>Variacion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthlyOverview.map((period) => (
                  <TableRow
                    key={period.period}
                    className={cn(
                      period.period === data.selectedPeriod && "bg-accent/20",
                    )}
                  >
                    <TableCell className="font-medium">
                      {formatPeriod(period.period)}
                    </TableCell>
                    <TableCell>{period.startingMembers}</TableCell>
                    <TableCell>{period.newMembers}</TableCell>
                    <TableCell>{period.churnedMembers}</TableCell>
                    <TableCell>{period.endingMembers}</TableCell>
                    <TableCell>{formatPercent(period.churnRatePct)}</TableCell>
                    <TableCell>
                      {period.netGrowth > 0 ? "+" : ""}
                      {period.netGrowth}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Comparacion mensual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Churn vs mes anterior
                </span>
                <DeltaPill
                  value={data.comparison?.churnRateDeltaPct}
                  suffix="%"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Bajas vs mes anterior
                </span>
                <DeltaPill value={data.comparison?.churnedMembersDelta} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Base final vs mes anterior
                </span>
                <DeltaPill value={data.comparison?.endingMembersDelta} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Bajas por plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected.churnedByPlan.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hubo bajas en este periodo.
                </p>
              ) : (
                selected.churnedByPlan.map((plan) => (
                  <div
                    key={plan.planId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {plan.planName}
                    </span>
                    <span className="text-muted-foreground">
                      {plan.churnedCount}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </DashboardPageContainer>
  );
}
