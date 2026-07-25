"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarClock,
  Dumbbell,
  Flame,
  Search,
  Snowflake,
  UserX,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

type AttendanceSource = "classes" | "planification" | "mixed" | "none";

type AttendanceMember = {
  userId: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  joinedAt: number;
  source: AttendanceSource;
  activeDays: number;
  classAttended: number;
  sessionsLogged: number;
  noShow: number;
  cancelled: number;
  upcoming: number;
  closedReservations: number;
  attendanceRate: number | null;
  perWeek: number;
  lastActivityOn: string | null;
  lastActivityAt: number | null;
  daysSinceLastActivity: number | null;
  favoriteClass: { name: string; count: number } | null;
  favoriteDay: { day: number; label: string; count: number } | null;
};

const RANGE_OPTIONS = [
  { value: "30", label: "Ultimos 30 dias" },
  { value: "90", label: "Ultimos 90 dias" },
  { value: "180", label: "Ultimos 6 meses" },
  { value: "0", label: "Historico completo" },
] as const;

type SortKey = "most" | "least" | "rate" | "cold";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "most", label: "Mas dias presentes" },
  { value: "least", label: "Menos dias presentes" },
  { value: "rate", label: "Peor % en clases" },
  { value: "cold", label: "Mas dias sin venir" },
];

const SOURCE_LABEL: Record<AttendanceSource, string> = {
  classes: "Clases",
  planification: "Plani",
  mixed: "Mixto",
  none: "Sin registro",
};

/** Rows rendered per batch in the full-roster table. */
const TABLE_PAGE_SIZE = 15;

const SOURCE_CLASS: Record<AttendanceSource, string> = {
  classes: "bg-indigo-500/10 text-indigo-600",
  planification: "bg-sky-500/10 text-sky-600",
  mixed: "bg-emerald-500/10 text-emerald-600",
  none: "bg-muted text-muted-foreground",
};

