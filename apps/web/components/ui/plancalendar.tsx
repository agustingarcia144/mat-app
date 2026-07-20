"use client";

import { useState } from "react";
import {
  addDays,
  isSameDay,
  startOfMonth,
  startOfWeek,
  endOfMonth,
  addMonths,
  subMonths,
  format,
} from "date-fns";

import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  startDate: Date;
  endDate: Date;
};

const WEEK_DAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

export default function PlanCalendar({ startDate, endDate }: Props) {
  const [month, setMonth] = useState(startOfMonth(startDate));

  const today = new Date();
  const isExpired = endDate < today;

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));

  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const rangeStart = midnight(startDate);
  const rangeEnd = midnight(endDate);

  const isInRange = (date: Date) =>
    midnight(date) >= rangeStart && midnight(date) <= rangeEnd;
  const isRangeStart = (date: Date) => isSameDay(date, startDate);
  const isRangeEnd = (date: Date) => isSameDay(date, endDate);
  const isToday = (date: Date) => isSameDay(date, today);
  const inMonth = (date: Date) => date.getMonth() === month.getMonth();

  // Accent color for the whole range, by plan status.
  const accent = isExpired
    ? { band: "bg-muted", cap: "bg-muted-foreground/70 text-background" }
    : endDate.getTime() - today.getTime() <= 5 * 24 * 60 * 60 * 1000
      ? {
          band: "bg-amber-500/15 dark:bg-amber-400/15",
          cap: "bg-amber-500 text-white",
        }
      : {
          band: "bg-emerald-500/15 dark:bg-emerald-400/15",
          cap: "bg-emerald-500 text-white",
        };

  const monthDays = days.filter(inMonth).length;
  const inRangeThisMonth = days.some((d) => inMonth(d) && isInRange(d));

  return (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(subMonths(month, 1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-sm font-semibold capitalize tracking-wide">
          {format(month, "MMMM yyyy", { locale: es })}
        </span>

        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEK_DAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-medium uppercase text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((date) => {
          const inRange = isInRange(date);
          const start = isRangeStart(date);
          const end = isRangeEnd(date);
          const cap = start || end;

          // Rounded band ends: round the left on the start / week start,
          // round the right on the end / week end, so the range reads as a pill.
          const dow = (date.getDay() + 6) % 7; // 0 = Monday
          const roundLeft = start || dow === 0;
          const roundRight = end || dow === 6;

          return (
            <div key={date.toISOString()} className="flex justify-center py-0.5">
              <div
                className={[
                  "relative flex h-8 w-full items-center justify-center",
                  inRange && !cap ? accent.band : "",
                  inRange && roundLeft ? "rounded-l-full" : "",
                  inRange && roundRight ? "rounded-r-full" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs",
                    !inMonth(date) ? "text-muted-foreground/40" : "",
                    cap ? `${accent.cap} font-semibold` : "",
                    !cap && inRange ? "font-medium text-foreground" : "",
                    !inRange && isToday(date)
                      ? "font-semibold text-foreground ring-1 ring-inset ring-border"
                      : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!inRangeThisMonth && monthDays > 0 && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          La planificación no cae en este mes
        </p>
      )}
    </div>
  );
}
