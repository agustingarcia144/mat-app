"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

type Trend = "up" | "down" | "flat";
type ColumnKey =
  | "trend"
  | "firstWeight"
  | "latestWeight"
  | "delta"
  | "bestWeight"
  | "lastDate";
type ChartGranularity = "day" | "week" | "month" | "year";

type MetricPoint = {
  performedOn: string;
  weight: number | null;
  volume: number | null;
  timeSeconds: number | null;
};

type ExerciseMetric = {
  exerciseId: string;
  exerciseName: string;
  entriesCount: number;
  lastPerformedOn: string | null;
  planificationIds: string[];
  firstWeight: number | null;
  latestWeight: number | null;
  weightDelta: number | null;
  bestWeight: number | null;
  trend: Trend;
  points: MetricPoint[];
};

type PlanificationOption = {
  planificationId: string;
  planificationName: string;
  status: "active" | "historical";
};

type MemberMetric = {
  userId: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  totalSessions: number;
  lastPerformedOn: string | null;
  planifications: PlanificationOption[];
  exercises: ExerciseMetric[];
};

const DEFAULT_COLUMNS: ColumnKey[] = [
  "trend",
  "firstWeight",
  "latestWeight",
  "delta",
  "bestWeight",
  "lastDate",
];

const COLUMN_OPTIONS: { key: ColumnKey; label: string }[] = [
  { key: "trend", label: "Tendencia" },
  { key: "firstWeight", label: "Primer peso" },
  { key: "latestWeight", label: "Ultimo peso" },
  { key: "delta", label: "Evolucion" },
  { key: "bestWeight", label: "Mejor peso" },
  { key: "lastDate", label: "Ultima fecha" },
];

const CHART_GRANULARITY_OPTIONS: { value: ChartGranularity; label: string }[] =
  [
    { value: "day", label: "Dias" },
    { value: "week", label: "Semanas" },
    { value: "month", label: "Meses" },
    { value: "year", label: "Anios" },
  ];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMetricValue(value?: number | null, suffix = "kg") {
  if (value === null || value === undefined) return "-";
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)} ${suffix}`;
}

function formatDelta(value?: number | null) {
  if (value === null || value === undefined) return "-";
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)} kg`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

function getBucketKey(point: MetricPoint, granularity: ChartGranularity) {
  if (granularity === "day") return point.performedOn;
  if (granularity === "week") return getWeekStart(point.performedOn);
  if (granularity === "month") return point.performedOn.slice(0, 7);
  return point.performedOn.slice(0, 4);
}

function getBucketLabel(bucketKey: string, granularity: ChartGranularity) {
  if (granularity === "day") return formatDate(bucketKey);
  if (granularity === "week") return `Semana ${formatDate(bucketKey)}`;
  if (granularity === "month") {
    const [year, month] = bucketKey.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat("es-AR", {
      month: "short",
      year: "numeric",
    }).format(date);
  }
  return bucketKey;
}

function aggregateChartPoints(
  points: MetricPoint[],
  granularity: ChartGranularity,
) {
  if (granularity === "day") {
    return points.map((point) => ({
      ...point,
      label: getBucketLabel(point.performedOn, granularity),
    }));
  }

  const buckets = new Map<
    string,
    {
      performedOn: string;
      weight: number | null;
      volume: number | null;
      timeSeconds: number | null;
      label: string;
    }
  >();

  for (const point of points) {
    const bucketKey = getBucketKey(point, granularity);
    const previous = buckets.get(bucketKey);
    const nextWeight =
      previous?.weight !== null && previous?.weight !== undefined
        ? Math.max(previous.weight, point.weight ?? previous.weight)
        : point.weight;

    buckets.set(bucketKey, {
      performedOn: bucketKey,
      weight: nextWeight,
      volume: previous?.volume ?? point.volume ?? null,
      timeSeconds: previous?.timeSeconds ?? point.timeSeconds ?? null,
      label: getBucketLabel(bucketKey, granularity),
    });
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.performedOn.localeCompare(b.performedOn),
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
        <TrendingUp className="mr-1 size-3" />
        Sube
      </Badge>
    );
  }

  if (trend === "down") {
    return (
      <Badge className="border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/10">
        <TrendingDown className="mr-1 size-3" />
        Baja
      </Badge>
    );
  }

  return (
    <Badge className="border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/10">
      Estable
    </Badge>
  );
}

