"use client";

import Image from "next/image";
import { useState } from "react";
import { UseFormReturn, useFieldArray, Controller } from "react-hook-form";
import { Plus, ChevronDown, ChevronUp, Trash2, Copy } from "lucide-react";
import { useDroppable } from "@dnd-kit/react";
import { Button } from "@/components/ui/button";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import WeekCalendarRow, {
  DAY_CARD_PREFIX,
  WEEKDAY_DROP_PREFIX,
  DragEndMonitor,
  TypedDragDropProvider,
} from "@/components/features/planifications/form/week-calendar-row";
import { Field, FieldError } from "@/components/ui/field";
import { usePlanificationFormOptional } from "@/contexts/planification-form-context";
import { PlanificationForm } from "@repo/core/schemas";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import matWolfLooking from "@/assets/mat-wolf-looking.png";

const WEEK_DROP_PREFIX = "week-drop-";

type DayOfWeek = NonNullable<
  PlanificationForm["workoutWeeks"][0]["workoutDays"][0]["dayOfWeek"]
>;

/** Parses the numeric `${a}-${b}` suffix of a drag/drop id. */
function parseDragId(id: string, prefix: string): number[] {
  return id
    .slice(prefix.length)
    .split("-")
    .map((part) => parseInt(part, 10));
}

