import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import {
  format,
  getISODay,
  differenceInCalendarWeeks,
} from "date-fns";
import { ScheduledWorkoutCard } from "./scheduled-workout-card";
import { ThemedText } from "@/components/ui/themed-text";

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const };

type WeekSession = {
  _id: string;
  assignmentId: string;
  workoutDayId: string;
  performedOn: string;
  status: string;
};

type AssignmentData = {
  _id: string;
  planificationId: string;
  revisionId?: string | null;
  startDate?: number;
  endDate?: number;
  status: string;
  planification?: { name: string; description?: string } | null;
};

interface AssignmentDayWorkoutProps {
  assignment: AssignmentData;
  selectedDate: Date;
  weekSessions: WeekSession[];
  isDark: boolean;
  hasActiveSubscription: boolean;
  showPlanificationName: boolean;
}

/**
 * Renders a ScheduledWorkoutCard for a single assignment on the selected date.
 * Each instance manages its own Convex queries for weeks, days, exercises, etc.
 */
export function AssignmentDayWorkout({
  assignment,
  selectedDate,
  weekSessions,
  isDark,
  hasActiveSubscription,
  showPlanificationName,
}: AssignmentDayWorkoutProps) {
  const router = useRouter();
  const selectedYmd = format(selectedDate, "yyyy-MM-dd");
  const selectedISOWeekday = getISODay(selectedDate);

  const weeks = useQuery(api.workoutWeeks.getByPlanification, {
    planificationId: assignment.planificationId as any,
    revisionId: (assignment.revisionId as any) ?? undefined,
  });

  const allWorkoutDays = useQuery(api.workoutDays.getByPlanification, {
    planificationId: assignment.planificationId as any,
    revisionId: assignment.revisionId as any,
  });

  const allExercises = useQuery(api.dayExercises.getByPlanification, {
    planificationId: assignment.planificationId as any,
    revisionId: assignment.revisionId as any,
  });

  const activeWeekForDate = useMemo(() => {
    if (!weeks || weeks.length === 0 || !assignment.startDate) return null;
    const sorted = [...weeks].sort((a, b) => a.order - b.order);
    const utc = new Date(assignment.startDate);
    const assignmentStartLocal = new Date(
      utc.getUTCFullYear(),
      utc.getUTCMonth(),
      utc.getUTCDate(),
    );
    const weeksPassed = differenceInCalendarWeeks(
      selectedDate,
      assignmentStartLocal,
      WEEK_STARTS_MONDAY,
    );
    if (weeksPassed < 0) return null;
    const weekIndex = weeksPassed % sorted.length;
    return sorted[weekIndex];
  }, [weeks, assignment.startDate, selectedDate]);

  const workoutDays = useMemo(() => {
    if (!allWorkoutDays) return undefined;
    if (!activeWeekForDate) return allWorkoutDays;
    return allWorkoutDays.filter((d) => d.weekId === activeWeekForDate._id);
  }, [allWorkoutDays, activeWeekForDate]);

  const exercisesByDay = useMemo(() => {
    if (!allExercises) return {} as Record<string, typeof allExercises>;
    const map: Record<string, typeof allExercises> = {};
    allExercises.forEach((ex) => {
      const dayId = ex.workoutDayId;
      if (!map[dayId]) map[dayId] = [];
      map[dayId].push(ex);
    });
    return map;
  }, [allExercises]);

  const scheduledWorkoutDay = useMemo(() => {
    if (!workoutDays) return null;
    if (assignment.startDate) {
      const s = new Date(assignment.startDate);
      const start = new Date(
        s.getUTCFullYear(),
        s.getUTCMonth(),
        s.getUTCDate(),
      );
      const sel = new Date(selectedDate);
      sel.setHours(0, 0, 0, 0);
      if (sel < start) return null;
    }
    if (assignment.endDate) {
      const e = new Date(assignment.endDate);
      const end = new Date(
        e.getUTCFullYear(),
        e.getUTCMonth(),
        e.getUTCDate(),
        23,
        59,
        59,
        999,
      );
      if (selectedDate > end) return null;
    }
    return workoutDays.find((d) => d.dayOfWeek === selectedISOWeekday) ?? null;
  }, [
    workoutDays,
    selectedISOWeekday,
    assignment.startDate,
    assignment.endDate,
    selectedDate,
  ]);

  const sessionsForAssignment = useMemo(
    () => weekSessions.filter((s) => s.assignmentId === assignment._id),
    [weekSessions, assignment._id],
  );

  const sessionForSelected = useMemo(
    () =>
      sessionsForAssignment.find(
        (s) =>
          s.performedOn === selectedYmd &&
          s.workoutDayId === scheduledWorkoutDay?._id,
      ) ??
      sessionsForAssignment.find((s) => s.performedOn === selectedYmd) ??
      null,
    [sessionsForAssignment, selectedYmd, scheduledWorkoutDay?._id],
  );

  const historicalWorkoutDay = useQuery(
    api.workoutDays.getById,
    sessionForSelected && !scheduledWorkoutDay
      ? { id: sessionForSelected.workoutDayId as any }
      : "skip",
  );

  const workoutDayToDisplay =
    scheduledWorkoutDay ?? historicalWorkoutDay ?? null;

  const blocksForDisplayDay = useQuery(
    api.exerciseBlocks.getByWorkoutDay,
    workoutDayToDisplay?._id
      ? { workoutDayId: workoutDayToDisplay._id }
      : "skip",
  );

  const { statusBadgeLabel, statusBadgeVariant } = useMemo(() => {
    if (!sessionForSelected) {
      return {
        statusBadgeLabel: "No Iniciado",
        statusBadgeVariant: "notStarted" as const,
      };
    }
    if (sessionForSelected.status === "completed") {
      return {
        statusBadgeLabel: "Completado",
        statusBadgeVariant: "completed" as const,
      };
    }
    if (sessionForSelected.status === "skipped") {
      return {
        statusBadgeLabel: "Omitido",
        statusBadgeVariant: "skipped" as const,
      };
    }
    return {
      statusBadgeLabel: "En curso",
      statusBadgeVariant: "inProgress" as const,
    };
  }, [sessionForSelected]);

  const exerciseNames = useMemo(() => {
    const dayId = workoutDayToDisplay?._id;
    if (!dayId) return [];
    const list = exercisesByDay[dayId] ?? [];
    return [...list]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((ex) => ex.exercise?.name)
      .filter((name): name is string => Boolean(name));
  }, [exercisesByDay, workoutDayToDisplay?._id]);

  const handleOpenWorkout = () => {
    if (!hasActiveSubscription) return;
    if (sessionForSelected) {
      router.push(`/home/workout/${sessionForSelected._id}` as Href);
    } else if (scheduledWorkoutDay) {
      router.push(
        `/home/workout/new?workoutDayId=${scheduledWorkoutDay._id}&performedOn=${selectedYmd}&assignmentId=${assignment._id}` as Href,
      );
    }
  };

  // Nothing to show for this assignment on this day
  if (!workoutDayToDisplay) return null;
  // Still loading
  if (
    weeks === undefined ||
    allWorkoutDays === undefined ||
    blocksForDisplayDay === undefined
  )
    return null;

  const planificationName =
    assignment.planification?.name ?? "Planificación";

  return (
    <View>
      {showPlanificationName && (
        <ThemedText style={styles.planificationLabel}>
          {planificationName}
        </ThemedText>
      )}
      <ScheduledWorkoutCard
        name={workoutDayToDisplay.name}
        isDark={isDark}
        statusBadgeVariant={statusBadgeVariant}
        statusBadgeLabel={statusBadgeLabel}
        blockCount={blocksForDisplayDay?.length ?? 0}
        exerciseCount={exercisesByDay[workoutDayToDisplay._id]?.length ?? 0}
        exerciseNames={exerciseNames}
        onPress={handleOpenWorkout}
      />
    </View>
  );
}

