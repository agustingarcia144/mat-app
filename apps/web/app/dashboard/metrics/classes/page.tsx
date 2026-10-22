"use client";

import { useQuery } from "convex/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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
  KpiGrid,
  KpiTile,
  MetricsEmpty,
  MetricsPageHeader,
  MetricsSection,
  RateBadge,
  formatCount,
  formatPercent,
} from "@/components/features/metrics/metrics-ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit" })
    .format(new Date(Number(year), Number(month) - 1, 1))
    .replace(".", "");
}

function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}hs`;
}

/** Colors a rate green / amber / red against its thresholds. */
function rateClass(
  value: number | null,
  good: number,
  fair: number,
  lowerIsBetter = false,
) {
  if (value === null) return undefined;
  const isGood = lowerIsBetter ? value <= good : value >= good;
  const isFair = lowerIsBetter ? value <= fair : value >= fair;
  if (isGood) return "text-emerald-600 dark:text-emerald-400";
  if (isFair) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

const HEADER_PROPS = {
  title: "Clases",
  description:
    "Asistencia, ocupación, horarios pico y tendencia mensual de todas las clases.",
};

export default function ClassMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.classMetrics.getClassMetrics,
    canQuery ? {} : "skip",
  );

  if (!canQuery || data === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <MetricsPageHeader {...HEADER_PROPS} />
        <KpiGrid>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))}
        </KpiGrid>
        <Skeleton className="h-[340px] rounded-xl" />
      </DashboardPageContainer>
    );
  }

  const { overview, busiestHours, busiestDays, popularClasses, monthlyTrend } =
    data;
  const closedReservations = overview.totalAttended + overview.totalNoShow;

  const hourChartData = [...busiestHours]
    .sort((a, b) => a.hour - b.hour)
    .map((h) => ({ label: formatHour(h.hour), count: h.count }));
  const maxHourCount = Math.max(...hourChartData.map((h) => h.count), 0);

  const dayChartData = busiestDays.map((d) => ({
    label: d.label,
    count: d.count,
  }));
  const maxDayCount = Math.max(...dayChartData.map((d) => d.count), 0);

  const trendChartData = monthlyTrend.map((m) => ({
    label: formatPeriod(m.period),
    clases: m.schedulesHeld,
    reservas: m.totalReservations,
    asistencia: m.attendanceRate,
  }));

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <MetricsPageHeader {...HEADER_PROPS} />

      <KpiGrid>
        <KpiTile
          label="Asistencia"
          value={formatPercent(overview.attendanceRate)}
          valueClassName={rateClass(overview.attendanceRate, 80, 50)}
          detail={`${formatCount(overview.totalAttended)} de ${formatCount(closedReservations)} reservas cerradas`}
        />
        <KpiTile
          label="No-show"
          value={formatPercent(overview.noShowRate)}
          valueClassName={rateClass(overview.noShowRate, 10, 25, true)}
          detail={`${formatCount(overview.totalNoShow)} no se presentaron`}
        />
        <KpiTile
          label="Ocupación promedio"
          value={formatPercent(overview.avgOccupancyRate)}
          valueClassName={rateClass(overview.avgOccupancyRate, 70, 40)}
          detail={`${formatCount(overview.totalSchedulesHeld)} clases dictadas`}
        />
        <KpiTile
          label="Cancelación"
          value={formatPercent(overview.cancellationRate)}
          detail={`${formatCount(overview.totalConfirmedPending)} reservas pendientes a futuro`}
        />
      </KpiGrid>

      <MetricsSection
        title="Tendencia mensual"
        description="Clases dictadas y reservas por mes, con el % de asistencia."
      >
        {trendChartData.length === 0 ? (
          <MetricsEmpty>Todavía no hay clases dictadas.</MetricsEmpty>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={trendChartData}
              margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
              <YAxis
                yAxisId="left"
                {...CHART_AXIS_PROPS}
                allowDecimals={false}
                width={32}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                {...CHART_AXIS_PROPS}
                domain={[0, 100]}
                unit="%"
                width={40}
              />
              <Tooltip
                {...CHART_TOOLTIP_PROPS}
                labelClassName="capitalize"
                formatter={(value, name) =>
                  name === "% Asistencia"
                    ? [formatPercent(Number(value)), name]
                    : [Number(value), String(name)]
                }
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                yAxisId="left"
                dataKey="clases"
                name="Clases dictadas"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                yAxisId="left"
                dataKey="reservas"
                name="Reservas"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="asistencia"
                name="% Asistencia"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </MetricsSection>

      <section className="grid gap-4 lg:grid-cols-2">
        <MetricsSection
          title="Horarios más ocupados"
          description="Clases dictadas por franja horaria."
        >
          {hourChartData.length === 0 ? (
            <MetricsEmpty>Sin datos suficientes.</MetricsEmpty>
          ) : (
            <PeakBarChart
              data={hourChartData}
              max={maxHourCount}
              unit="Clases"
            />
          )}
        </MetricsSection>

        <MetricsSection
          title="Días más concurridos"
          description="Clases dictadas por día de la semana."
        >
          {maxDayCount === 0 ? (
            <MetricsEmpty>Sin datos suficientes.</MetricsEmpty>
          ) : (
            <PeakBarChart data={dayChartData} max={maxDayCount} unit="Clases" />
          )}
        </MetricsSection>
      </section>

      <MetricsSection
        title="Clases más populares"
        description="Ordenadas por reservas totales."
        contentClassName="p-0"
      >
        {popularClasses.length === 0 ? (
          <div className="px-6 pb-6">
            <MetricsEmpty>Todavía no hay reservas.</MetricsEmpty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Clase</TableHead>
                  <TableHead className="text-right">Sesiones</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Asistidos</TableHead>
                  <TableHead className="pr-6 text-right">Asistencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popularClasses.map((cls) => (
                  <TableRow key={cls.classId}>
                    <TableCell className="pl-6 font-medium">
                      {cls.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {cls.schedules}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cls.reservations}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cls.attended}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <RateBadge value={cls.attendanceRate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="border-t px-6 py-3 text-xs text-muted-foreground">
          Histórico: {formatCount(overview.totalSchedulesHeld)} clases ·{" "}
          {formatCount(overview.totalReservations)} reservas ·{" "}
          {formatCount(overview.totalAttended)} asistidos ·{" "}
          {formatCount(overview.totalNoShow)} no-shows
        </p>
      </MetricsSection>
    </DashboardPageContainer>
  );
}

/** Single-series bar chart that highlights the peak bucket. */
function PeakBarChart({
  data,
  max,
  unit,
}: {
  data: { label: string; count: number }[];
  max: number;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          className="stroke-border/50"
        />
        <XAxis
          dataKey="label"
          {...CHART_AXIS_PROPS}
          interval="preserveStartEnd"
        />
        <YAxis {...CHART_AXIS_PROPS} allowDecimals={false} width={28} />
        <Tooltip
          {...CHART_TOOLTIP_PROPS}
          formatter={(value) => [Number(value), unit]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((entry) => (
            <Cell
              key={entry.label}
              fill={entry.count === max && max > 0 ? "#10b981" : "#94a3b8"}
              fillOpacity={entry.count === max && max > 0 ? 1 : 0.6}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
