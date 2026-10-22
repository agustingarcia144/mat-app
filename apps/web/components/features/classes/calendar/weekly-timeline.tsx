"use client";

import { useMemo, useState } from "react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import { useIsMobile } from "@/hooks/use-mobile";

type ScheduleReservationBreakdown = {
  fixedSlot: number;
  regular: number;
};

type TimelineSchedule = Doc<"classSchedules"> & {
  class?: { name: string };
  reservationBreakdown?: ScheduleReservationBreakdown;
};

interface WeeklyTimelineProps {
  schedules: TimelineSchedule[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onScheduleClick: (scheduleId: Id<"classSchedules">) => void;
  /** Optional map of staff Clerk user id → display name, to label who's in charge. */
  staffNameById?: Map<string, string>;
  /** When false, week navigation is rendered by the parent (e.g. classes page). Default true. */
  showWeekNavigation?: boolean;
  /** Called when an empty cell is clicked – opens a quick-create dialog. */
  onEmptyCellClick?: (dayDate: Date, hour: number) => void;
  /** Called when the day header action button is clicked – opens a bulk-cancel dialog. */
  onDayHeaderAction?: (dayDate: Date) => void;
  /** Whether selection mode is active. */
  selectionMode?: boolean;
  /** Set of selected schedule IDs (only relevant when selectionMode is true). */
  selectedScheduleIds?: Set<string>;
  /** Called when a schedule is toggled in selection mode. */
  onSelectionChange?: (
    scheduleId: Id<"classSchedules">,
    selected: boolean,
  ) => void;
}

/** Hours always shown; the grid grows past them only when a class needs it. */
const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 21;
const DAYS_IN_WEEK = 7;
const HOUR_ROW_PX = 56;

type Occupancy = "cancelled" | "done" | "full" | "almost" | "open";

function getOccupancy(schedule: Doc<"classSchedules">): Occupancy {
  if (schedule.status === "cancelled") return "cancelled";
  if (schedule.status === "completed") return "done";
  if (schedule.capacity <= 0) return "full";
  const percentFull = (schedule.currentReservations / schedule.capacity) * 100;
  if (percentFull >= 100) return "full";
  if (percentFull > 60) return "almost";
  return "open";
}

/** Color only marks how full a class is; the block itself stays neutral. */
const OCCUPANCY: Record<
  Occupancy,
  { label: string; bar: string; dot: string }
> = {
  open: { label: "Disponible", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  almost: { label: "Pocos cupos", bar: "bg-amber-500", dot: "bg-amber-500" },
  full: { label: "Completo", bar: "bg-red-500", dot: "bg-red-500" },
  done: {
    label: "Completada",
    bar: "bg-muted-foreground/40",
    dot: "bg-muted-foreground/40",
  },
  cancelled: {
    label: "Cancelada",
    bar: "bg-muted-foreground/30",
    dot: "bg-muted-foreground/30",
  },
};

const LEGEND: Occupancy[] = ["open", "almost", "full", "cancelled"];

function getReservationBreakdown(schedule: TimelineSchedule) {
  const fixedSlot = schedule.reservationBreakdown?.fixedSlot ?? 0;
  const regular =
    schedule.reservationBreakdown?.regular ??
    Math.max(0, schedule.currentReservations - fixedSlot);
  return { fixedSlot, regular };
}

function ReservationBreakdown({
  schedule,
  className,
}: {
  schedule: TimelineSchedule;
  className?: string;
}) {
  const { fixedSlot, regular } = getReservationBreakdown(schedule);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span
        className="inline-flex items-center gap-0.5"
        title={`${fixedSlot} fija${fixedSlot === 1 ? "" : "s"}`}
      >
        <Repeat2 className="size-3" aria-hidden />
        {fixedSlot}
        <span className="sr-only">fijas</span>
      </span>
      <span
        className="inline-flex items-center gap-0.5"
        title={`${regular} regular${regular === 1 ? "" : "es"}`}
      >
        <UserPlus className="size-3" aria-hidden />
        {regular}
        <span className="sr-only">regulares</span>
      </span>
    </span>
  );
}

export function WeekRangeLabel({ weekStart }: { weekStart: Date }) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  return (
    <>
      {format(weekStart, sameMonth ? "d" : "d MMM", { locale: es })} –{" "}
      {format(weekEnd, "d MMM yyyy", { locale: es })}
    </>
  );
}

export function WeekNavigation({
  currentDate,
  onDateChange,
}: {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const isCurrentWeek = isSameDay(
    weekStart,
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        onClick={() => onDateChange(addDays(currentDate, -7))}
        aria-label="Semana anterior"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Button
        variant="outline"
        className="h-9 px-3"
        onClick={() => onDateChange(new Date())}
        disabled={isCurrentWeek}
      >
        Hoy
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        onClick={() => onDateChange(addDays(currentDate, 7))}
        aria-label="Semana siguiente"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
      <span className="ml-2 whitespace-nowrap text-sm font-medium tabular-nums">
        <WeekRangeLabel weekStart={weekStart} />
      </span>
    </div>
  );
}

/**
 * Checkbox look for selection mode. Decorative only: the whole block is the
 * toggle (a real checkbox would be a <button> nested inside a <button>).
 */
function SelectionMark({
  selected,
  size = "md",
}: {
  selected: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm border border-primary",
        size === "sm" ? "size-3.5" : "size-4",
        selected && "bg-primary text-primary-foreground",
      )}
    >
      {selected && <Check className={size === "sm" ? "size-2.5" : "size-3"} />}
    </span>
  );
}

