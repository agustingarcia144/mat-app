"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
type ChartMetric = "weight" | "reps";
type ColumnKey =
  | "trend"
  | "firstWeight"
  | "latestWeight"
  | "delta"
  | "bestWeight"
  | "averageReps"
  | "latestReps"
  | "lastDate";
type ChartGranularity = "day" | "week" | "month" | "year";

type MetricPoint = {
  performedOn: string;
  weight: number | null;
  reps: number | null;
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

type MemberMetricSummary = {
  userId: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  totalSessions: number;
  lastPerformedOn: string | null;
  planifications: PlanificationOption[];
};

type MemberMetric = MemberMetricSummary & {
  exercises: ExerciseMetric[];
};

type MemberListData = {
  members: MemberMetricSummary[];
  hasMore: boolean;
  totalMembers: number;
};

const MEMBERS_PAGE_SIZE = 25;
const MEMBERS_SEARCH_LIMIT = 200;
const METRICS_LIST_MAX_HEIGHT_CLASS = "min-h-0 flex-1 overflow-y-auto";
const SHOW_FANTASY_MEMBERS = process.env.NODE_ENV !== "production";
const FANTASY_MEMBER_PREFIX = "fantasy-member-";
const FANTASY_MEMBERS_COUNT = 100;

const FANTASY_MEMBERS: MemberMetricSummary[] = Array.from(
  { length: FANTASY_MEMBERS_COUNT },
  (_, index) => {
    const number = index + 1;
    const paddedNumber = String(number).padStart(3, "0");
    const lastActivityDay = String(1 + ((number * 7) % 28)).padStart(2, "0");

    return {
      userId: `${FANTASY_MEMBER_PREFIX}${number}`,
      name: `Alumno Fantasia ${paddedNumber}`,
      email: `fantasia${paddedNumber}@mat.test`,
      imageUrl: null,
      totalSessions: 18 + number * 2,
      lastPerformedOn: `2026-05-${lastActivityDay}`,
      planifications: [
        {
          planificationId: `fantasy-plan-${number}-active`,
          planificationName: `Fuerza Base ${paddedNumber}`,
          status: "active",
        },
        {
          planificationId: `fantasy-plan-${number}-history-a`,
          planificationName: `Hipertrofia Volumen ${paddedNumber}`,
          status: "historical",
        },
        {
          planificationId: `fantasy-plan-${number}-history-b`,
          planificationName: `Tecnica y Control ${paddedNumber}`,
          status: "historical",
        },
      ],
    };
  },
);

const FANTASY_EXERCISE_NAMES = [
  "Sentadilla trasera",
  "Press banca",
  "Peso muerto",
  "Remo con barra",
  "Press militar",
  "Hip thrust",
  "Dominadas asistidas",
  "Zancadas caminando",
  "Curl femoral",
  "Plancha frontal",
  "Jalon al pecho",
  "Prensa inclinada",
  "Fondos en paralelas",
  "Extension de cuadriceps",
  "Elevaciones laterales",
  "Curl biceps barra",
  "Triceps polea",
  "Buenos dias",
  "Face pull",
  "Ab wheel",
  "Peso muerto rumano",
  "Sentadilla goblet",
  "Remo unilateral",
  "Press inclinado mancuernas",
];

function buildFantasyExercisePoints(
  memberNumber: number,
  exerciseIndex: number,
  trend: Trend,
): MetricPoint[] {
  const baseWeight = 18 + memberNumber + exerciseIndex * 4;
  const baseReps = 8 + (exerciseIndex % 4);

  return Array.from({ length: 16 }, (_, pointIndex) => {
    const month = pointIndex < 8 ? "03" : "04";
    const dateDay = String(2 + (pointIndex % 8) * 3).padStart(2, "0");
    const trendStep =
      trend === "up"
        ? pointIndex * 1.5
        : trend === "down"
          ? -pointIndex * 0.75
          : pointIndex % 2;
    const weight = Math.max(
      0,
      Number((baseWeight + trendStep + (pointIndex % 3) * 0.5).toFixed(1)),
    );
    const reps = Math.max(
      1,
      baseReps + (trend === "down" ? -(pointIndex % 3) : pointIndex % 4),
    );

    return {
      performedOn: `2026-${month}-${dateDay}`,
      weight,
      reps,
      volume: weight * Math.max(reps, 1) * (3 + (exerciseIndex % 3)),
      timeSeconds:
        exerciseIndex === 9 || exerciseIndex === 19
          ? 30 + pointIndex * 4
          : null,
    };
  });
}

function buildFantasyExercises(member: MemberMetricSummary): ExerciseMetric[] {
  const memberNumber = Number(member.userId.replace(FANTASY_MEMBER_PREFIX, ""));
  const planificationId = member.planifications[0]?.planificationId ?? "";

  return FANTASY_EXERCISE_NAMES.map((exerciseName, index) => {
    const trend: Trend =
      index % 5 === 1 ? "down" : index % 5 === 2 ? "flat" : "up";
    const points = buildFantasyExercisePoints(memberNumber, index, trend);
    const assignedPlanification =
      member.planifications[index % member.planifications.length];
    const planificationIds = Array.from(
      new Set([
        assignedPlanification?.planificationId ?? planificationId,
        ...(index % 4 === 0 && planificationId ? [planificationId] : []),
      ]),
    );
    const firstPoint = points[0] ?? null;
    const latestPoint = points[points.length - 1] ?? null;
    const firstWeight = firstPoint?.weight ?? null;
    const latestWeight = latestPoint?.weight ?? null;
    const bestWeight = points.reduce<number | null>(
      (best, point) =>
        point.weight === null
          ? best
          : best === null
            ? point.weight
            : Math.max(best, point.weight),
      null,
    );

    return {
      exerciseId: `fantasy-exercise-${memberNumber}-${index + 1}`,
      exerciseName,
      entriesCount: points.length,
      lastPerformedOn: latestPoint?.performedOn ?? null,
      planificationIds,
      firstWeight,
      latestWeight,
      weightDelta:
        firstWeight !== null && latestWeight !== null
          ? latestWeight - firstWeight
          : null,
      bestWeight,
      trend,
      points,
    };
  });
}

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
  { key: "averageReps", label: "Promedio reps" },
  { key: "latestReps", label: "Ultimas reps" },
  { key: "lastDate", label: "Ultima fecha" },
];