/** Week header drop target: dropping a day here moves it to this week keeping its weekday (works while collapsed). */
function WeekHeaderDropZone({
  weekIndex,
  children,
}: {
  weekIndex: number;
  children: React.ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `${WEEK_DROP_PREFIX}${weekIndex}`,
    accept: (source: { id?: unknown }) =>
      String(source?.id ?? "").startsWith(DAY_CARD_PREFIX),
  });
  return (
    <div
      ref={ref as (el: HTMLDivElement | null) => void}
      className={`flex flex-wrap items-center gap-2 rounded-md ${isDropTarget ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

interface WorkoutWeeksSectionProps {
  form: UseFormReturn<PlanificationForm>;
}

export default function WorkoutWeeksSection({
  form,
}: WorkoutWeeksSectionProps) {
  const { planificationId } = usePlanificationFormOptional();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "workoutWeeks",
  });

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([0]));

  const addWeek = () => {
    const newIndex = fields.length;
    append({
      id: `temp-${Date.now()}`,
      name: `Semana ${fields.length + 1}`,
      workoutDays: [],
    });
    setExpandedWeeks(new Set([...Array.from(expandedWeeks), newIndex]));
  };

  const toggleWeekExpanded = (weekIndex: number) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekIndex)) {
      newExpanded.delete(weekIndex);
    } else {
      newExpanded.add(weekIndex);
    }
    setExpandedWeeks(newExpanded);
  };

  const copyWeek = (weekIndex: number) => {
    const currentWeek = form.getValues(`workoutWeeks.${weekIndex}`);
    append({
      id: `temp-${Date.now()}`,
      name: `Semana ${fields.length + 1}`,
      workoutDays: currentWeek.workoutDays.map((day) => ({
        ...day,
        id: `temp-${Date.now()}-${Math.random()}`,
        exercises: day.exercises.map((ex) => ({
          ...ex,
          id: `temp-ex-${Date.now()}-${Math.random()}`,
        })),
      })),
    });
  };

  /** Without `dayOfWeek` the day keeps its weekday, landing in the same column of the target week. */
  const moveDayToWeek = (
    fromWeekIndex: number,
    dayIndex: number,
    toWeekIndex: number,
    dayOfWeek?: DayOfWeek,
  ) => {
    if (fromWeekIndex === toWeekIndex) return;
    const sourceDays =
      form.getValues(`workoutWeeks.${fromWeekIndex}.workoutDays`) ?? [];
    const day = sourceDays[dayIndex];
    if (!day) return;
    const targetDays =
      form.getValues(`workoutWeeks.${toWeekIndex}.workoutDays`) ?? [];
    form.setValue(
      `workoutWeeks.${toWeekIndex}.workoutDays`,
      [...targetDays, dayOfWeek ? { ...day, dayOfWeek } : day],
      { shouldDirty: true },
    );
    form.setValue(
      `workoutWeeks.${fromWeekIndex}.workoutDays`,
      sourceDays.filter((_, i) => i !== dayIndex),
      { shouldDirty: true },
    );
    setExpandedWeeks(new Set([...Array.from(expandedWeeks), toWeekIndex]));
  };

  const onDayDragEnd = (event: any, manager?: any) => {
    if (event?.canceled) return;
    const op =
      event?.operation ??
      manager?.dragOperation ??
      manager?.operation ??
      event?.detail?.operation;
    const sourceId = String(op?.source?.id ?? "");
    const targetId = String(op?.target?.id ?? "");
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!sourceId.startsWith(DAY_CARD_PREFIX)) return;

    const [fromWeek, dayIndex] = parseDragId(sourceId, DAY_CARD_PREFIX);
    if (Number.isNaN(fromWeek) || Number.isNaN(dayIndex)) return;

    let toWeek: number;
    let toDow: number | undefined;
    if (targetId.startsWith(DAY_CARD_PREFIX)) {
      // Dropped on another day card: move to that day's column
      const [week, targetDayIndex] = parseDragId(targetId, DAY_CARD_PREFIX);
      if (Number.isNaN(week) || Number.isNaN(targetDayIndex)) return;
      toWeek = week;
      toDow =
        form.getValues(
          `workoutWeeks.${week}.workoutDays.${targetDayIndex}.dayOfWeek`,
        ) ?? 1;
      if (toDow < 1 || toDow > 7) toDow = 1;
    } else if (targetId.startsWith(WEEKDAY_DROP_PREFIX)) {
      // Dropped on weekday zone
      [toWeek, toDow] = parseDragId(targetId, WEEKDAY_DROP_PREFIX);
      if (Number.isNaN(toDow) || toDow < 1 || toDow > 7) return;
    } else if (targetId.startsWith(WEEK_DROP_PREFIX)) {
      // Dropped on a week header: keep the weekday
      [toWeek] = parseDragId(targetId, WEEK_DROP_PREFIX);
    } else {
      return;
    }
    if (Number.isNaN(toWeek) || !fields[toWeek]) return;

    if (toWeek !== fromWeek) {
      moveDayToWeek(fromWeek, dayIndex, toWeek, toDow as DayOfWeek | undefined);
    } else if (toDow !== undefined) {
      form.setValue(
        `workoutWeeks.${fromWeek}.workoutDays.${dayIndex}.dayOfWeek`,
        toDow as DayOfWeek,
        { shouldDirty: true },
      );
    }
  };

  const canDeleteWeek = fields.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            Semanas de entrenamiento{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {fields.length}
            </span>
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Arrastrá los días para reorganizarlos entre semanas.
          </p>
        </div>
        <ResponsiveActionButton
          type="button"
          onClick={addWeek}
          variant="outline"
          mobileSize="sm"
          icon={<Plus className="h-4 w-4" aria-hidden />}
          label="Agregar semana"
          tooltip="Agregar semana"
        />
      </div>

      {fields.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-16 w-16 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>No hay semanas agregadas</EmptyTitle>
            <EmptyDescription>
              Haz clic en &quot;Agregar semana&quot; para comenzar
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TypedDragDropProvider>
          <DragEndMonitor onDragEnd={onDayDragEnd}>
            <div className="space-y-4">
              {fields.map((field, weekIndex) => {
                const isExpanded = expandedWeeks.has(weekIndex);
                const week = form.watch(`workoutWeeks.${weekIndex}`);
                const dayCount = week?.workoutDays?.length || 0;
                const exerciseCount =
                  week?.workoutDays?.reduce(
                    (acc, day) => acc + (day.exercises?.length || 0),
                    0,
                  ) || 0;

                return (
                  <div
                    key={field.id}
                    className="overflow-hidden rounded-xl border bg-card p-3 md:p-5"
                  >
                    <WeekHeaderDropZone weekIndex={weekIndex}>
                      <Controller
                        name={`workoutWeeks.${weekIndex}.name`}
                        control={form.control}
                        render={({ field, fieldState }) => (
                          <Field
                            data-invalid={fieldState.invalid}
                            className="min-w-0 flex-1 sm:max-w-64"
                          >
                            <Input
                              {...field}
                              aria-invalid={fieldState.invalid}
                              aria-label="Nombre de la semana"
                              placeholder="Nombre de la semana"
                              className="border-transparent bg-transparent font-semibold shadow-none hover:border-input focus-visible:border-input"
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />

                      <div className="mr-auto hidden text-xs text-muted-foreground sm:block">
                        {dayCount} {dayCount === 1 ? "día" : "días"} ·{" "}
                        {exerciseCount}{" "}
                        {exerciseCount === 1 ? "ejercicio" : "ejercicios"}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={
                          isExpanded ? "Contraer semana" : "Expandir semana"
                        }
                        aria-expanded={isExpanded}
                        onClick={() => toggleWeekExpanded(weekIndex)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </Button>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Duplicar semana"
                            onClick={() => copyWeek(weekIndex)}
                          >
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copiar semana</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar semana"
                            onClick={() => remove(weekIndex)}
                            disabled={!canDeleteWeek}
                          >
                            <Trash2
                              className={`h-4 w-4 ${canDeleteWeek ? "text-destructive" : "text-muted-foreground/50"}`}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canDeleteWeek
                            ? "Eliminar semana"
                            : "Debe tener al menos una semana"}
                        </TooltipContent>
                      </Tooltip>
                    </WeekHeaderDropZone>

                    {isExpanded && (
                      <div className="mt-4 border-t pt-4">
                        <WeekCalendarRow
                          form={form}
                          weekIndex={weekIndex}
                          planificationId={planificationId}
                          moveTargets={fields
                            .map((_, i) => ({
                              weekIndex: i,
                              name:
                                form.getValues(`workoutWeeks.${i}.name`) ||
                                `Semana ${i + 1}`,
                            }))
                            .filter((target) => target.weekIndex !== weekIndex)}
                          onMoveDayToWeek={(dayIndex, toWeekIndex) =>
                            moveDayToWeek(weekIndex, dayIndex, toWeekIndex)
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DragEndMonitor>
        </TypedDragDropProvider>
      )}
    </div>
  );
}