function OccupancyMeter({ schedule }: { schedule: Doc<"classSchedules"> }) {
  const occupancy = getOccupancy(schedule);
  const pct =
    schedule.capacity > 0
      ? Math.min((schedule.currentReservations / schedule.capacity) * 100, 100)
      : 100;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", OCCUPANCY[occupancy].bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {schedule.currentReservations}/{schedule.capacity}
      </span>
    </span>
  );
}

export default function WeeklyTimeline({
  schedules,
  currentDate,
  onDateChange,
  onScheduleClick,
  staffNameById,
  showWeekNavigation = true,
  onEmptyCellClick,
  onDayHeaderAction,
  selectionMode = false,
  selectedScheduleIds,
  onSelectionChange,
}: WeeklyTimelineProps) {
  const isMobile = useIsMobile();
  const [today] = useState(() => new Date());
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const weekDays = useMemo(
    () => Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const schedulesByDay = useMemo(() => {
    const groupedByDay: TimelineSchedule[][] = Array.from(
      { length: DAYS_IN_WEEK },
      () => [],
    );
    schedules.forEach((schedule) => {
      const dayIndex = weekDays.findIndex((day) =>
        isSameDay(day, new Date(schedule.startTime)),
      );
      if (dayIndex !== -1) groupedByDay[dayIndex].push(schedule);
    });
    groupedByDay.forEach((daySchedules) =>
      daySchedules.sort((a, b) => a.startTime - b.startTime),
    );
    return groupedByDay;
  }, [schedules, weekDays]);

  const hours = useMemo(() => {
    let first = DEFAULT_FIRST_HOUR;
    let last = DEFAULT_LAST_HOUR;
    for (const s of schedules) {
      first = Math.min(first, new Date(s.startTime).getHours());
      last = Math.max(last, new Date(s.endTime - 1).getHours());
    }
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }, [schedules]);

  const schedulesByDayHour = useMemo(() => {
    const map = new Map<string, TimelineSchedule[]>();
    schedulesByDay.forEach((daySchedules, dayIndex) => {
      daySchedules.forEach((schedule) => {
        const key = `${dayIndex}-${new Date(schedule.startTime).getHours()}`;
        map.set(key, [...(map.get(key) ?? []), schedule]);
      });
    });
    return map;
  }, [schedulesByDay]);

  const handleScheduleItemClick = (scheduleId: Id<"classSchedules">) => {
    if (selectionMode && onSelectionChange) {
      const isSelected = selectedScheduleIds?.has(scheduleId) ?? false;
      onSelectionChange(scheduleId, !isSelected);
    } else {
      onScheduleClick(scheduleId);
    }
  };

  const staffName = (schedule: TimelineSchedule) =>
    schedule.inChargeUserId
      ? staffNameById?.get(schedule.inChargeUserId)
      : undefined;

  const weekNavigation = showWeekNavigation && (
    <WeekNavigation currentDate={currentDate} onDateChange={onDateChange} />
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        {weekNavigation}
        <div className="space-y-2">
          {weekDays.map((day, dayIndex) => {
            const daySchedules = schedulesByDay[dayIndex] || [];
            const isToday = isSameDay(day, today);
            const isEmpty = daySchedules.length === 0;

            return (
              <section
                key={day.toISOString()}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card",
                  isToday && "border-foreground/30",
                )}
              >
                <header
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    !isEmpty && "border-b",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      isToday ? "bg-foreground text-background" : "bg-muted",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">
                      {isToday ? "Hoy" : format(day, "EEEE", { locale: es })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isEmpty
                        ? "Sin turnos"
                        : `${daySchedules.length} turno${daySchedules.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {onDayHeaderAction && !isEmpty && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive"
                      onClick={() => onDayHeaderAction(day)}
                      aria-label="Cancelar turnos del día"
                    >
                      <XCircle className="size-4" />
                    </Button>
                  )}
                  {onEmptyCellClick && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground"
                      onClick={() => onEmptyCellClick(day, 9)}
                      aria-label="Crear turno"
                    >
                      <Plus className="size-4" />
                    </Button>
                  )}
                </header>

                {!isEmpty && (
                  <ul className="divide-y">
                    {daySchedules.map((schedule) => {
                      const occupancy = getOccupancy(schedule);
                      const isSelected =
                        selectionMode &&
                        (selectedScheduleIds?.has(schedule._id) ?? false);
                      const name = staffName(schedule);
                      return (
                        <li key={schedule._id}>
                          <button
                            type="button"
                            onClick={() =>
                              handleScheduleItemClick(schedule._id)
                            }
                            aria-pressed={
                              selectionMode ? isSelected : undefined
                            }
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                              isSelected && "bg-accent",
                              occupancy === "cancelled" && "opacity-60",
                            )}
                          >
                            {selectionMode && (
                              <SelectionMark selected={isSelected} />
                            )}
                            <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                              {format(schedule.startTime, "HH:mm")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate text-sm",
                                  occupancy === "cancelled" && "line-through",
                                )}
                              >
                                {schedule.class?.name || "Clase"}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {occupancy === "cancelled"
                                  ? "Cancelada"
                                  : [
                                      `hasta ${format(schedule.endTime, "HH:mm")}`,
                                      name,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                              </span>
                            </span>
                            {occupancy !== "cancelled" && (
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <OccupancyMeter schedule={schedule} />
                                <ReservationBreakdown schedule={schedule} />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weekNavigation}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Day headers */}
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b">
              <div />
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, today);
                const dayHasSchedules =
                  (schedulesByDay[index] || []).length > 0;
                return (
                  <div
                    key={index}
                    className="group relative flex flex-col items-center gap-1 border-l py-2"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {format(day, "EEE", { locale: es }).replace(".", "")}
                    </span>
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        isToday && "bg-foreground text-background",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {onDayHeaderAction && dayHasSchedules && (
                      <button
                        type="button"
                        onClick={() => onDayHeaderAction(day)}
                        className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`Cancelar turnos del ${format(day, "EEEE d", { locale: es })}`}
                      >
                        <XCircle className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time rows */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border/60 last:border-b-0"
              >
                <div className="pr-2 pt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                  {hour.toString().padStart(2, "0")}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  const cellSchedules =
                    schedulesByDayHour.get(`${dayIndex}-${hour}`) || [];
                  const isToday = isSameDay(day, today);
                  const isEmpty = cellSchedules.length === 0;

                  return (
                    <div
                      key={dayIndex}
                      className={cn(
                        "group/cell relative space-y-1 border-l p-1",
                        isToday && "bg-muted/40",
                        isEmpty &&
                          onEmptyCellClick &&
                          "cursor-pointer hover:bg-accent/40",
                      )}
                      style={{ minHeight: HOUR_ROW_PX }}
                      onClick={
                        isEmpty && onEmptyCellClick
                          ? () => onEmptyCellClick(day, hour)
                          : undefined
                      }
                    >
                      {isEmpty && onEmptyCellClick && (
                        <Plus className="absolute inset-0 m-auto size-4 text-muted-foreground opacity-0 group-hover/cell:opacity-60" />
                      )}
                      {cellSchedules.map((schedule) => {
                        const occupancy = getOccupancy(schedule);
                        const durationHours =
                          (schedule.endTime - schedule.startTime) / 3_600_000;
                        const isSelected =
                          selectionMode &&
                          (selectedScheduleIds?.has(schedule._id) ?? false);
                        const name = staffName(schedule);

                        return (
                          <button
                            key={schedule._id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScheduleItemClick(schedule._id);
                            }}
                            title={`${schedule.class?.name || "Clase"} · ${OCCUPANCY[occupancy].label}`}
                            aria-pressed={
                              selectionMode ? isSelected : undefined
                            }
                            className={cn(
                              "relative flex w-full flex-col gap-0.5 overflow-hidden rounded-md border bg-background py-1.5 pl-2.5 pr-1.5 text-left text-xs shadow-sm transition-colors hover:border-foreground/30",
                              occupancy === "cancelled" &&
                                "border-dashed bg-transparent opacity-60 shadow-none",
                              isSelected && "ring-2 ring-ring",
                            )}
                            style={{
                              minHeight: `${Math.max(durationHours * (HOUR_ROW_PX - 8), 40)}px`,
                            }}
                          >
                            <span
                              className={cn(
                                "absolute inset-y-0 left-0 w-1",
                                OCCUPANCY[occupancy].bar,
                              )}
                              aria-hidden
                            />
                            <span className="flex items-start justify-between gap-1">
                              <span
                                className={cn(
                                  "truncate font-medium",
                                  occupancy === "cancelled" && "line-through",
                                )}
                              >
                                {schedule.class?.name || "Clase"}
                              </span>
                              {selectionMode && (
                                <SelectionMark
                                  selected={isSelected}
                                  size="sm"
                                />
                              )}
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {format(schedule.startTime, "HH:mm")}–
                              {format(schedule.endTime, "HH:mm")}
                            </span>
                            {name && (
                              <span className="truncate text-[11px] text-muted-foreground">
                                {name}
                              </span>
                            )}
                            {occupancy !== "cancelled" && (
                              <span className="mt-auto flex items-center justify-between gap-1 pt-0.5">
                                <span className="text-[11px] font-medium tabular-nums">
                                  {schedule.currentReservations}/
                                  {schedule.capacity}
                                </span>
                                <ReservationBreakdown schedule={schedule} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-1 rounded-full", OCCUPANCY[key].bar)} />
            {OCCUPANCY[key].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <Repeat2 className="size-3" aria-hidden /> fijas
        </span>
        <span className="inline-flex items-center gap-1">
          <UserPlus className="size-3" aria-hidden /> regulares
        </span>
      </div>
    </div>
  );
}