const CHART_GRANULARITY_OPTIONS: { value: ChartGranularity; label: string }[] =
  [
    { value: "day", label: "Dias" },
    { value: "week", label: "Semanas" },
    { value: "month", label: "Meses" },
    { value: "year", label: "Anios" },
  ];

const CHART_METRIC_OPTIONS: { value: ChartMetric; label: string }[] = [
  { value: "weight", label: "Peso" },
  { value: "reps", label: "Repeticiones" },
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

function formatChartValue(
  value: number | null | undefined,
  metric: ChartMetric,
) {
  return formatMetricValue(value, metric === "weight" ? "kg" : "rep");
}

function getAverageReps(points: MetricPoint[]) {
  const reps = points
    .map((point) => point.reps)
    .filter((value): value is number => value !== null);

  if (reps.length === 0) return null;
  const average = reps.reduce((sum, value) => sum + value, 0) / reps.length;
  return Number(average.toFixed(2));
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

function isFantasyMemberId(userId: string | null) {
  return Boolean(userId?.startsWith(FANTASY_MEMBER_PREFIX));
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
      reps: number | null;
      repsTotal: number;
      repsSamples: number;
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
    const nextRepsTotal = (previous?.repsTotal ?? 0) + (point.reps ?? 0);
    const nextRepsSamples =
      (previous?.repsSamples ?? 0) + (point.reps !== null ? 1 : 0);

    buckets.set(bucketKey, {
      performedOn: bucketKey,
      weight: nextWeight,
      reps:
        nextRepsSamples > 0
          ? Number((nextRepsTotal / nextRepsSamples).toFixed(2))
          : null,
      repsTotal: nextRepsTotal,
      repsSamples: nextRepsSamples,
      volume: previous?.volume ?? point.volume ?? null,
      timeSeconds: previous?.timeSeconds ?? point.timeSeconds ?? null,
      label: getBucketLabel(bucketKey, granularity),
    });
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.performedOn.localeCompare(b.performedOn))
    .map(({ repsTotal, repsSamples, ...point }) => point);
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

function MetricLineChart({
  points,
  trend,
  metric,
}: {
  points: Array<MetricPoint & { label?: string }>;
  trend: Trend;
  metric: ChartMetric;
}) {
  const strokeColor =
    metric === "reps"
      ? "hsl(24 95% 53%)"
      : trend === "up"
        ? "hsl(142 71% 45%)"
        : trend === "down"
          ? "hsl(0 72% 51%)"
          : "hsl(213 94% 45%)";

  const values = points
    .map((point) => point[metric])
    .filter((value): value is number => value !== null);

  if (points.length === 0 || values.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Sin datos de {metric === "weight" ? "peso" : "repeticiones"} para este
        ejercicio.
      </div>
    );
  }

  const width = 640;
  const height = 176;
  const paddingLeft = 58;
  const paddingRight = 18;
  const paddingTop = 20;
  const paddingBottom = 36;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1];
  const xLabelEvery = Math.max(1, Math.ceil(points.length / 6));
  const formatAxisValue = (value: number) =>
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: value % 1 === 0 ? 0 : 1,
    }).format(value);

  const coordinates = points.map((point, index) => {
    const x =
      paddingLeft +
      (index * (width - paddingLeft - paddingRight)) /
        Math.max(points.length - 1, 1);
    const value = point[metric] ?? minValue;
    const y =
      height -
      paddingBottom -
      ((value - minValue) / range) * (height - paddingTop - paddingBottom);

    return { ...point, x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-background/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
          {axisTicks.map((ratio) => {
            const y =
              paddingTop + (height - paddingTop - paddingBottom) * ratio;
            const value = maxValue - range * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  x2={width - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray={ratio === 1 ? undefined : "4 6"}
                  className="text-border"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatAxisValue(value)}
                </text>
              </g>
            );
          })}
          <line
            x1={paddingLeft}
            x2={paddingLeft}
            y1={paddingTop}
            y2={height - paddingBottom}
            stroke="currentColor"
            className="text-border"
          />
          {coordinates.map((point, index) => {
            const shouldShowLabel =
              index === 0 ||
              index === coordinates.length - 1 ||
              index % xLabelEvery === 0;

            return shouldShowLabel ? (
              <g
                key={`${point.performedOn}-${point.label ?? point.performedOn}-x-axis`}
              >
                <line
                  x1={point.x}
                  x2={point.x}
                  y1={height - paddingBottom}
                  y2={height - paddingBottom + 5}
                  stroke="currentColor"
                  className="text-border"
                />
                <text
                  x={point.x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {point.label ?? formatDate(point.performedOn)}
                </text>
              </g>
            ) : null;
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
              {metric === "weight" ? "Peso" : "Reps"}:{" "}
              {formatChartValue(point[metric], metric)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExerciseMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const [memberSearch, setMemberSearch] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberLimit, setMemberLimit] = useState(MEMBERS_PAGE_SIZE);
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
  const [chartMetric, setChartMetric] = useState<ChartMetric>("weight");
  const [cachedMemberListData, setCachedMemberListData] =
    useState<MemberListData | null>(null);
  const membersScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreMembersRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreMembersRef = useRef(false);
  const memberSearchTerm = memberSearch.trim();
  const isSearchingMembers = memberSearchTerm.length > 0;

  const memberListData = useQuery(
    api.metrics.listExerciseMetricMembers,
    canQuery
      ? {
          limit: isSearchingMembers ? MEMBERS_SEARCH_LIMIT : memberLimit,
          search: memberSearchTerm || undefined,
        }
      : "skip",
  );

  const selectedMemberData = useQuery(
    api.metrics.getExerciseMetricsByMember,
    canQuery && selectedMemberId && !isFantasyMemberId(selectedMemberId)
      ? { userId: selectedMemberId }
      : "skip",
  );

  useEffect(() => {
    setCachedMemberListData(null);
  }, [memberSearchTerm]);

  useEffect(() => {
    if (!memberListData) return;
    setCachedMemberListData(memberListData as MemberListData);
  }, [memberListData]);

  const activeMemberListData =
    (memberListData as MemberListData | undefined) ?? cachedMemberListData;
  const isLoadingAdditionalMembers =
    memberListData === undefined && cachedMemberListData !== null;

  const realMembers = useMemo<MemberMetricSummary[]>(() => {
    if (!activeMemberListData?.members) return [];
    return activeMemberListData.members;
  }, [activeMemberListData]);

  const members = useMemo<MemberMetricSummary[]>(() => {
    const fantasyMembers = SHOW_FANTASY_MEMBERS
      ? FANTASY_MEMBERS.filter((member) => {
          const term = memberSearch.trim().toLowerCase();
          if (!term) return true;
          return (
            member.name.toLowerCase().includes(term) ||
            member.email?.toLowerCase().includes(term)
          );
        })
      : [];

    const nextMembers = [...realMembers, ...fantasyMembers];
    return isSearchingMembers ? nextMembers : nextMembers.slice(0, memberLimit);
  }, [isSearchingMembers, memberLimit, memberSearch, realMembers]);

  const totalMembers =
    (activeMemberListData?.totalMembers ?? 0) +
    (SHOW_FANTASY_MEMBERS
      ? FANTASY_MEMBERS.filter((member) => {
          const term = memberSearch.trim().toLowerCase();
          if (!term) return true;
          return (
            member.name.toLowerCase().includes(term) ||
            member.email?.toLowerCase().includes(term)
          );
        }).length
      : 0);
  const hasMoreMembers =
    !isSearchingMembers &&
    (Boolean(activeMemberListData?.hasMore) || totalMembers > members.length);

  const loadMoreMembers = () => {
    if (
      isSearchingMembers ||
      !hasMoreMembers ||
      isLoadingAdditionalMembers ||
      isLoadingMoreMembersRef.current
    ) {
      return;
    }

    isLoadingMoreMembersRef.current = true;
    setMemberLimit((current) =>
      Math.min(current + MEMBERS_PAGE_SIZE, totalMembers),
    );
  };

  const selectedMemberSummary = useMemo(
    () => members.find((member) => member.userId === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const selectedMember = useMemo(() => {
    if (selectedMemberData?.member) {
      return selectedMemberData.member as MemberMetric;
    }

    if (!isFantasyMemberId(selectedMemberId)) return null;
    const fantasyMember =
      FANTASY_MEMBERS.find((member) => member.userId === selectedMemberId) ??
      null;
    return fantasyMember
      ? { ...fantasyMember, exercises: buildFantasyExercises(fantasyMember) }
      : null;
  }, [selectedMemberData, selectedMemberId]);
  const isSelectedMemberLoading =
    Boolean(selectedMemberId) &&
    !isFantasyMemberId(selectedMemberId) &&
    selectedMemberData === undefined;

  useEffect(() => {
    setMemberLimit(MEMBERS_PAGE_SIZE);
    isLoadingMoreMembersRef.current = false;
  }, [memberSearch]);

  useEffect(() => {
    isLoadingMoreMembersRef.current = false;
  }, [members.length]);

  useEffect(() => {
    const node = loadMoreMembersRef.current;
    const root = membersScrollRef.current;
    if (!node || !root || !hasMoreMembers || isLoadingAdditionalMembers) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreMembers();
        }
      },
      { root, rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreMembers, isLoadingAdditionalMembers, members.length]);

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
    <DashboardPageContainer className="flex h-[calc(100vh-68px)] flex-col gap-4 overflow-hidden py-4 md:py-5">
      <div className="shrink-0 space-y-2">
        <Link
          href="/dashboard/metrics"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a metricas
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            Metricas de Ejercicios de alumnos
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Elegi un miembro, filtralo por plani y expandi el ejercicio que
            quieras revisar con grafico e historial.
          </p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-4 rounded-2xl border bg-card/70 p-4">
          <div className="shrink-0 space-y-2">
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

          {activeMemberListData === null ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Cargando alumnos...
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No hay miembros con actividad para mostrar.
            </div>
          ) : (
            <div
              ref={membersScrollRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                const distanceToBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight;
                if (distanceToBottom < 160) {
                  loadMoreMembers();
                }
              }}
              className={cn("space-y-2 pr-1", METRICS_LIST_MAX_HEIGHT_CLASS)}
            >
              {members.map((member) => {
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
                      setSelectedPlanificationId(null);
                      setExerciseSearch("");
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
              {hasMoreMembers ? (
                <div
                  ref={loadMoreMembersRef}
                  className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground"
                >
                  {isLoadingAdditionalMembers
                    ? "Cargando mas alumnos..."
                    : "Baja para cargar mas alumnos"}
                </div>
              ) : totalMembers > MEMBERS_PAGE_SIZE && !isSearchingMembers ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Mostrando {members.length} de {totalMembers}
                </div>
              ) : null}
            </div>
          )}
        </aside>

        <section className="flex min-h-0 flex-col gap-4">
          <div className="shrink-0 rounded-2xl border bg-card/70 p-4">
            <div className="flex flex-col gap-3">
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

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {!selectedMemberId ? (
              <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
                Selecciona un miembro para ver sus metricas.
              </div>
            ) : isSelectedMemberLoading ? (
              <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
                Cargando metricas de{" "}
                {selectedMemberSummary?.name ?? "este alumno"}...
              </div>
            ) : !selectedMember ? (
              <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
                No se encontraron metricas para este alumno.
              </div>
            ) : (
              <div className="space-y-4">
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
                    <div className="overflow-x-auto">
                      <table className="w-full caption-bottom text-sm">
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
                            {visibleColumns.includes("averageReps") ? (
                              <TableHead>Promedio reps</TableHead>
                            ) : null}
                            {visibleColumns.includes("latestReps") ? (
                              <TableHead>Ultimas reps</TableHead>
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
                            const latestReps =
                              exercise.points[exercise.points.length - 1]
                                ?.reps ?? null;
                            const averageReps = getAverageReps(exercise.points);

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
                                  {visibleColumns.includes("averageReps") ? (
                                    <TableCell>
                                      {formatMetricValue(averageReps, "rep")}
                                    </TableCell>
                                  ) : null}
                                  {visibleColumns.includes("latestReps") ? (
                                    <TableCell>
                                      {formatMetricValue(latestReps, "rep")}
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
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                                              {formatDelta(
                                                exercise.weightDelta,
                                              )}
                                            </p>
                                          </div>
                                          <div className="rounded-xl border bg-background/60 p-4">
                                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                              Ultimas reps
                                            </p>
                                            <p className="mt-2 text-lg font-semibold">
                                              {formatMetricValue(
                                                latestReps,
                                                "rep",
                                              )}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="space-y-3 rounded-2xl border bg-card/40 p-4">
                                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                              <p className="font-medium">
                                                Evolucion por ejercicio
                                              </p>
                                              <p className="text-sm text-muted-foreground">
                                                El grafico resume pesos o
                                                repeticiones segun la vista
                                                elegida.
                                              </p>
                                            </div>

                                            <div className="grid w-full gap-2 md:w-auto md:grid-cols-2">
                                              <Select
                                                value={chartMetric}
                                                onValueChange={(value) =>
                                                  setChartMetric(
                                                    value as ChartMetric,
                                                  )
                                                }
                                              >
                                                <SelectTrigger>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {CHART_METRIC_OPTIONS.map(
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

                                          <MetricLineChart
                                            points={aggregatedPoints}
                                            trend={exercise.trend}
                                            metric={chartMetric}
                                          />
                                        </div>

                                        <div className="space-y-3 rounded-2xl border bg-card/40 p-4">
                                          <div>
                                            <p className="font-medium">
                                              Historial
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                              Fechas, pesos y repeticiones de
                                              cada registro.
                                            </p>
                                          </div>

                                          <div className="overflow-hidden rounded-xl border">
                                            <Table>
                                              <TableHeader>
                                                <TableRow>
                                                  <TableHead>Fecha</TableHead>
                                                  <TableHead>Peso</TableHead>
                                                  <TableHead>
                                                    Repeticiones
                                                  </TableHead>
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
                                                      <TableCell>
                                                        {formatMetricValue(
                                                          point.reps,
                                                          "rep",
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
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardPageContainer>
  );
}
