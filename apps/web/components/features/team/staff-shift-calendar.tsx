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
const HOUR_HEIGHT = 56; // px per hour row
const DAY_MIN = START_HOUR * 60;
const DAY_MAX = (END_HOUR + 1) * 60;
const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Palette used to color shift blocks per employee (stable by index).
const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-lime-600",
];

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
      map.set(s.userId, PALETTE[index % PALETTE.length]);
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
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 bg-muted">
            <div className="border-r border-b p-2 text-sm font-medium">
              Hora
            </div>
            {DAY_SHORT.map((label, index) => {
              const day = weekDays?.[index];
              const isToday = day ? isSameDay(day, new Date()) : false;
              return (
                <div
                  key={index}
                  className={cn(
                    "border-r border-b p-2 text-center",
                    isToday && "bg-primary/10",
                  )}
                >
                  <div className="font-medium">{label}</div>
                  {day && (
                    <div
                      className={cn(
                        "text-sm",
                        isToday
                          ? "font-semibold text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(day, "d", { locale: es })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Body: hour-label column + 7 day columns */}
          <div className="grid grid-cols-8">
            {/* Hour labels */}
            <div className="border-r">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b p-2 text-sm text-muted-foreground"
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
                  className={cn(
                    "relative border-r",
                    isToday && "bg-primary/5",
                  )}
                  style={{ height: bodyHeight }}
                >
                  {/* Clickable hour cells (background grid) */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="cursor-pointer border-b hover:bg-accent/30"
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
                          "absolute overflow-hidden rounded p-1.5 text-left text-xs text-white transition-opacity hover:opacity-90",
                          colorByUser.get(shift.userId) ?? "bg-slate-500",
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
                        <div className="text-[10px] leading-tight opacity-90">
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