function WeightChart({
  points,
  trend,
}: {
  points: Array<MetricPoint & { label?: string }>;
  trend: Trend;
}) {
  const strokeColor =
    trend === "up"
      ? "hsl(142 71% 45%)"
      : trend === "down"
        ? "hsl(0 72% 51%)"
        : "hsl(213 94% 45%)";

  const values = points
    .map((point) => point.weight)
    .filter((value): value is number => value !== null);

  if (points.length === 0 || values.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Sin datos de peso para este ejercicio.
      </div>
    );
  }

  const width = 640;
  const height = 176;
  const paddingX = 18;
  const paddingY = 24;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const coordinates = points.map((point, index) => {
    const x =
      paddingX +
      (index * (width - paddingX * 2)) / Math.max(points.length - 1, 1);
    const value = point.weight ?? minValue;
    const y =
      height -
      paddingY -
      ((value - minValue) / range) * (height - paddingY * 2);

    return { ...point, x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-background/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const y = paddingY + (height - paddingY * 2) * ratio;
            return (
              <line
                key={ratio}
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeDasharray="4 6"
                className="text-border"
              />
            );
          })}
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coordinates.map((point) => (
            <g key={`${point.performedOn}-${point.label ?? point.performedOn}`}>
              <circle cx={point.x} cy={point.y} r="4" fill={strokeColor} />
            </g>
          ))}
        </svg>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
        {coordinates.map((point) => (
          <div
            key={`${point.performedOn}-${point.label ?? point.performedOn}-legend`}
            className="rounded-lg border bg-background/50 px-3 py-2 text-xs"
          >
            <p className="font-medium text-foreground">
              {point.label ?? formatDate(point.performedOn)}
            </p>
            <p className="text-muted-foreground">
              Peso: {formatMetricValue(point.weight)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExerciseMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const data = useQuery(
    api.metrics.getExerciseMetricsByMembers,
    canQuery ? {} : "skip",
  );

  const members = useMemo<MemberMetric[]>(() => {
    if (!data?.members) return [];
    return data.members as MemberMetric[];
  }, [data]);

  const [memberSearch, setMemberSearch] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedPlanificationId, setSelectedPlanificationId] = useState<
    string | null
  >(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null,
  );
  const [visibleColumns, setVisibleColumns] =
    useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [chartGranularity, setChartGranularity] =
    useState<ChartGranularity>("day");

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const term = memberSearch.trim().toLowerCase();
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        member.email?.toLowerCase().includes(term),
    );
  }, [memberSearch, members]);

  useEffect(() => {
    if (!filteredMembers.length) {
      setSelectedMemberId(null);
      return;
    }
    if (!filteredMembers.some((member) => member.userId === selectedMemberId)) {
      setSelectedMemberId(filteredMembers[0]?.userId ?? null);
    }
  }, [filteredMembers, selectedMemberId]);

  const selectedMember = useMemo(
    () => members.find((member) => member.userId === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  useEffect(() => {
    if (!selectedMember) {
      setSelectedPlanificationId(null);
      return;
    }

    const exists = selectedMember.planifications.some(
      (planification) =>
        planification.planificationId === selectedPlanificationId,
    );

    if (!selectedPlanificationId || !exists) {
      const activePlanification = selectedMember.planifications.find(
        (planification) => planification.status === "active",
      );
      setSelectedPlanificationId(
        activePlanification?.planificationId ??
          selectedMember.planifications[0]?.planificationId ??
          null,
      );
    }
  }, [selectedMember, selectedPlanificationId]);

  const visibleExercises = useMemo(() => {
    if (!selectedMember) return [];
    const term = exerciseSearch.trim().toLowerCase();

    return selectedMember.exercises.filter((exercise) => {
      const matchesPlanification =
        !selectedPlanificationId ||
        exercise.planificationIds.includes(selectedPlanificationId);
      const matchesSearch =
        !term || exercise.exerciseName.toLowerCase().includes(term);
      return matchesPlanification && matchesSearch;
    });
  }, [exerciseSearch, selectedMember, selectedPlanificationId]);

  useEffect(() => {
    if (!selectedExerciseId) return;
    if (
      !visibleExercises.some(
        (exercise) => exercise.exerciseId === selectedExerciseId,
      )
    ) {
      setSelectedExerciseId(null);
    }
  }, [selectedExerciseId, visibleExercises]);

  function toggleColumn(columnKey: ColumnKey, checked: boolean) {
    setVisibleColumns((current) => {
      if (checked) {
        return current.includes(columnKey) ? current : [...current, columnKey];
      }
      if (current.length === 1) return current;
      return current.filter((entry) => entry !== columnKey);
    });
  }

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
          <h1 className="text-2xl font-bold md:text-3xl">
            Metricas de Ejercicios de alumnos
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Elegi un miembro, filtralo por plani y expandi el ejercicio que
            quieras revisar con grafico e historial.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl border bg-card/70 p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Miembros</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Buscar miembro"
                className="pl-9"
              />
            </div>
          </div>

          {data === undefined ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Cargando metricas...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No hay miembros con actividad para mostrar.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const activePlanification = member.planifications.find(
                  (planification) => planification.status === "active",
                );

                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => {
                      setSelectedMemberId(member.userId);
                      setSelectedExerciseId(null);
                    }}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                      member.userId === selectedMemberId
                        ? "border-primary bg-primary/5"
                        : "bg-background/50 hover:border-primary/40 hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="size-10 border">
                        <AvatarImage src={member.imageUrl ?? undefined} />
                        <AvatarFallback>
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium">{member.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email ?? "Sin email"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.totalSessions} sesiones
                        </p>
                        {activePlanification ? (
                          <p className="truncate text-xs text-muted-foreground">
                            Activa: {activePlanification.planificationName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {!selectedMember ? (
            <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
              Selecciona un miembro para ver sus metricas.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-card/70 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11 border">
                        <AvatarImage
                          src={selectedMember.imageUrl ?? undefined}
                        />
                        <AvatarFallback>
                          {getInitials(selectedMember.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h2 className="text-xl font-semibold">
                          {selectedMember.name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {selectedMember.email ?? "Sin email"}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Ultima actividad:{" "}
                      {formatDate(selectedMember.lastPerformedOn)}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:min-w-[520px]">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Plani</p>
                      <Select
                        value={selectedPlanificationId ?? undefined}
                        onValueChange={(value) => {
                          setSelectedPlanificationId(value);
                          setSelectedExerciseId(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Elegi una plani" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedMember.planifications.map(
                            (planification) => (
                              <SelectItem
                                key={planification.planificationId}
                                value={planification.planificationId}
                              >
                                {planification.planificationName}
                                {planification.status === "active"
                                  ? " (Activa)"
                                  : " (Historica)"}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Buscar ejercicio</p>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={exerciseSearch}
                          onChange={(event) =>
                            setExerciseSearch(event.target.value)
                          }
                          placeholder="Ej. sentadilla"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-xl border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <SlidersHorizontal className="size-4" />
                    Columnas visibles
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {COLUMN_OPTIONS.map((option) => {
                      const checked = visibleColumns.includes(option.key);
                      return (
                        <label
                          key={option.key}
                          className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleColumn(option.key, value === true)
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card/70">
                <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                  {selectedPlanificationId
                    ? "Ejercicios filtrados por la plani seleccionada."
                    : "Mostrando todos los ejercicios."}
                </div>

                {visibleExercises.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">
                    No hay ejercicios para esa plani con el filtro actual.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[260px]">
                          Ejercicio
                        </TableHead>
                        {visibleColumns.includes("trend") ? (
                          <TableHead>Tendencia</TableHead>
                        ) : null}
                        {visibleColumns.includes("firstWeight") ? (
                          <TableHead>Primer peso</TableHead>
                        ) : null}
                        {visibleColumns.includes("latestWeight") ? (
                          <TableHead>Ultimo peso</TableHead>
                        ) : null}
                        {visibleColumns.includes("delta") ? (
                          <TableHead>Evolucion</TableHead>
                        ) : null}
                        {visibleColumns.includes("bestWeight") ? (
                          <TableHead>Mejor peso</TableHead>
                        ) : null}
                        {visibleColumns.includes("lastDate") ? (
                          <TableHead>Ultima fecha</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleExercises.map((exercise) => {
                        const isOpen =
                          exercise.exerciseId === selectedExerciseId;
                        const aggregatedPoints = aggregateChartPoints(
                          exercise.points,
                          chartGranularity,
                        );

                        return (
                          <Fragment key={exercise.exerciseId}>
                            <TableRow
                              className={cn(
                                "cursor-pointer",
                                isOpen && "bg-accent/30 hover:bg-accent/30",
                              )}
                              onClick={() =>
                                setSelectedExerciseId((current) =>
                                  current === exercise.exerciseId
                                    ? null
                                    : exercise.exerciseId,
                                )
                              }
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {isOpen ? (
                                    <ChevronDown className="size-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="size-4 text-muted-foreground" />
                                  )}
                                  <div>
                                    <p className="font-medium">
                                      {exercise.exerciseName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {exercise.entriesCount} registros
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              {visibleColumns.includes("trend") ? (
                                <TableCell>
                                  <TrendBadge trend={exercise.trend} />
                                </TableCell>
                              ) : null}
                              {visibleColumns.includes("firstWeight") ? (
                                <TableCell>
                                  {formatMetricValue(exercise.firstWeight)}
                                </TableCell>
                              ) : null}
                              {visibleColumns.includes("latestWeight") ? (
                                <TableCell>
                                  {formatMetricValue(exercise.latestWeight)}
                                </TableCell>
                              ) : null}
                              {visibleColumns.includes("delta") ? (
                                <TableCell
                                  className={cn(
                                    exercise.weightDelta !== null &&
                                      exercise.weightDelta > 0 &&
                                      "text-emerald-600",
                                    exercise.weightDelta !== null &&
                                      exercise.weightDelta < 0 &&
                                      "text-red-600",
                                  )}
                                >
                                  {formatDelta(exercise.weightDelta)}
                                </TableCell>
                              ) : null}
                              {visibleColumns.includes("bestWeight") ? (
                                <TableCell>
                                  {formatMetricValue(exercise.bestWeight)}
                                </TableCell>
                              ) : null}
                              {visibleColumns.includes("lastDate") ? (
                                <TableCell>
                                  {formatDate(exercise.lastPerformedOn)}
                                </TableCell>
                              ) : null}
                            </TableRow>

                            {isOpen ? (
                              <TableRow>
                                <TableCell
                                  colSpan={1 + visibleColumns.length}
                                  className="bg-background/40 p-0"
                                >
                                  <div className="space-y-5 px-4 py-5">
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                      <div className="rounded-xl border bg-background/60 p-4">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Primer peso
                                        </p>
                                        <p className="mt-2 text-lg font-semibold">
                                          {formatMetricValue(
                                            exercise.firstWeight,
                                          )}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border bg-background/60 p-4">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Ultimo peso
                                        </p>
                                        <p className="mt-2 text-lg font-semibold">
                                          {formatMetricValue(
                                            exercise.latestWeight,
                                          )}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border bg-background/60 p-4">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Mejor peso
                                        </p>
                                        <p className="mt-2 text-lg font-semibold">
                                          {formatMetricValue(
                                            exercise.bestWeight,
                                          )}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border bg-background/60 p-4">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          Evolucion
                                        </p>
                                        <p
                                          className={cn(
                                            "mt-2 text-lg font-semibold",
                                            exercise.weightDelta !== null &&
                                              exercise.weightDelta > 0 &&
                                              "text-emerald-600",
                                            exercise.weightDelta !== null &&
                                              exercise.weightDelta < 0 &&
                                              "text-red-600",
                                            exercise.weightDelta === 0 &&
                                              "text-blue-600",
                                          )}
                                        >
                                          {formatDelta(exercise.weightDelta)}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="space-y-3 rounded-2xl border bg-card/40 p-4">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <p className="font-medium">
                                            Evolucion del peso
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            El grafico resume los pesos usados
                                            segun la vista elegida.
                                          </p>
                                        </div>

                                        <div className="w-full md:w-52">
                                          <Select
                                            value={chartGranularity}
                                            onValueChange={(value) =>
                                              setChartGranularity(
                                                value as ChartGranularity,
                                              )
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {CHART_GRANULARITY_OPTIONS.map(
                                                (option) => (
                                                  <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>

                                      <WeightChart
                                        points={aggregatedPoints}
                                        trend={exercise.trend}
                                      />
                                    </div>

                                    <div className="space-y-3 rounded-2xl border bg-card/40 p-4">
                                      <div>
                                        <p className="font-medium">Historial</p>
                                        <p className="text-sm text-muted-foreground">
                                          Fechas y pesos de cada registro.
                                        </p>
                                      </div>

                                      <div className="overflow-hidden rounded-xl border">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Fecha</TableHead>
                                              <TableHead>Peso</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {exercise.points
                                              .slice()
                                              .reverse()
                                              .map((point) => (
                                                <TableRow
                                                  key={`${exercise.exerciseId}-${point.performedOn}`}
                                                >
                                                  <TableCell>
                                                    {formatDate(
                                                      point.performedOn,
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    {formatMetricValue(
                                                      point.weight,
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </DashboardPageContainer>
  );
}
