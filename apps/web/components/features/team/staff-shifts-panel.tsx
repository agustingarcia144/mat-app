"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { addDays, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Layers3, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import StaffShiftCalendar, {
  STAFF_PALETTE,
  type NormalizedShift,
} from "./staff-shift-calendar";
import StaffShiftDialog, {
  type EditingShift,
  type ShiftDialogInitial,
} from "./staff-shift-dialog";
import ApplyShiftModelWeekDialog from "./apply-shift-model-week-dialog";
import type { StaffOption } from "./staff-select";

type Props = {
  staff: StaffOption[];
};

// date-fns getDay: 0=Sun … 6=Sat. Convert to Monday-first index (0=Mon … 6=Sun).
function toMondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}
// Convert a Monday-first index back to the 0=Sun … 6=Sat convention used in the DB.
function toDbDayOfWeek(mondayIndex: number) {
  return (mondayIndex + 1) % 7;
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return `${hours.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

export default function StaffShiftsPanel({ staff }: Props) {
  const canQueryOrgData = useCanQueryCurrentOrganization();
  const [view, setView] = useState<"dated" | "model">("dated");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<ShiftDialogInitial>();
  const [editing, setEditing] = useState<EditingShift | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const shifts = useQuery(
    api.staffShifts.getByOrganizationAndDateRange,
    view === "dated" && canQueryOrgData
      ? { startDate: weekStart.getTime(), endDate: weekEnd.getTime() }
      : "skip",
  );

  const modelSlots = useQuery(
    api.staffShiftModelSlots.listByOrganization,
    view === "model" && canQueryOrgData ? {} : "skip",
  );

  const normalizedDated = useMemo<NormalizedShift[]>(() => {
    if (!shifts) return [];
    return shifts.map((shift) => {
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      return {
        id: shift._id,
        userId: shift.userId,
        dayIndex: toMondayIndex(start.getDay()),
        startMinutes: start.getHours() * 60 + start.getMinutes(),
        endMinutes: end.getHours() * 60 + end.getMinutes(),
      };
    });
  }, [shifts]);

  const normalizedModel = useMemo<NormalizedShift[]>(() => {
    if (!modelSlots) return [];
    return modelSlots.map((slot) => ({
      id: slot._id,
      userId: slot.userId,
      dayIndex: toMondayIndex(slot.dayOfWeek),
      startMinutes: slot.startTimeMinutes,
      endMinutes: slot.endTimeMinutes,
    }));
  }, [modelSlots]);

  const isLoading =
    view === "dated" ? shifts === undefined : modelSlots === undefined;
  const visibleShifts = view === "dated" ? normalizedDated : normalizedModel;
  const isCurrentWeek = isSameDay(
    weekStart,
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  // Scheduled minutes per employee for the week on screen, for the legend.
  const minutesByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const shift of visibleShifts) {
      map.set(
        shift.userId,
        (map.get(shift.userId) ?? 0) +
          Math.max(shift.endMinutes - shift.startMinutes, 0),
      );
    }
    return map;
  }, [visibleShifts]);

  const handleNewShift = () => {
    setEditing(null);
    setDialogInitial(
      view === "dated"
        ? {
            date: format(isCurrentWeek ? new Date() : weekStart, "yyyy-MM-dd"),
          }
        : undefined,
    );
    setDialogOpen(true);
  };

  const handleEmptyCellClick = (dayIndex: number, hour: number) => {
    setEditing(null);
    if (view === "dated") {
      setDialogInitial({
        date: format(weekDays[dayIndex], "yyyy-MM-dd"),
        startTime: `${String(hour).padStart(2, "0")}:00`,
        endTime: `${String(hour + 1).padStart(2, "0")}:00`,
      });
    } else {
      setDialogInitial({
        dayOfWeek: toDbDayOfWeek(dayIndex),
        startTime: `${String(hour).padStart(2, "0")}:00`,
        endTime: `${String(hour + 1).padStart(2, "0")}:00`,
      });
    }
    setDialogOpen(true);
  };

  const handleShiftClick = (shiftId: string) => {
    if (view === "dated") {
      const shift = shifts?.find((s) => s._id === shiftId);
      if (!shift) return;
      const start = new Date(shift.startTime);
      const end = new Date(shift.endTime);
      setEditing({ kind: "dated", id: shift._id });
      setDialogInitial({
        userId: shift.userId,
        date: format(start, "yyyy-MM-dd"),
        startTime: format(start, "HH:mm"),
        endTime: format(end, "HH:mm"),
      });
    } else {
      const slot = modelSlots?.find((s) => s._id === shiftId);
      if (!slot) return;
      setEditing({ kind: "model", id: slot._id });
      setDialogInitial({
        userId: slot.userId,
        dayOfWeek: slot.dayOfWeek,
        startTime: minutesToTime(slot.startTimeMinutes),
        endTime: minutesToTime(slot.endTimeMinutes),
      });
    }
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "dated" | "model")}
          >
            <TabsList>
              <TabsTrigger value="dated">Semana</TabsTrigger>
              <TabsTrigger value="model" className="gap-1.5">
                <Layers3 className="size-3.5" />
                Semana modelo
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {view === "dated" ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setCurrentDate((d) => addDays(d, -7))}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3"
                onClick={() => setCurrentDate(new Date())}
                disabled={isCurrentWeek}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setCurrentDate((d) => addDays(d, 7))}
                aria-label="Semana siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
              <span className="ml-2 whitespace-nowrap text-sm font-medium tabular-nums">
                {format(weekStart, "d", { locale: es })} –{" "}
                {format(addDays(weekStart, 6), "d 'de' MMMM", { locale: es })}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              La semana tipo que se copia a las semanas reales.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {view === "model" && (
            <Button
              variant="outline"
              onClick={() => setApplyOpen(true)}
              disabled={!modelSlots || modelSlots.length === 0}
            >
              Aplicar semana modelo
            </Button>
          )}
          <Button
            className="gap-1.5"
            onClick={handleNewShift}
            disabled={staff.length === 0}
          >
            <Plus className="size-4" />
            Nuevo turno
          </Button>
        </div>
      </div>

      {staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3">
          {staff.map((member, index) => {
            const minutes = minutesByUser.get(member.userId) ?? 0;
            return (
              <span
                key={member.userId}
                className={cn(
                  "inline-flex items-center gap-2 text-sm",
                  minutes === 0 && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    STAFF_PALETTE[index % STAFF_PALETTE.length].dot,
                    minutes === 0 && "opacity-40",
                  )}
                  aria-hidden
                />
                {member.fullName || member.email || "Empleado"}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {minutes > 0 ? formatHours(minutes) : "sin turnos"}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {staff.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Agregá personas al equipo para asignarles turnos.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-[480px] w-full rounded-xl" />
      ) : (
        <div className="space-y-2">
          <StaffShiftCalendar
            mode={view}
            weekDays={view === "dated" ? weekDays : undefined}
            shifts={visibleShifts}
            staff={staff}
            onEmptyCellClick={handleEmptyCellClick}
            onShiftClick={handleShiftClick}
          />
          <p className="text-xs text-muted-foreground">
            {visibleShifts.length === 0
              ? "No hay turnos esta semana. Tocá un horario del calendario para asignar el primero."
              : "Tocá un horario libre para asignar un turno, o un turno para editarlo."}
          </p>
        </div>
      )}

      <StaffShiftDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setDialogInitial(undefined);
          }
        }}
        mode={view}
        staff={staff}
        initial={dialogInitial}
        editing={editing}
      />

      <ApplyShiftModelWeekDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
