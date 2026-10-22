"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import {
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_PROPS,
  DeltaPill,
  KpiGrid,
  KpiTile,
  MetricsEmpty,
  MetricsPageHeader,
  MetricsSection,
  formatPercent,
} from "@/components/features/metrics/metrics-ui";
import { Skeleton } from "@/components/ui/skeleton";
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

function formatPeriod(period: string, month: "long" | "short" = "long") {
  const [year, monthNumber] = period.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", {
    month,
    year: month === "long" ? "numeric" : "2-digit",
  }).format(new Date(year, monthNumber - 1, 1));
  // CSS `capitalize` would also turn "de" into "De".
  return month === "long"
    ? label.charAt(0).toUpperCase() + label.slice(1)
    : label;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
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

  const header = (
    <MetricsPageHeader
      title="Churn"
      description={
        data?.previousPeriod ? (
          <>
            {formatPeriod(data.selectedPeriod)} comparado con{" "}
            {formatPeriod(data.previousPeriod).toLowerCase()}
          </>
        ) : (
          "Bajas de alumnos contra la base activa al inicio de cada mes."
        )
      }
      actions={
        data ? (
          <Select
            value={data.selectedPeriod}
            onValueChange={(value) => setSelectedPeriod(value)}
          >
            <SelectTrigger className="w-full md:w-60">
              <SelectValue placeholder="Elegí un período" />
            </SelectTrigger>
            <SelectContent>
              {data.availablePeriods.map((period) => (
                <SelectItem key={period} value={period}>
                  {formatPeriod(period)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
    />
  );

  if (
    !canQuery ||
    membership === undefined ||
    (isAdmin && data === undefined)
  ) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <KpiGrid>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
        <Skeleton className="h-[340px] rounded-xl" />
      </DashboardPageContainer>
    );
  }

  if (!isAdmin || data === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <MetricsEmpty>Solo administradores pueden ver el churn.</MetricsEmpty>
      </DashboardPageContainer>
    );
  }

  const selected = data.selectedOverview;
  const comparison = data.comparison;
  const chartData = [...data.monthlyOverview]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((period) => ({
      period: period.period,
      Altas: period.newMembers,
      Bajas: period.churnedMembers,
    }));

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {header}

      <KpiGrid>
        <KpiTile
          label="Churn"
          value={formatPercent(selected.churnRatePct)}
          valueClassName={
            selected.churnRatePct > 0
              ? "text-red-600 dark:text-red-400"
              : undefined
          }
          delta={
            <DeltaPill
              value={comparison?.churnRateDeltaPct}
              suffix=" pp"
              invert
            />
          }
          detail={`${selected.churnedMembers} bajas sobre ${selected.churnBaseMembers} alumnos`}
        />
        <KpiTile
          label="Retención"
          value={formatPercent(selected.retentionRatePct)}
          detail="Alumnos iniciales que siguieron activos"
        />
        <KpiTile
          label="Altas"
          value={`${selected.newMembers}`}
          detail="Nuevas suscripciones del mes"
        />
        <KpiTile
          label="Crecimiento neto"
          value={signed(selected.netGrowth)}
          valueClassName={
            selected.netGrowth < 0
              ? "text-red-600 dark:text-red-400"
              : selected.netGrowth > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : undefined
          }
          delta={
            <DeltaPill
              value={comparison?.endingMembersDelta}
              label="en la base"
            />
          }
          detail={`${selected.endingMembers} alumnos vigentes al cierre`}
        />
      </KpiGrid>

      <MetricsSection
        title="Altas y bajas"
        description="Nuevas suscripciones contra bajas, mes a mes."
      >
        {chartData.length === 0 ? (
          <MetricsEmpty>Todavía no hay períodos para comparar.</MetricsEmpty>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis
                dataKey="period"
                {...CHART_AXIS_PROPS}
                tickFormatter={(v: string) =>
                  formatPeriod(v, "short").replace(".", "")
                }
              />
              <YAxis {...CHART_AXIS_PROPS} allowDecimals={false} width={32} />
              <Tooltip
                {...CHART_TOOLTIP_PROPS}
                labelFormatter={(v) => formatPeriod(String(v))}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="Altas"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="Bajas"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </MetricsSection>

      <MetricsSection
        title="Últimos períodos"
        description="Tocá un período para verlo en detalle."
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Período</TableHead>
                <TableHead className="text-right">Inicio</TableHead>
                <TableHead className="text-right">Altas</TableHead>
                <TableHead className="text-right">Bajas</TableHead>
                <TableHead className="text-right">Cierre</TableHead>
                <TableHead className="text-right">Churn</TableHead>
                <TableHead className="pr-6 text-right">Variación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.monthlyOverview.map((period) => {
                const isSelected = period.period === data.selectedPeriod;
                return (
                  <TableRow
                    key={period.period}
                    onClick={() => setSelectedPeriod(period.period)}
                    className={cn(
                      "cursor-pointer",
                      isSelected && "bg-accent/40 hover:bg-accent/50",
                    )}
                    aria-selected={isSelected}
                  >
                    <TableCell className="pl-6 font-medium">
                      {formatPeriod(period.period)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {period.startingMembers}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {period.newMembers}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {period.churnedMembers}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {period.endingMembers}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(period.churnRatePct)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-6 text-right font-medium tabular-nums",
                        period.netGrowth < 0 &&
                          "text-red-600 dark:text-red-400",
                        period.netGrowth > 0 &&
                          "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {signed(period.netGrowth)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </MetricsSection>
    </DashboardPageContainer>
  );
}