/**
 * Returns YMD strings for days within [gridStart, gridEnd] that have a scheduled
 * workout for this assignment, accounting for multi-week cycling and date range.
 * The range can span several calendar weeks (e.g. a full month grid), so the
 * active planification week is resolved per day rather than once for the range.
 */
export function useAssignmentScheduledDays(
  assignment: AssignmentData | undefined,
  gridStart: Date,
  gridEnd: Date,
): string[] {
  const weeks = useQuery(
    api.workoutWeeks.getByPlanification,
    assignment?.planificationId
      ? {
          planificationId: assignment.planificationId as any,
          revisionId: (assignment.revisionId as any) ?? undefined,
        }
      : "skip",
  );

  const allWorkoutDays = useQuery(
    api.workoutDays.getByPlanification,
    assignment?.planificationId
      ? {
          planificationId: assignment.planificationId as any,
          revisionId: assignment.revisionId as any,
        }
      : "skip",
  );

  return useMemo(() => {
    if (!assignment || !allWorkoutDays || allWorkoutDays.length === 0)
      return [];

    const sortedWeeks =
      weeks && weeks.length > 0
        ? [...weeks].sort((a, b) => a.order - b.order)
        : null;

    const assignmentStartLocal = assignment.startDate
      ? (() => {
          const s = new Date(assignment.startDate);
          return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
        })()
      : null;

    const rangeStart = assignmentStartLocal;
    const rangeEnd = assignment.endDate
      ? (() => {
          const e = new Date(assignment.endDate);
          return new Date(
            e.getUTCFullYear(),
            e.getUTCMonth(),
            e.getUTCDate(),
            23,
            59,
            59,
            999,
          );
        })()
      : null;

    const result: string[] = [];
    const curr = new Date(gridStart);
    while (curr <= gridEnd) {
      const date = new Date(curr);

      // Resolve the active planification week for this specific day, so a
      // multi-week cycle maps correctly across the calendar weeks in range.
      let filteredDays = allWorkoutDays;
      if (sortedWeeks && assignmentStartLocal) {
        const weeksPassed = differenceInCalendarWeeks(
          date,
          assignmentStartLocal,
          WEEK_STARTS_MONDAY,
        );
        if (weeksPassed >= 0) {
          const activeWeek = sortedWeeks[weeksPassed % sortedWeeks.length];
          filteredDays = allWorkoutDays.filter(
            (d) => d.weekId === activeWeek._id,
          );
        }
      }

      const isoDay = getISODay(date);
      const hasWorkout = filteredDays.some((d) => d.dayOfWeek === isoDay);
      if (hasWorkout) {
        const inRange =
          (!rangeStart || date >= rangeStart) &&
          (!rangeEnd || date <= rangeEnd);
        if (inRange) result.push(format(date, "yyyy-MM-dd"));
      }
      curr.setDate(curr.getDate() + 1);
    }
    return result;
  }, [assignment, allWorkoutDays, weeks, gridStart, gridEnd]);
}

const styles = StyleSheet.create({
  planificationLabel: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.6,
    marginBottom: 6,
  },
});
