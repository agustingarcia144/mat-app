import { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";

export type AssignmentPhase = "current" | "upcoming" | "finished";

export const ASSIGNMENT_PHASES: AssignmentPhase[] = [
  "current",
  "upcoming",
  "finished",
];

export const ASSIGNMENT_PHASE_LABEL: Record<AssignmentPhase, string> = {
  current: "En curso",
  upcoming: "Programadas",
  finished: "Finalizadas",
};

/** Days left at which a running assignment is flagged as ending soon. */
export const ENDING_SOON_DAYS = 7;

type TimedAssignment = {
  status: string;
  startDate?: number | null;
  endDate?: number | null;
};

/**
 * Where an assignment sits on the calendar. The stored status stays "active"
 * after the end date passes, so the dates decide, not the status.
 */
export function getAssignmentPhase(
  assignment: TimedAssignment,
  now = Date.now(),
): AssignmentPhase {
  if (assignment.status === "completed") return "finished";
  if (
    assignment.endDate &&
    differenceInCalendarDays(assignment.endDate, now) < 0
  )
    return "finished";
  if (
    assignment.startDate &&
    differenceInCalendarDays(assignment.startDate, now) > 0
  )
    return "upcoming";
  return "current";
}

export function isEndingSoon(assignment: TimedAssignment, now = Date.now()) {
  if (getAssignmentPhase(assignment, now) !== "current") return false;
  if (!assignment.endDate) return false;
  return differenceInCalendarDays(assignment.endDate, now) <= ENDING_SOON_DAYS;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function relativeDays(days: number) {
  if (days >= 60) return plural(Math.round(days / 30), "mes", "meses");
  if (days >= 14) return plural(Math.round(days / 7), "semana", "semanas");
  return plural(days, "día", "días");
}

/** Short sentence describing how far along the assignment is. */
export function describeAssignmentTiming(
  assignment: TimedAssignment,
  now = Date.now(),
) {
  const phase = getAssignmentPhase(assignment, now);
  if (phase === "upcoming" && assignment.startDate) {
    const days = differenceInCalendarDays(assignment.startDate, now);
    return days === 1 ? "Empieza mañana" : `Empieza en ${relativeDays(days)}`;
  }
  if (phase === "finished") {
    if (!assignment.endDate) return "Finalizada";
    const days = differenceInCalendarDays(now, assignment.endDate);
    return days <= 1 ? "Finalizó ayer" : `Finalizó hace ${relativeDays(days)}`;
  }
  if (!assignment.endDate) return "Sin fecha de fin";
  const days = differenceInCalendarDays(assignment.endDate, now);
  if (days === 0) return "Termina hoy";
  if (days === 1) return "Termina mañana";
  return `Termina en ${relativeDays(days)}`;
}

/** Share of the date range already elapsed, 0–100, or null without dates. */
export function getAssignmentProgress(
  assignment: TimedAssignment,
  now = Date.now(),
) {
  if (!assignment.startDate || !assignment.endDate) return null;
  const total = assignment.endDate - assignment.startDate;
  if (total <= 0) return null;
  const elapsed = Math.min(Math.max(now - assignment.startDate, 0), total);
  return Math.round((elapsed / total) * 100);
}

export function formatAssignmentRange(assignment: TimedAssignment) {
  const { startDate, endDate } = assignment;
  if (!startDate && !endDate) return null;
  const full = (date: number) => format(date, "d MMM yyyy", { locale: es });
  if (!startDate) return `Hasta ${full(endDate!)}`;
  if (!endDate) return `Desde ${full(startDate)}`;
  const sameYear =
    new Date(startDate).getFullYear() === new Date(endDate).getFullYear();
  const start = format(startDate, sameYear ? "d MMM" : "d MMM yyyy", {
    locale: es,
  });
  return `${start} – ${full(endDate)}`;
}

export function getUserInitials(
  user?: {
    fullName?: string;
    email?: string;
  } | null,
) {
  if (user?.fullName) {
    return user.fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return user?.email ? user.email[0].toUpperCase() : "?";
}

/** Render-stable "now" for phase math; day granularity makes staleness moot. */
export function useNow() {
  const [now] = useState(() => Date.now());
  return now;
}
