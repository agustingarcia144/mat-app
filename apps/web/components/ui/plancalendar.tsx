"use client";

import { useState } from "react";
import {
  addDays,
  startOfMonth,
  startOfWeek,
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

export default function PlanCalendar({ startDate, endDate }: Props) {
  const [month, setMonth] = useState(startOfMonth(startDate));

  const today = new Date();

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });

  /* 42 días = 6 semanas completas */
  const days = Array.from({ length: 42 }).map((_, i) => addDays(start, i));

  const isInRange = (date: Date) => date >= startDate && date <= endDate;

  const isLastDays = (date: Date) =>
    isInRange(date) &&
    (endDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) <= 5;

  const isExpired = endDate < today;

  const isToday = (date: Date) =>
    format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

  return (
    <div className="w-full space-y-2">
      {/* HEADER */}

      <div className="flex items-center justify-between text-[11px] sm:text-xs">
        <button
          onClick={() => setMonth(subMonths(month, 1))}
          className="rounded p-1 hover:bg-muted sm:p-1"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-center font-bold uppercase tracking-wide">
          {format(month, "MMMM yyyy", { locale: es })}
        </span>

        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded p-1 hover:bg-muted sm:p-1"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* WEEK DAYS */}

      <div className="grid grid-cols-7 text-[10px] text-muted-foreground sm:text-[10px]">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      {/* DAYS */}

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const inRange = isInRange(date);

          let bg = "";

          if (inRange) {
            if (isExpired) bg = "bg-red-500/40";
            else if (isLastDays(date)) bg = "bg-yellow-500/40";
            else bg = "bg-green-500/40";
          }

          return (
            <div
              key={date.toISOString()}
              className={`
                h-7 sm:h-8
                flex items-center justify-center
                text-[11px] sm:text-xs
                rounded
                ${bg}
                ${isToday(date) ? "border border-white" : ""}
              `}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