function formatDate(ts: number | null) {
  if (ts === null) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function lastVisitLabel(member: AttendanceMember) {
  if (member.daysSinceLastActivity === null) return "Sin actividad";
  if (member.daysSinceLastActivity === 0) return "Hoy";
  if (member.daysSinceLastActivity === 1) return "Ayer";
  return `Hace ${member.daysSinceLastActivity} dias`;
}

/** How the member registers presence: check-in, planification, or both. */
function SourceBadge({ source }: { source: AttendanceSource }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        SOURCE_CLASS[source],
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

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
        {Icon && (
          <Icon className={cn("h-4 w-4 text-muted-foreground", valueClass)} />
        )}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold md:text-3xl", valueClass)}>
        {value}
      </p>
      {sub && (
        <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

/** Ranked row with a bar whose width is relative to the busiest member. */
function RankRow({
  position,
  member,
  max,
  tone,
}: {
  position: number;
  member: AttendanceMember;
  max: number;
  tone: "hot" | "cold";
}) {
  const widthPct = max > 0 ? Math.max((member.activeDays / max) * 100, 2) : 0;
  const breakdown = [
    member.classAttended > 0 ? `${member.classAttended} clases` : null,
    member.sessionsLogged > 0 ? `${member.sessionsLogged} planis` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-5 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {position}
      </span>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={member.imageUrl ?? undefined} alt={member.name} />
        <AvatarFallback className="text-[11px]">
          {initials(member.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{member.name}</span>
            <SourceBadge source={member.source} />
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {member.activeDays}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "hot" ? "bg-emerald-500" : "bg-amber-500",
            )}
            style={{ width: `${widthPct}%` }}
          />
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {lastVisitLabel(member)}
          {breakdown && ` · ${breakdown}`}
          {member.perWeek > 0 && ` · ${member.perWeek}/sem`}
        </p>
      </div>
    </div>
  );
}

export default function AttendanceMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const [range, setRange] = useState<string>("30");
  const [sortKey, setSortKey] = useState<SortKey>("most");
  const [search, setSearch] = useState("");
  // The table renders in batches: the whole roster at once is what makes the
  // page crawl on a large gym. Reset to the first batch whenever the list
  // changes underneath, done here in the handlers rather than in an effect.
  const [visibleRows, setVisibleRows] = useState(TABLE_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const handleRangeChange = useCallback((value: string) => {
    setRange(value);
    setVisibleRows(TABLE_PAGE_SIZE);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortKey(value as SortKey);
    setVisibleRows(TABLE_PAGE_SIZE);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setVisibleRows(TABLE_PAGE_SIZE);
  }, []);

  const data = useQuery(
    api.classMetrics.getMemberAttendanceMetrics,
    canQuery ? { rangeDays: Number(range) } : "skip",
  );

  const members = useMemo<AttendanceMember[]>(
    () => (data?.members ?? []) as AttendanceMember[],
    [data],
  );

  const topMembers = useMemo(
    () => members.filter((m) => m.activeDays > 0).slice(0, 10),
    [members],
  );

  // Least-present first; members with no activity at all bubble to the top.
  const bottomMembers = useMemo(
    () =>
      [...members]
        .sort((a, b) => {
          if (a.activeDays !== b.activeDays) return a.activeDays - b.activeDays;
          return (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0);
        })
        .slice(0, 10),
    [members],
  );

  const tableMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(term) ||
            Boolean(m.email?.toLowerCase().includes(term)),
        )
      : members;

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "least":
          return a.activeDays - b.activeDays || a.name.localeCompare(b.name);
        case "rate":
          return (
            (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101) ||
            b.closedReservations - a.closedReservations
          );
        case "cold":
          return (
            (b.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER) -
            (a.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER)
          );
        default:
          return b.activeDays - a.activeDays || a.name.localeCompare(b.name);
      }
    });
  }, [members, search, sortKey]);

  const renderedMembers = useMemo(
    () => tableMembers.slice(0, visibleRows),
    [tableMembers, visibleRows],
  );
  const hasMoreRows = visibleRows < tableMembers.length;

  // Grow the batch as the sentinel below the table scrolls into view.
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreRows) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleRows((current) => current + TABLE_PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreRows]);

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
          <div className="h-72 rounded-2xl bg-muted" />
        </div>
      </DashboardPageContainer>
    );
  }

  const {
    overview,
    distribution,
    weekdayDistribution,
    dormantMembers,
    bySource,
    range: rangeInfo,
  } = data;
  const maxActiveDays = topMembers[0]?.activeDays ?? 0;
  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    "Historico completo";

  const distributionData = distribution.map((bucket) => ({
    label: bucket.label,
    miembros: bucket.count,
    key: bucket.key,
  }));

  const weekdayData = weekdayDistribution.map((entry) => ({
    label: entry.label,
    asistencias: entry.count,
  }));
  const maxWeekdayCount = Math.max(...weekdayData.map((d) => d.asistencias), 0);

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/metrics"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Metricas
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">
            Asistencia por Miembro
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Dias presentes por miembro, contando tanto el check-in de clases
            como las planificaciones completadas. Un dia cuenta una sola vez.
          </p>
        </div>
        <Select value={range} onValueChange={handleRangeChange}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Dias de asistencia"
          value={overview.totalActiveDays.toLocaleString("es-AR")}
          sub={`${rangeLabel.toLowerCase()} · ${rangeInfo.weeks} semanas`}
          icon={CalendarClock}
        />
        <KpiTile
          label="Promedio por miembro"
          value={overview.avgActiveDaysPerMember.toLocaleString("es-AR")}
          sub={`Mediana ${overview.medianActiveDays} · ${overview.avgPerWeek}/semana`}
          tone="blue"
          icon={Dumbbell}
        />
        <KpiTile
          label="Miembros que vinieron"
          value={`${overview.membersWithAttendance}/${overview.activeMembers}`}
          sub={`${formatPercent(
            overview.activeMembers > 0
              ? Math.round(
                  (overview.membersWithAttendance / overview.activeMembers) *
                    1000,
                ) / 10
              : null,
          )} del padron activo`}
          tone="green"
          icon={Flame}
        />
        <KpiTile
          label="Sin ninguna actividad"
          value={overview.inactiveMembers.toLocaleString("es-AR")}
          sub={`Ni check-in de clase ni plani registrada`}
          tone={overview.inactiveMembers > 0 ? "red" : "green"}
          icon={UserX}
        />
      </div>

      {/* Signal split — makes it explicit how members register presence */}
      <Card className="border-border/60 bg-card/80">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="text-xs text-muted-foreground">
            Como registran presencia:
          </div>
          {(
            [
              ["mixed", bySource.mixed, "Clases + plani"],
              ["classes", bySource.classes, "Solo clases"],
              ["planification", bySource.planification, "Solo plani"],
              ["none", bySource.none, "Sin registro"],
            ] as const
          ).map(([key, count, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {count}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  SOURCE_CLASS[key],
                )}
              >
                {label}
              </span>
            </div>
          ))}
          <div className="ml-auto text-[11px] text-muted-foreground">
            {overview.totalClassAttended} check-ins ·{" "}
            {overview.totalSessionsLogged} planis · {overview.totalNoShow}{" "}
            no-shows
          </div>
        </CardContent>
      </Card>

      {/* Top / bottom rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Flame className="size-4 text-emerald-600" />
              Los que mas vienen
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Top 10 por dias presentes en el periodo
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-3">
            {topMembers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin actividad registrada en el periodo
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {topMembers.map((member, index) => (
                  <RankRow
                    key={member.userId}
                    position={index + 1}
                    member={member}
                    max={maxActiveDays}
                    tone="hot"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Snowflake className="size-4 text-amber-600" />
              Los que menos vienen
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Miembros activos con menos dias presentes en el periodo
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-3">
            {bottomMembers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin miembros activos
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {bottomMembers.map((member, index) => (
                  <RankRow
                    key={member.userId}
                    position={index + 1}
                    member={member}
                    max={maxActiveDays}
                    tone="cold"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two balanced charts: how many days members show up, and on which days */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Distribucion de asistencia
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cuantos miembros hay en cada rango de dias presentes
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={distributionData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.5}
                />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  formatter={(value: unknown) => [Number(value), "Miembros"]}
                  labelFormatter={(label: unknown) => `${label} dias`}
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
                <Bar dataKey="miembros" radius={[3, 3, 0, 0]}>
                  {distributionData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.key === "none" ? "#ef4444" : "#6366f1"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Dias que mas vienen
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Dias de asistencia por dia de la semana (clases + planis)
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={weekdayData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.5}
                />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  formatter={(value: unknown) => [Number(value), "Asistencias"]}
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
                <Bar dataKey="asistencias" radius={[3, 3, 0, 0]}>
                  {weekdayData.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={
                        entry.asistencias === maxWeekdayCount &&
                        maxWeekdayCount > 0
                          ? "#10b981"
                          : "#10b98180"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Dormant members — full width so the roster spreads across two columns */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Hace rato que no vienen
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Miembros con actividad previa pero 21 dias o mas sin aparecer
          </p>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {dormantMembers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Ningun miembro en riesgo. Buen trabajo.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2">
              {dormantMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarImage
                      src={member.imageUrl ?? undefined}
                      alt={member.name}
                    />
                    <AvatarFallback className="text-[11px]">
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Ultima vez {formatDate(member.lastActivityAt)} ·{" "}
                      {member.activeDays} dias en el periodo
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                    {member.daysSinceLastActivity}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full table */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="gap-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Todos los miembros
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Mostrando {renderedMembers.length} de {tableMembers.length}{" "}
                miembros activos
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Buscar miembro"
                  className="h-9 w-[200px] pl-8"
                />
              </div>
              <Select value={sortKey} onValueChange={handleSortChange}>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tableMembers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin miembros para mostrar
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Miembro</TableHead>
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead className="text-right">Clases</TableHead>
                      <TableHead className="text-right">Planis</TableHead>
                      <TableHead className="text-right">No-show</TableHead>
                      <TableHead className="text-right">% en clases</TableHead>
                      <TableHead className="text-right">Por semana</TableHead>
                      <TableHead className="text-right">Ultima vez</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderedMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7 shrink-0">
                              <AvatarImage
                                src={member.imageUrl ?? undefined}
                                alt={member.name}
                              />
                              <AvatarFallback className="text-[10px]">
                                {initials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                {member.name}
                                <SourceBadge source={member.source} />
                              </p>
                              {member.favoriteClass ? (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {member.favoriteClass.name}
                                  {member.favoriteDay &&
                                    ` · ${member.favoriteDay.label}`}
                                </p>
                              ) : (
                                member.email && (
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {member.email}
                                  </p>
                                )
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {member.activeDays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {member.classAttended}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {member.sessionsLogged}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {member.noShow}
                        </TableCell>
                        <TableCell className="text-right">
                          {member.attendanceRate === null ? (
                            <span
                              className="text-muted-foreground"
                              title="No reserva clases"
                            >
                              -
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                member.attendanceRate >= 80
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : member.attendanceRate >= 50
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-red-500/10 text-red-600",
                              )}
                            >
                              {formatPercent(member.attendanceRate)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {member.perWeek}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs",
                            member.daysSinceLastActivity === null
                              ? "text-red-600"
                              : "text-muted-foreground",
                          )}
                        >
                          {lastVisitLabel(member)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {hasMoreRows && (
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center gap-2 border-t py-4 text-xs text-muted-foreground"
                >
                  <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  Cargando mas miembros...
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
