"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Flame, Search, Snowflake } from "lucide-react";
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
import {
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_PROPS,
  KpiGrid,
  KpiTile,
  MetricsEmpty,
  MetricsPageHeader,
  MetricsSection,
  RateBadge,
  ShareBar,
  formatCount,
  formatPercent,
} from "@/components/features/metrics/metrics-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "0", label: "Histórico completo" },
] as const;

type SortKey = "most" | "least" | "rate" | "cold";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "most", label: "Más días presentes" },
  { value: "least", label: "Menos días presentes" },
  { value: "rate", label: "Peor % en clases" },
  { value: "cold", label: "Más días sin venir" },
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
  classes: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  planification: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  mixed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  none: "bg-muted text-muted-foreground",
};

function formatDate(ts: number | null) {
  if (ts === null) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
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
  return `Hace ${member.daysSinceLastActivity} días`;
}

/** How the member registers presence: check-in, planification, or both. */
function SourceBadge({ source }: { source: AttendanceSource }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        SOURCE_CLASS[source],
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function MemberAvatar({
  member,
  className = "size-8",
}: {
  member: Pick<AttendanceMember, "name" | "imageUrl">;
  className?: string;
}) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      <AvatarImage src={member.imageUrl ?? undefined} alt={member.name} />
      <AvatarFallback className="text-[11px]">
        {initials(member.name)}
      </AvatarFallback>
    </Avatar>
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
    <li className="flex items-center gap-3 px-6 py-2.5">
      <span className="w-5 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {position}
      </span>
      <MemberAvatar member={member} />
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
        <ShareBar
          share={widthPct}
          className="mt-1"
          barClassName={tone === "hot" ? "bg-emerald-500" : "bg-amber-500"}
        />
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {lastVisitLabel(member)}
          {breakdown && ` · ${breakdown}`}
          {member.perWeek > 0 && ` · ${member.perWeek}/sem`}
        </p>
      </div>
    </li>
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

  const header = (
    <MetricsPageHeader
      title="Asistencia por miembro"
      description="Días presentes de cada miembro, sumando check-ins de clases y planis completadas. Cada día cuenta una sola vez."
      actions={
        <Select value={range} onValueChange={handleRangeChange}>
          <SelectTrigger className="w-full md:w-52">
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
      }
    />
  );

  if (!canQuery || data === undefined) {
    return (
      <DashboardPageContainer className="space-y-6 py-6 md:py-10">
        {header}
        <KpiGrid>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))}
        </KpiGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
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
    "Histórico completo";
  const attendingSharePct =
    overview.activeMembers > 0
      ? Math.round(
          (overview.membersWithAttendance / overview.activeMembers) * 1000,
        ) / 10
      : null;

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

  const sourceSplit = [
    ["mixed", bySource.mixed, "Clases + plani"],
    ["classes", bySource.classes, "Solo clases"],
    ["planification", bySource.planification, "Solo plani"],
    ["none", bySource.none, "Sin registro"],
  ] as const;

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {header}

      <KpiGrid>
        <KpiTile
          label="Días de asistencia"
          value={formatCount(overview.totalActiveDays)}
          detail={`${rangeLabel} · ${rangeInfo.weeks} semanas`}
        />
        <KpiTile
          label="Promedio por miembro"
          value={overview.avgActiveDaysPerMember.toLocaleString("es-AR")}
          detail={`Mediana ${overview.medianActiveDays} · ${overview.avgPerWeek} por semana`}
        />
        <KpiTile
          label="Miembros que vinieron"
          value={`${overview.membersWithAttendance}/${overview.activeMembers}`}
          detail={`${formatPercent(attendingSharePct)} del padrón activo`}
        >
          <ShareBar
            share={attendingSharePct ?? 0}
            className="mt-1"
            barClassName="bg-emerald-500"
          />
        </KpiTile>
        <KpiTile
          label="Sin ninguna actividad"
          value={formatCount(overview.inactiveMembers)}
          valueClassName={
            overview.inactiveMembers > 0
              ? "text-red-600 dark:text-red-400"
              : undefined
          }
          detail="Ni check-in de clase ni plani registrada"
        />
      </KpiGrid>

      {/* How members register presence */}
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center lg:gap-6">
        <h2 className="shrink-0 text-sm font-semibold">
          Cómo registran presencia
        </h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {sourceSplit.map(([key, count, label]) => (
            <span key={key} className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {count}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  SOURCE_CLASS[key],
                )}
              >
                {label}
              </span>
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground lg:ml-auto">
          {formatCount(overview.totalClassAttended)} check-ins ·{" "}
          {formatCount(overview.totalSessionsLogged)} planis ·{" "}
          {formatCount(overview.totalNoShow)} no-shows
        </p>
      </section>

      {/* Top / bottom rankings */}
      <section className="grid gap-4 lg:grid-cols-2">
        <MetricsSection
          title={
            <span className="flex items-center gap-2">
              <Flame className="size-4 text-emerald-600 dark:text-emerald-400" />
              Los que más vienen
            </span>
          }
          description="Top 10 por días presentes en el período."
          contentClassName="px-0"
        >
          {topMembers.length === 0 ? (
            <div className="px-6">
              <MetricsEmpty>
                Sin actividad registrada en el período.
              </MetricsEmpty>
            </div>
          ) : (
            <ol className="divide-y divide-border/60">
              {topMembers.map((member, index) => (
                <RankRow
                  key={member.userId}
                  position={index + 1}
                  member={member}
                  max={maxActiveDays}
                  tone="hot"
                />
              ))}
            </ol>
          )}
        </MetricsSection>

        <MetricsSection
          title={
            <span className="flex items-center gap-2">
              <Snowflake className="size-4 text-amber-600 dark:text-amber-400" />
              Los que menos vienen
            </span>
          }
          description="Miembros activos con menos días presentes en el período."
          contentClassName="px-0"
        >
          {bottomMembers.length === 0 ? (
            <div className="px-6">
              <MetricsEmpty>Sin miembros activos.</MetricsEmpty>
            </div>
          ) : (
            <ol className="divide-y divide-border/60">
              {bottomMembers.map((member, index) => (
                <RankRow
                  key={member.userId}
                  position={index + 1}
                  member={member}
                  max={maxActiveDays}
                  tone="cold"
                />
              ))}
            </ol>
          )}
        </MetricsSection>
      </section>

      {/* How many days members show up, and on which days */}
      <section className="grid gap-4 lg:grid-cols-2">
        <MetricsSection
          title="Distribución de asistencia"
          description="Cuántos miembros hay en cada rango de días presentes."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={distributionData}
              margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} allowDecimals={false} width={28} />
              <Tooltip
                {...CHART_TOOLTIP_PROPS}
                formatter={(value) => [Number(value), "Miembros"]}
                labelFormatter={(label) => `${label} días`}
              />
              <Bar dataKey="miembros" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {distributionData.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={entry.key === "none" ? "#f43f5e" : "#94a3b8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </MetricsSection>

        <MetricsSection
          title="Días que más vienen"
          description="Asistencias por día de la semana (clases + planis)."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={weekdayData}
              margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
              <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} allowDecimals={false} width={28} />
              <Tooltip
                {...CHART_TOOLTIP_PROPS}
                formatter={(value) => [Number(value), "Asistencias"]}
              />
              <Bar dataKey="asistencias" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {weekdayData.map((entry) => {
                  const isPeak =
                    entry.asistencias === maxWeekdayCount &&
                    maxWeekdayCount > 0;
                  return (
                    <Cell
                      key={entry.label}
                      fill={isPeak ? "#10b981" : "#94a3b8"}
                      fillOpacity={isPeak ? 1 : 0.6}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </MetricsSection>
      </section>

      {/* Dormant members */}
      <MetricsSection
        title="Hace rato que no vienen"
        description="Miembros con actividad previa pero 21 días o más sin aparecer."
        contentClassName="px-0"
      >
        {dormantMembers.length === 0 ? (
          <div className="px-6">
            <MetricsEmpty>Ningún miembro en riesgo. Buen trabajo.</MetricsEmpty>
          </div>
        ) : (
          <ul className="grid border-t sm:grid-cols-2">
            {dormantMembers.map((member) => (
              <li
                key={member.userId}
                className="flex items-center gap-3 border-b border-border/60 px-6 py-2.5"
              >
                <MemberAvatar member={member} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Última vez {formatDate(member.lastActivityAt)} ·{" "}
                    {member.activeDays} días en el período
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
                  {member.daysSinceLastActivity}d
                </span>
              </li>
            ))}
          </ul>
        )}
      </MetricsSection>

      {/* Full table */}
      <MetricsSection
        title="Todos los miembros"
        description={`Mostrando ${renderedMembers.length} de ${tableMembers.length} miembros activos.`}
        contentClassName="p-0"
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Buscar miembro"
                className="w-full pl-8 sm:w-52"
              />
            </div>
            <Select value={sortKey} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full sm:w-52">
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
        }
      >
        {tableMembers.length === 0 ? (
          <div className="px-6 pb-6">
            <MetricsEmpty>Sin miembros para mostrar.</MetricsEmpty>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Miembro</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead className="text-right">Clases</TableHead>
                    <TableHead className="text-right">Planis</TableHead>
                    <TableHead className="text-right">No-show</TableHead>
                    <TableHead className="text-right">% en clases</TableHead>
                    <TableHead className="text-right">Por semana</TableHead>
                    <TableHead className="pr-6 text-right">
                      Última vez
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderedMembers.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2.5">
                          <MemberAvatar member={member} className="size-7" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="truncate">{member.name}</span>
                              <SourceBadge source={member.source} />
                            </p>
                            {member.favoriteClass ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {member.favoriteClass.name}
                                {member.favoriteDay &&
                                  ` · ${member.favoriteDay.label}`}
                              </p>
                            ) : member.email ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {member.email}
                              </p>
                            ) : null}
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
                      <TableCell
                        className="text-right"
                        title={
                          member.attendanceRate === null
                            ? "No reserva clases"
                            : undefined
                        }
                      >
                        <RateBadge value={member.attendanceRate} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {member.perWeek}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "pr-6 text-right text-xs",
                          member.daysSinceLastActivity === null
                            ? "text-red-600 dark:text-red-400"
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
                Cargando más miembros...
              </div>
            )}
          </>
        )}
      </MetricsSection>
    </DashboardPageContainer>
  );
}
