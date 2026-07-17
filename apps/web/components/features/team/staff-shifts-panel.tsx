"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  addDays,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import StaffShiftCalendar, {
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

  const isLoading = view === "dated" ? shifts === undefined : modelSlots === undefined;

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
    <div className="space-y-4 rounded-lg border p-3 md:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as "dated" | "model")}
        >
          <TabsList>
            <TabsTrigger value="dated">Semana</TabsTrigger>
            <TabsTrigger value="model" className="gap-2">
              <Layers3 className="h-4 w-4" />
              Semana Modelo
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "dated" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate((d) => addDays(d, -7))}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
              Hoy
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate((d) => addDays(d, 7))}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 hidden text-sm font-medium sm:inline">
              {format(weekStart, "d", { locale: es })} -{" "}
              {format(addDays(weekStart, 6), "d 'de' MMMM", { locale: es })}
            </span>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setApplyOpen(true)}
            disabled={!modelSlots || modelSlots.length === 0}
          >
            Aplicar semana modelo
          </Button>
        )}
      </div>

      {staff.length === 0 ? (
        <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
          Agregá empleados al equipo para asignarles turnos.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-[400px] w-full rounded-lg" />
      ) : (
        <StaffShiftCalendar
          mode={view}
          weekDays={view === "dated" ? weekDays : undefined}
          shifts={view === "dated" ? normalizedDated : normalizedModel}
          staff={staff}
          onEmptyCellClick={handleEmptyCellClick}
          onShiftClick={handleShiftClick}
        />
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
