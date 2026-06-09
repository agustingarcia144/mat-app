"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function formatPercent(value?: number | null, digits = 1) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  })}%`;
}

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit" }).format(
    new Date(Number(year), Number(month) - 1, 1),
  );
}

function formatHour(h: number) {
  return new Intl.DateTimeFormat("es-AR", { hour: "numeric", hour12: false }).format(
    new Date(2000, 0, 1, h),
  );
}

// ── KPI Tile ────────────────────────────────────────────────────────────────
function KpiTile({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red" | "amber" | "blue" | "default";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueClass =
    tone === "green"
      ? "text-emerald-600"
      : tone === "red"
        ? "text-red-600"
        : tone === "amber"
          ? "text-amber-600"
          : tone === "blue"
            ? "text-blue-600"
            : "";
  return (
    <div className="flex min-h-[100px] flex-col rounded-2xl border bg-card/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4 text-muted-foreground", valueClass)} />}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold md:text-3xl", valueClass)}>
        {value}
      </p>
      {sub && <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Attendance badge ─────────────────────────────────────────────────────────
function AttendanceBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">-</span>;
  const color =
    pct >= 80
      ? "text-emerald-600 bg-emerald-500/10"
      : pct >= 50
        ? "text-amber-600 bg-amber-500/10"
        : "text-red-600 bg-red-500/10";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", color)}>
      {formatPercent(pct)}
    </span>
  );
}

export default function ClassMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.classMetrics.getClassMetrics,
    canQuery ? {} : "skip",
  );

  if (!canQuery || data === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        <div className="flex animate-pulse flex-col gap-4">
          <div className="h-8 w-48 rounded-lg bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      </DashboardPageContainer>
    );
  }

  const { overview, busiestHours, busiestDays, popularClasses, monthlyTrend } = data;

  // Sort busiest hours for the bar chart (ascending by hour)
  const hourChartData = [...busiestHours]
    .sort((a, b) => a.hour - b.hour)
    .map((h) => ({ label: `${formatHour(h.hour)}hs`, count: h.count }));

  const maxHourCount = Math.max(...hourChartData.map((h) => h.count), 1);

  const trendChartData = monthlyTrend.map((m) => ({
    label: formatPeriod(m.period),
    clases: m.schedulesHeld,
    reservas: m.totalReservations,
    asistidos: m.attended,
    asistencia: m.attendanceRate,
  }));

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/metrics"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Métricas
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">Métricas de Clases</h1>
        <p className="text-sm text-muted-foreground">
          Asistencia, ocupación, horas pico y tendencia mensual de todas las clases.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="% de Asistencia"
          value={formatPercent(overview.attendanceRate)}
          sub={`${overview.totalAttended} asistidos / ${overview.totalAttended + overview.totalNoShow} cerrados`}
          tone={
            overview.attendanceRate == null
              ? "default"
              : overview.attendanceRate >= 80
                ? "green"
                : overview.attendanceRate >= 50
                  ? "amber"
                  : "red"
          }
          icon={CheckCircle2}
        />
        <KpiTile
          label="Tasa de No-show"
          value={formatPercent(overview.noShowRate)}
          sub={`${overview.totalNoShow} no se presentaron`}
          tone={
            overview.noShowRate == null
              ? "default"
              : overview.noShowRate <= 10
                ? "green"
                : overview.noShowRate <= 25
                  ? "amber"
                  : "red"
          }
          icon={XCircle}
        />
        <KpiTile
          label="Tasa de Cancelación"
          value={formatPercent(overview.cancellationRate)}
          sub={`Sobre ${overview.totalReservations + (overview.totalNoShow ?? 0)} reservas totales`}
          tone="default"
          icon={Calendar}
        />
        <KpiTile
          label="Ocupación Promedio"
          value={formatPercent(overview.avgOccupancyRate)}
          sub={`${overview.totalSchedulesHeld} clases dictadas`}
          tone={
            overview.avgOccupancyRate == null
              ? "default"
              : overview.avgOccupancyRate >= 70
                ? "green"
                : overview.avgOccupancyRate >= 40
                  ? "amber"
                  : "red"
          }
          icon={Users}
        />
      </div>

      {/* Tendency chart */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tendencia Mensual</CardTitle>
          <p className="text-xs text-muted-foreground">
            Clases dictadas y % de asistencia por mes
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={trendChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                allowDecimals={false}
                width={32}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                domain={[0, 100]}
                unit="%"
                width={40}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => {
                  const v = Number(value);
                  const n = String(name);
                  if (n === "% Asistencia") return [`${v}%`, n];
                  return [v, n];
                }}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="clases" name="Clases dictadas" fill="#6366f1" opacity={0.8} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="reservas" name="Reservas" fill="#10b981" opacity={0.7} radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="asistencia"
                name="% Asistencia"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Horas y días */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Busiest hours */}
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Horas más ocupadas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cantidad de clases por franja horaria
            </p>
          </CardHeader>
          <CardContent>
            {hourChartData.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin datos suficientes
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={hourChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip
                    formatter={(value: unknown) => [Number(value), "Clases"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  />
                  <Bar dataKey="count" name="Clases" radius={[3, 3, 0, 0]}>
                    {hourChartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.count === maxHourCount ? "#6366f1" : "#6366f180"}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Busiest days */}
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Días más concurridos</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clases dictadas por día de la semana
            </p>
          </CardHeader>
          <CardContent>
            {busiestDays.every((d) => d.count === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin datos suficientes
              </p>
            ) : (
              <div className="flex items-end gap-2 pt-2">
                {(() => {
                  const maxCount = Math.max(...busiestDays.map((d) => d.count), 1);
                  return busiestDays.map((d) => {
                    const heightPct = Math.max((d.count / maxCount) * 100, d.count > 0 ? 8 : 0);
                    const isMax = d.count === maxCount && d.count > 0;
                    return (
                      <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {d.count > 0 ? d.count : ""}
                        </span>
                        <div className="flex w-full justify-center" style={{ height: 120 }}>
                          <div className="flex w-full max-w-[36px] items-end">
                            <div
                              className={cn(
                                "w-full rounded-t-sm transition-all",
                                d.count === 0
                                  ? "bg-muted"
                                  : isMax
                                    ? "bg-indigo-500"
                                    : "bg-indigo-500/50",
                              )}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{d.label}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popular classes table */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Clases más populares</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ordenadas por reservas totales
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {popularClasses.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin datos de clases
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clase</TableHead>
                  <TableHead className="text-right">Sesiones</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Asistidos</TableHead>
                  <TableHead className="text-right">% Asistencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popularClasses.map((cls) => (
                  <TableRow key={cls.classId}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {cls.schedules}
                    </TableCell>
                    <TableCell className="text-right">{cls.reservations}</TableCell>
                    <TableCell className="text-right">{cls.attended}</TableCell>
                    <TableCell className="text-right">
                      <AttendanceBadge pct={cls.attendanceRate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Extra stat tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Clases dictadas</p>
          <p className="mt-1 text-3xl font-semibold">{overview.totalSchedulesHeld}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Total histórico</p>
        </div>
        <div className="rounded-2xl border bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Reservas activas pendientes</p>
          <p className="mt-1 text-3xl font-semibold text-amber-600">
            {overview.totalConfirmedPending}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">En clases futuras</p>
        </div>
        <div className="rounded-2xl border bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Total reservas históricas</p>
          <p className="mt-1 text-3xl font-semibold">{overview.totalReservations}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {overview.totalAttended} asistidos · {overview.totalNoShow} no-shows
          </p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
