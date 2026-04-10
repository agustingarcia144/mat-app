"use client";

import { useMemo } from "react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight } from "lucide-react";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm
const DAYS_IN_WEEK = 7;
const DEFAULT_FIXED_SLOT_DURATION_MINUTES = 60;

export type FixedSlotDetailInput = {
  classId: Id<"classes">;
  dayOfWeek: number;
  startTimeMinutes: number;
};

type FixedSlotWithDetails = Doc<"fixedClassSlots"> & {
  className: string | null;
  userFullName: string;
};

interface FixedSlotsWeeklyTimelineProps {
  fixedSlots: FixedSlotWithDetails[];
  /** Used only to compute endTime/duration for block height when available. */
  schedules?: (Doc<"classSchedules"> & { class?: { name: string } })[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onFixedSlotClick: (slot: FixedSlotDetailInput) => void;
  /** When false, week navigation is rendered by the parent. Default true. */
  showWeekNavigation?: boolean;
}

type FixedSlotBlock = {
  slotKey: string;
  classId: Id<"classes">;
  dayOfWeek: number;
  startTimeMinutes: number;
  className: string | null;
  memberCount: number;
  startTime: Date;
  endTime: Date;
  hour: number;
};

export default function FixedSlotsWeeklyTimeline({
  fixedSlots,
  schedules = [],
  currentDate,
  onDateChange,
  onFixedSlotClick,
  showWeekNavigation = true,
}: FixedSlotsWeeklyTimelineProps) {
  const isMobile = useIsMobile();

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) =>
      addDays(weekStart, i),
    );
  }, [weekStart]);

  const scheduleEndTimeByKey = useMemo(() => {
    const map = new Map<string, number>();

    for (const schedule of schedules) {
      const start = new Date(schedule.startTime);
      const dayOfWeek = start.getDay(); // 0-6, Sunday = 0 (matches fixedClassSlots)
      const startTimeMinutes = start.getHours() * 60 + start.getMinutes();
      const key = `${schedule.classId}-${dayOfWeek}-${startTimeMinutes}`;

      // Prefer the first match; endTime should be stable for a given slot.
      if (!map.has(key)) map.set(key, schedule.endTime);
    }

    return map;
  }, [schedules]);

  const fixedSlotBlocksByDay = useMemo(() => {
    /**
     * Model calendar blocks are built from the union of:
     * - schedule occurrences in the selected week (even if there are 0 fixed slots)
     * - fixed-slot combinations that don't have a schedule occurrence yet
     */
    const blocksByKey = new Map<string, FixedSlotBlock>();

    const memberCountByKey = new Map<string, number>();
    const fixedClassNameByKey = new Map<string, string | null>();

    for (const slot of fixedSlots) {
      const key = `${slot.classId}-${slot.dayOfWeek}-${slot.startTimeMinutes}`;
      memberCountByKey.set(key, (memberCountByKey.get(key) ?? 0) + 1);
      if (!fixedClassNameByKey.has(key))
        fixedClassNameByKey.set(key, slot.className);
    }

    // 1) Blocks coming from existing schedules.
    for (const schedule of schedules) {
      const start = new Date(schedule.startTime);
      const dayOfWeek = start.getDay(); // 0-6, Sunday=0 (matches fixedClassSlots)
      const startTimeMinutes = start.getHours() * 60 + start.getMinutes();

      const blockHour = start.getHours();
      if (!HOURS.includes(blockHour)) continue;

      const key = `${schedule.classId}-${dayOfWeek}-${startTimeMinutes}`;
      const existing = blocksByKey.get(key);

      const memberCount = memberCountByKey.get(key) ?? 0;
      const className = schedule.class?.name ?? null;

      if (!existing) {
        blocksByKey.set(key, {
          slotKey: key,
          classId: schedule.classId,
          dayOfWeek,
          startTimeMinutes,
          className,
          memberCount,
          startTime: start,
          endTime: new Date(schedule.endTime),
          hour: blockHour,
        });
      } else {
        // Keep stable endTime from the first occurrence
        existing.className = existing.className ?? className;
        existing.memberCount = memberCount;
      }
    }

    // 2) Fixed-slot-only blocks for when the schedule doesn't exist yet.
    for (const slot of fixedSlots) {
      const key = `${slot.classId}-${slot.dayOfWeek}-${slot.startTimeMinutes}`;
      if (blocksByKey.has(key)) continue;

      const dayIndex = weekDays.findIndex((d) => d.getDay() === slot.dayOfWeek);
      if (dayIndex === -1) continue;

      const hour = Math.floor(slot.startTimeMinutes / 60);
      const minute = slot.startTimeMinutes % 60;

      const startTime = new Date(weekDays[dayIndex]);
      startTime.setHours(hour, minute, 0, 0);

      const blockHour = startTime.getHours();
      if (!HOURS.includes(blockHour)) continue;

      const scheduleEndMs =
        scheduleEndTimeByKey.get(key) ??
        startTime.getTime() + DEFAULT_FIXED_SLOT_DURATION_MINUTES * 60 * 1000;

      blocksByKey.set(key, {
        slotKey: key,
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        startTimeMinutes: slot.startTimeMinutes,
        className: fixedClassNameByKey.get(key) ?? null,
        memberCount: memberCountByKey.get(key) ?? 0,
        startTime,
        endTime: new Date(scheduleEndMs),
        hour: blockHour,
      });
    }

    const groupedByDay: FixedSlotBlock[][] = Array.from(
      { length: DAYS_IN_WEEK },
      () => [],
    );

    blocksByKey.forEach((block) => {
      const dayIndex = weekDays.findIndex(
        (d) => d.getDay() === block.dayOfWeek,
      );
      if (dayIndex === -1) return;
      groupedByDay[dayIndex].push(block);
    });

    groupedByDay.forEach((dayBlocks) => {
      dayBlocks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    });

    return groupedByDay;
  }, [fixedSlots, schedules, weekDays, scheduleEndTimeByKey]);

  // Group fixed slot blocks by day/hour for desktop grid.
  const fixedSlotsByDayHour = useMemo(() => {
    const map = new Map<string, FixedSlotBlock[]>();
    if (isMobile) return map;

    fixedSlotBlocksByDay.forEach((dayBlocks, dayIndex) => {
      dayBlocks.forEach((block) => {
        const key = `${dayIndex}-${block.hour}`;
        const existing = map.get(key) || [];
        map.set(key, [...existing, block]);
      });
    });

    return map;
  }, [fixedSlotBlocksByDay, isMobile]);

  const goToPreviousWeek = () => onDateChange(addDays(currentDate, -7));
  const goToNextWeek = () => onDateChange(addDays(currentDate, 7));
  const goToToday = () => onDateChange(new Date());

  const weekNavigation = showWeekNavigation && (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousWeek}
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="outline" onClick={goToToday}>
          Hoy
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          aria-label="Semana siguiente"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <h2 className="text-base font-semibold sm:text-lg">
        {format(weekStart, "d", { locale: es })} -{" "}
        {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", { locale: es })}
      </h2>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        {weekNavigation}

        <div className="space-y-3">
          {weekDays.map((day, dayIndex) => {
            const dayBlocks = fixedSlotBlocksByDay[dayIndex] || [];
            const isToday = isSameDay(day, new Date());

            return (
              <section
                key={day.toISOString()}
                className={cn(
                  "overflow-hidden rounded-lg border",
                  isToday && "border-primary/40",
                )}
              >
                <header
                  className={cn(
                    "flex items-center justify-between border-b px-3 py-2",
                    isToday && "bg-primary/5",
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {format(day, "EEEE", { locale: es })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(day, "d 'de' MMMM", { locale: es })}
                    </p>
                  </div>
                  {isToday && <Badge variant="secondary">Hoy</Badge>}
                </header>

                <div className="space-y-2 p-3">
                  {dayBlocks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin turnos</p>
                  ) : (
                    dayBlocks.map((block) => {
                      return (
                        <button
                          key={block.slotKey}
                          type="button"
                          onClick={() =>
                            onFixedSlotClick({
                              classId: block.classId,
                              dayOfWeek: block.dayOfWeek,
                              startTimeMinutes: block.startTimeMinutes,
                            })
                          }
                          className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {block.className || "Clase"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(block.startTime, "HH:mm")} -{" "}
                                {format(block.endTime, "HH:mm")}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              {block.memberCount > 0
                                ? "Turno fijo"
                                : "Sin turno fijo"}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span
                              className={cn(
                                "inline-block h-2.5 w-2.5 rounded-full",
                                block.memberCount > 0
                                  ? "bg-purple-600"
                                  : "bg-muted-foreground/60",
                              )}
                            />
                            <span>{block.memberCount} miembros</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weekNavigation}

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-8 bg-muted">
              <div className="border-r border-b p-2 text-sm font-medium">
                Hora
              </div>
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={index}
                    className={cn(
                      "border-r border-b p-2 text-center",
                      isToday && "bg-primary/10",
                    )}
                  >
                    <div className="font-medium">
                      {format(day, "EEE", { locale: es })}
                    </div>
                    <div
                      className={cn(
                        "text-sm",
                        isToday
                          ? "text-primary font-semibold"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time rows */}
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 border-b">
                <div className="border-r p-2 text-sm text-muted-foreground">
                  {hour.toString().padStart(2, "0")}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  const key = `${dayIndex}-${hour}`;
                  const dayBlocks = fixedSlotsByDayHour.get(key) || [];
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className={cn(
                        "relative min-h-[60px] border-r p-1",
                        isToday && "bg-primary/5",
                      )}
                    >
                      {dayBlocks.map((block) => {
                        const durationHours =
                          (block.endTime.getTime() -
                            block.startTime.getTime()) /
                          (1000 * 60 * 60);

                        return (
                          <button
                            key={block.slotKey}
                            type="button"
                            onClick={() =>
                              onFixedSlotClick({
                                classId: block.classId,
                                dayOfWeek: block.dayOfWeek,
                                startTimeMinutes: block.startTimeMinutes,
                              })
                            }
                            className={cn(
                              "mb-1 w-full rounded p-2 text-left text-xs text-white transition-opacity hover:opacity-80",
                              "bg-purple-600",
                            )}
                            style={{
                              minHeight: `${Math.max(durationHours * 50, 40)}px`,
                            }}
                          >
                            <div className="truncate font-medium">
                              {block.className || "Clase"}
                            </div>
                            <div className="text-[10px] opacity-90">
                              {format(block.startTime, "HH:mm")} -{" "}
                              {format(block.endTime, "HH:mm")}
                            </div>
                            <div className="mt-1 text-[10px] opacity-90">
                              {block.memberCount} miembros
                            </div>
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
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">Tipo:</span>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-purple-600" />
          <span>Turno fijo</span>
        </div>
      </div>
    </div>
  );
}
