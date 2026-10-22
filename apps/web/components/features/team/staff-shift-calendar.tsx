"use client";

import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { StaffOption } from "./staff-select";

const START_HOUR = 6;
const END_HOUR = 22; // last labelled hour (row covers 22:00–23:00)
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => i + START_HOUR,
);
const HOUR_HEIGHT = 48; // px per hour row
const DAY_MIN = START_HOUR * 60;
const DAY_MAX = (END_HOUR + 1) * 60;
const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const GRID_COLS = "grid-cols-[56px_repeat(7,minmax(0,1fr))]";

/**
 * Per-employee colors, stable by index. `block` tints the shift with a solid
 * left edge; `dot` is the legend swatch.
 */
export const STAFF_PALETTE = [
  {
    block: "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  {
    block:
      "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    block:
      "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  {
    block:
      "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    block: "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  {
    block: "border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
  },
  {
    block:
      "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  {
    block: "border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  {
    block:
      "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    dot: "bg-fuchsia-500",
  },
  {
    block: "border-lime-600 bg-lime-600/15 text-lime-700 dark:text-lime-300",
    dot: "bg-lime-600",
  },
] as const;

export type NormalizedShift = {
  id: string;
  userId: string;
  dayIndex: number; // 0 = Monday … 6 = Sunday
  startMinutes: number;
  endMinutes: number;
};

type Props = {
  mode: "dated" | "model";
  /** Only used in dated mode to label/highlight columns. */
  weekDays?: Date[];
  shifts: NormalizedShift[];
  staff: StaffOption[];
  onEmptyCellClick: (dayIndex: number, hour: number) => void;
  onShiftClick: (shiftId: string) => void;
};

function staffLabel(option?: StaffOption) {
  if (!option) return "Empleado";
  return option.fullName || option.email || option.userId;
}

function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

type PositionedShift = NormalizedShift & { lane: number; laneCount: number };

// Assign overlapping shifts within a day to side-by-side lanes.
function layoutDay(shifts: NormalizedShift[]): PositionedShift[] {
  const sorted = [...shifts].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const laneEnds: number[] = [];
  const placed: Array<NormalizedShift & { lane: number }> = [];

  for (const shift of sorted) {
    let lane = laneEnds.findIndex((end) => end <= shift.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(shift.endMinutes);
    } else {
      laneEnds[lane] = shift.endMinutes;
    }
    placed.push({ ...shift, lane });
  }

  const laneCount = Math.max(laneEnds.length, 1);
  return placed.map((s) => ({ ...s, laneCount }));
}

export default function StaffShiftCalendar({
  weekDays,
  shifts,
  staff,
  onEmptyCellClick,
  onShiftClick,
}: Props) {
  const staffById = useMemo(() => {
    const map = new Map<string, StaffOption>();
    staff.forEach((s) => map.set(s.userId, s));
    return map;
  }, [staff]);

  const colorByUser = useMemo(() => {
    const map = new Map<string, string>();
    staff.forEach((s, index) => {
      map.set(s.userId, STAFF_PALETTE[index % STAFF_PALETTE.length].block);
    });
    return map;
  }, [staff]);

  const shiftsByDay = useMemo(() => {
    const byDay: NormalizedShift[][] = Array.from({ length: 7 }, () => []);
    for (const shift of shifts) {
      if (shift.dayIndex >= 0 && shift.dayIndex < 7) {
        byDay[shift.dayIndex].push(shift);
      }
    }
    return byDay.map(layoutDay);
  }, [shifts]);

  const bodyHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className={cn("grid border-b", GRID_COLS)}>
            <div />
            {DAY_SHORT.map((label, index) => {
              const day = weekDays?.[index];
              const isToday = day ? isSameDay(day, new Date()) : false;
              return (
                <div
                  key={index}
                  className="flex flex-col items-center gap-1 border-l py-2"
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  {day && (
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        isToday && "bg-foreground text-background",
                      )}
                    >
                      {format(day, "d", { locale: es })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Body: hour-label column + 7 day columns */}
          <div className={cn("grid", GRID_COLS)}>
            {/* Hour labels */}
            <div>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border/60 pr-2 pt-1 text-right text-[11px] tabular-nums text-muted-foreground last:border-b-0"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAY_SHORT.map((_, dayIndex) => {
              const day = weekDays?.[dayIndex];
              const isToday = day ? isSameDay(day, new Date()) : false;
              const dayShifts = shiftsByDay[dayIndex];

              return (
                <div
                  key={dayIndex}
                  className={cn("relative border-l", isToday && "bg-muted/40")}
                  style={{ height: bodyHeight }}
                >
                  {/* Clickable hour cells (background grid) */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40"
                      style={{ height: HOUR_HEIGHT }}
                      onClick={() => onEmptyCellClick(dayIndex, hour)}
                    />
                  ))}

                  {/* Shift blocks (absolutely positioned over the grid) */}
                  {dayShifts.map((shift) => {
                    const top =
                      ((Math.max(shift.startMinutes, DAY_MIN) - DAY_MIN) / 60) *
                      HOUR_HEIGHT;
                    const bottom =
                      ((Math.min(shift.endMinutes, DAY_MAX) - DAY_MIN) / 60) *
                      HOUR_HEIGHT;
                    const height = Math.max(bottom - top, 22);
                    const widthPct = 100 / shift.laneCount;

                    return (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShiftClick(shift.id);
                        }}
                        className={cn(
                          "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs transition-[filter] hover:brightness-110",
                          colorByUser.get(shift.userId) ??
                            "border-slate-500 bg-slate-500/15 text-foreground",
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${shift.lane * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                      >
                        <div className="truncate font-medium leading-tight">
                          {staffLabel(staffById.get(shift.userId))}
                        </div>
                        <div className="text-[10px] tabular-nums leading-tight opacity-80">
                          {formatMinutes(shift.startMinutes)} -{" "}
                          {formatMinutes(shift.endMinutes)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
