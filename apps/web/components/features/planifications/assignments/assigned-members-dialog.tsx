"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  addDays,
  addMonths,
  format,
  max as maxDate,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarClock,
  MoreHorizontal,
  Search,
  UserMinus,
  UserPlus,
} from "lucide-react";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ASSIGNMENT_PHASE_LABEL,
  ASSIGNMENT_PHASES,
  describeAssignmentTiming,
  formatAssignmentRange,
  getAssignmentPhase,
  getAssignmentProgress,
  getUserInitials,
  isEndingSoon,
  useNow,
  type AssignmentPhase,
} from "./assignment-timing";

type PhaseFilter = "all" | AssignmentPhase;

type Assignment = {
  _id: Id<"planificationAssignments">;
  status: string;
  startDate?: number | null;
  endDate?: number | null;
  notes?: string | null;
  user?: { fullName?: string; email?: string; imageUrl?: string } | null;
};

interface AssignedMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  planificationName: string;
  /** Tab to land on; remount the dialog (via `key`) to apply a new one. */
  initialFilter?: PhaseFilter;
  /** Shows an "Asignar" shortcut in the header when provided. */
  onAssign?: () => void;
}

const PHASE_DOT: Record<AssignmentPhase, string> = {
  current: "bg-emerald-500",
  upcoming: "bg-sky-500",
  finished: "bg-muted-foreground/50",
};

const EXTEND_PRESETS = [
  { label: "+1 semana", apply: (d: Date) => addDays(d, 7) },
  { label: "+2 semanas", apply: (d: Date) => addDays(d, 14) },
  { label: "+1 mes", apply: (d: Date) => addMonths(d, 1) },
  { label: "+3 meses", apply: (d: Date) => addMonths(d, 3) },
];

const SEARCH_THRESHOLD = 6;

const normalize = (value?: string) => value?.trim().toLowerCase() ?? "";

export default function AssignedMembersDialog({
  open,
  onOpenChange,
  assignments,
  planificationName,
  initialFilter = "all",
  onAssign,
}: AssignedMembersDialogProps) {
  const unassign = useMutation(api.planificationAssignments.unassign);
  const extend = useMutation(api.planificationAssignments.extend);
  const [filter, setFilter] = useState<PhaseFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [unassignTarget, setUnassignTarget] = useState<Assignment | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [extendTarget, setExtendTarget] = useState<Assignment | null>(null);
  const [extendEndDate, setExtendEndDate] = useState("");
  const [extending, setExtending] = useState(false);

  const now = useNow();

  const counts = useMemo(() => {
    const result: Record<PhaseFilter, number> = {
      all: assignments.length,
      current: 0,
      upcoming: 0,
      finished: 0,
    };
    for (const assignment of assignments) {
      result[getAssignmentPhase(assignment, now)]++;
    }
    return result;
  }, [assignments, now]);

  const visible = useMemo(() => {
    const query = normalize(search);
    const phaseOrder: Record<AssignmentPhase, number> = {
      current: 0,
      upcoming: 1,
      finished: 2,
    };
    return assignments
      .filter((a) => filter === "all" || getAssignmentPhase(a, now) === filter)
      .filter(
        (a) =>
          !query ||
          normalize(a.user?.fullName).includes(query) ||
          normalize(a.user?.email).includes(query),
      )
      .sort((a, b) => {
        const pa = getAssignmentPhase(a, now);
        const pb = getAssignmentPhase(b, now);
        if (pa !== pb) return phaseOrder[pa] - phaseOrder[pb];
        // Running: ending first. Upcoming: starting first. Finished: latest first.
        if (pa === "current")
          return (a.endDate ?? Infinity) - (b.endDate ?? Infinity);
        if (pa === "upcoming") return (a.startDate ?? 0) - (b.startDate ?? 0);
        return (b.endDate ?? 0) - (a.endDate ?? 0);
      });
  }, [assignments, filter, search, now]);

  const handleUnassign = async () => {
    if (!unassignTarget) return;
    setUnassigning(true);
    try {
      await unassign({ id: unassignTarget._id });
      toast.success("Miembro desasignado");
      setUnassignTarget(null);
    } catch (error) {
      console.error("Failed to unassign:", error);
      toast.error("Error al desasignar");
    } finally {
      setUnassigning(false);
    }
  };

  /** Extensions start from the current end, or from today if it already passed. */
  const extendBase = extendTarget
    ? maxDate([
        startOfDay(new Date()),
        extendTarget.endDate ? new Date(extendTarget.endDate) : new Date(0),
      ])
    : new Date();

  const handleOpenExtend = (assignment: Assignment) => {
    const base = maxDate([
      startOfDay(new Date()),
      assignment.endDate ? new Date(assignment.endDate) : new Date(0),
    ]);
    setExtendTarget(assignment);
    setExtendEndDate(format(addMonths(base, 1), "yyyy-MM-dd"));
  };

  const closeExtend = () => {
    setExtendTarget(null);
    setExtendEndDate("");
  };

  const handleExtend = async () => {
    if (!extendTarget) return;
    if (!extendEndDate) {
      toast.error("Seleccioná una fecha de fin");
      return;
    }
    setExtending(true);
    try {
      await extend({
        id: extendTarget._id,
        endDate: new Date(`${extendEndDate}T00:00:00`).getTime(),
      });
      toast.success("Planificación extendida");
      closeExtend();
    } catch (error) {
      console.error("Failed to extend:", error);
      toast.error(error instanceof Error ? error.message : "Error al extender");
    } finally {
      setExtending(false);
    }
  };

  const memberName = (assignment: Assignment | null) =>
    assignment?.user?.fullName || assignment?.user?.email || "este miembro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] rounded-xl flex-col gap-4 overflow-hidden p-4 sm:max-h-[85vh] sm:max-w-2xl sm:p-6">
        <DialogHeader className="pr-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle>Miembros asignados</DialogTitle>
              <DialogDescription className="truncate">
                {planificationName} ·{" "}
                {assignments.length === 1
                  ? "1 miembro"
                  : `${assignments.length} miembros`}
              </DialogDescription>
            </div>
            {onAssign && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={onAssign}
              >
                <UserPlus className="size-4" aria-hidden />
                Asignar
              </Button>
            )}
          </div>
        </DialogHeader>

        {assignments.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Phones scroll the tabs sideways instead of wrapping them. */}
            <Tabs
              className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
              value={filter}
              onValueChange={(value) => setFilter(value as PhaseFilter)}
            >
              <TabsList className="h-auto w-max justify-start sm:w-auto sm:max-w-full sm:flex-wrap">
                {(["all", ...ASSIGNMENT_PHASES] as PhaseFilter[]).map(
                  (value) => (
                    <TabsTrigger key={value} value={value} className="gap-1.5">
                      {value === "all"
                        ? "Todas"
                        : ASSIGNMENT_PHASE_LABEL[value]}
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {counts[value]}
                      </span>
                    </TabsTrigger>
                  ),
                )}
              </TabsList>
            </Tabs>
            {assignments.length >= SEARCH_THRESHOLD && (
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar miembro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            )}
          </div>
        )}

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {assignments.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=""
                    className="h-16 w-16 object-contain"
                  />
                </EmptyMedia>
                <EmptyTitle>Nadie tiene esta planificación</EmptyTitle>
                <EmptyDescription>
                  Asigná miembros para que la vean en la app.
                </EmptyDescription>
              </EmptyHeader>
              {onAssign && (
                <Button size="sm" className="gap-1.5" onClick={onAssign}>
                  <UserPlus className="size-4" aria-hidden />
                  Asignar miembros
                </Button>
              )}
            </Empty>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {search
                ? "Ningún miembro coincide con la búsqueda."
                : "No hay asignaciones en este estado."}
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {visible.map((assignment) => {
                const user = assignment.user;
                const phase = getAssignmentPhase(assignment, now);
                const endingSoon = isEndingSoon(assignment, now);
                const progress =
                  phase === "current"
                    ? getAssignmentProgress(assignment, now)
                    : null;
                const range = formatAssignmentRange(assignment);

                return (
                  <li
                    key={assignment._id}
                    className="flex items-start gap-3 px-3 py-3 sm:items-center"
                  >
                    <Avatar className="size-9">
                      {user?.imageUrl && (
                        <AvatarImage
                          src={user.imageUrl}
                          alt={user.fullName || user.email || "Miembro"}
                        />
                      )}
                      <AvatarFallback className="text-xs">
                        {getUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user?.fullName || user?.email || "Sin nombre"}
                      </p>
                      {user?.fullName && user.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      )}
                      {/* Mobile: timing sits under the name instead of its own column. */}
                      <p
                        className={cn(
                          "mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden",
                          endingSoon && "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            endingSoon ? "bg-amber-500" : PHASE_DOT[phase],
                          )}
                          aria-hidden
                        />
                        <span className="truncate">
                          {describeAssignmentTiming(assignment, now)}
                        </span>
                      </p>
                      {range && (
                        <p className="truncate text-xs tabular-nums text-muted-foreground sm:hidden">
                          {range}
                        </p>
                      )}
                      {assignment.notes && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {assignment.notes}
                        </p>
                      )}
                    </div>

                    <div className="hidden w-44 shrink-0 flex-col gap-1 sm:flex">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-medium",
                          endingSoon && "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            endingSoon ? "bg-amber-500" : PHASE_DOT[phase],
                          )}
                          aria-hidden
                        />
                        <span className="truncate">
                          {describeAssignmentTiming(assignment, now)}
                        </span>
                      </span>
                      {progress !== null && (
                        <div
                          className="h-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label="Avance de la planificación"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              endingSoon ? "bg-amber-500" : "bg-emerald-500",
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                      {range && (
                        <span className="truncate text-xs tabular-nums text-muted-foreground">
                          {range}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant={
                          phase === "finished" || endingSoon
                            ? "outline"
                            : "ghost"
                        }
                        size="sm"
                        className="size-9 gap-1.5 p-0 sm:h-8 sm:w-auto sm:px-3"
                        onClick={() => handleOpenExtend(assignment)}
                      >
                        <CalendarClock className="size-4" aria-hidden />
                        <span className="hidden sm:inline">Extender</span>
                        <span className="sr-only sm:hidden">
                          Extender planificación
                        </span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 sm:size-8"
                            aria-label={`Más acciones para ${memberName(assignment)}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setUnassignTarget(assignment)}
                          >
                            <UserMinus className="mr-2 size-4" />
                            Desasignar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>

      <Dialog
        open={extendTarget !== null}
        onOpenChange={(next) => !next && closeExtend()}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Extender planificación</DialogTitle>
            <DialogDescription>
              {memberName(extendTarget)}
              {extendTarget?.endDate
                ? ` · hoy termina el ${format(extendTarget.endDate, "d 'de' MMMM", { locale: es })}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {EXTEND_PRESETS.map((preset) => {
                const value = format(preset.apply(extendBase), "yyyy-MM-dd");
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={extendEndDate === value}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs sm:h-7 sm:px-2.5",
                      extendEndDate === value &&
                        "border-foreground/40 bg-accent",
                    )}
                    onClick={() => setExtendEndDate(value)}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extend-end-date">Nueva fecha de fin</Label>
              <Input
                id="extend-end-date"
                type="date"
                value={extendEndDate}
                onChange={(e) => setExtendEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeExtend}
              disabled={extending}
            >
              Cancelar
            </Button>
            <Button onClick={handleExtend} disabled={extending}>
              {extending ? "Extendiendo..." : "Extender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={unassignTarget !== null}
        onOpenChange={(next) =>
          !next && !unassigning && setUnassignTarget(null)
        }
      >
        <AlertDialogContent className="w-[calc(100%-1.5rem)] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desasignar a {memberName(unassignTarget)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Va a dejar de ver {planificationName} en la app. Su historial de
              entrenamientos se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassigning}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={unassigning}
              onClick={(e) => {
                e.preventDefault();
                handleUnassign();
              }}
            >
              {unassigning ? "Desasignando..." : "Desasignar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
