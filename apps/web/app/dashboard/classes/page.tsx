"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import ClassFormDialog from "@/components/features/classes/dialogs/class-form-dialog";
import GenerateSchedulesDialog from "@/components/features/classes/dialogs/generate-schedules-dialog";
import ScheduleDetailDialog from "@/components/features/classes/dialogs/schedule-detail-dialog";
import QuickCreateScheduleDialog from "@/components/features/classes/dialogs/quick-create-schedule-dialog";
import BulkCancelDayDialog from "@/components/features/classes/dialogs/bulk-cancel-day-dialog";
import BulkActionConfirmationDialog from "@/components/features/classes/dialogs/bulk-action-confirmation-dialog";
import ShowAvailableSlotsDialog from "@/components/features/classes/dialogs/show-available-slots-dialog";
import FixedSlotsDialog from "@/components/features/classes/dialogs/fixed-slots-dialog";
import ModelWeekTimeline, {
  type ModelWeekSlotDoc,
} from "@/components/features/classes/calendar/model-week-timeline";
import ModelWeekSlotDialog from "@/components/features/classes/dialogs/model-week-slot-dialog";
import ApplyModelWeekDialog from "@/components/features/classes/dialogs/apply-model-week-dialog";
import WeeklyTimeline, {
  WeekNavigation,
} from "@/components/features/classes/calendar/weekly-timeline";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";
import { cn } from "@/lib/utils";
import ClassList from "@/components/features/classes/class-list";
import {
  Plus,
  Calendar,
  List,
  CalendarPlus,
  Users,
  Layers3,
  MoreHorizontal,
  CheckSquare,
  X,
  Send,
} from "lucide-react";
import { startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { type Doc, type Id } from "@/convex/_generated/dataModel";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { FeatureDisabledPage } from "@/components/shared/feature-disabled-page";

function WeekStat({
  label,
  value,
  detail,
  dotClassName,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  dotClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dotClassName ? (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", dotClassName)}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {detail ? (
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function TimelineSkeleton() {
  return <Skeleton className="h-[520px] rounded-xl" />;
}

export default function ClassesPage() {
  const orgSettings = useOrgSettings();
  const canQueryOrgData = useCanQueryCurrentOrganization();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState<
    "calendar" | "list" | "model"
  >("calendar");
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<
    Id<"classes"> | undefined
  >();
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    Id<"classSchedules"> | undefined
  >();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [generateTurnosOpen, setGenerateTurnosOpen] = useState(false);
  const [generateTurnosInitial, setGenerateTurnosInitial] = useState<{
    id: Id<"classes">;
    name: string;
  } | null>(null);
  const [fixedSlotsOpen, setFixedSlotsOpen] = useState(false);
  const [showAvailableSlotsOpen, setShowAvailableSlotsOpen] = useState(false);
  const [applyModelWeekOpen, setApplyModelWeekOpen] = useState(false);
  const [modelSlotDialogOpen, setModelSlotDialogOpen] = useState(false);
  const [selectedModelSlotId, setSelectedModelSlotId] = useState<
    Id<"modelWeekSlots"> | undefined
  >();
  const [initialSlotDay, setInitialSlotDay] = useState<number | undefined>();
  const [initialSlotMinutes, setInitialSlotMinutes] = useState<
    number | undefined
  >();

  // Quick create schedule (click-on-empty-cell)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState<Date>(new Date());
  const [quickCreateHour, setQuickCreateHour] = useState(9);

  // Bulk cancel day
  const [bulkCancelDayOpen, setBulkCancelDayOpen] = useState(false);
  const [bulkCancelDayDate, setBulkCancelDayDate] = useState<Date>(new Date());

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkAction, setBulkAction] = useState<"cancel" | "remove" | null>(
    null,
  );

  const classes = useQuery(
    api.classes.getByOrganization,
    canQueryOrgData ? { activeOnly: false } : "skip",
  );

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryOrgData ? {} : "skip",
  );

  const staffNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberships ?? []) {
      map.set(
        m.userId,
        m.fullName ||
          [m.firstName, m.lastName].filter(Boolean).join(" ") ||
          m.email ||
          m.userId,
      );
    }
    return map;
  }, [memberships]);

  // Get schedules for the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const schedules = useQuery(
    api.classSchedules.getByOrganizationAndDateRange,
    canQueryOrgData
      ? {
          startDate: weekStart.getTime(),
          endDate: weekEnd.getTime(),
          classId:
            classFilter === "all" ? undefined : (classFilter as Id<"classes">),
          includeReservationBreakdown: true,
        }
      : "skip",
  );

  const modelWeekSlots = useQuery(
    api.modelWeekSlots.listByOrganization,
    selectedView === "model" && canQueryOrgData ? {} : "skip",
  );

  const fixedSlotsForModel = useQuery(
    api.fixedClassSlots.listByOrganizationAndClass,
    selectedView === "model" && canQueryOrgData ? {} : "skip",
  );

  // Enrich schedules with class data
  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return [];

    return schedules.map((schedule: Doc<"classSchedules">) => ({
      ...schedule,
      class: classes.find((c: Doc<"classes">) => c._id === schedule.classId),
    }));
  }, [schedules, classes]);

  const handleNewClass = () => {
    setEditingClassId(undefined);
    setClassFormOpen(true);
  };

  const handleEditClass = (classId: Id<"classes">) => {
    setEditingClassId(classId);
    setClassFormOpen(true);
  };

  const handleScheduleClick = (scheduleId: Id<"classSchedules">) => {
    setSelectedScheduleId(scheduleId);
    setScheduleDetailOpen(true);
  };

  const handleClassFormClose = () => {
    setClassFormOpen(false);
    setEditingClassId(undefined);
  };

  const handleScheduleDetailClose = () => {
    setScheduleDetailOpen(false);
    setSelectedScheduleId(undefined);
  };

  const handleOpenGenerateTurnos = (classItem?: {
    _id: Id<"classes">;
    name: string;
  }) => {
    setGenerateTurnosInitial(
      classItem ? { id: classItem._id, name: classItem.name } : null,
    );
    setGenerateTurnosOpen(true);
  };

  // Click-to-create on empty calendar cell
  const handleEmptyCellClick = (dayDate: Date, hour: number) => {
    setQuickCreateDate(dayDate);
    setQuickCreateHour(hour);
    setQuickCreateOpen(true);
  };

  // Day header action → bulk cancel/delete day
  const handleDayHeaderAction = (dayDate: Date) => {
    setBulkCancelDayDate(dayDate);
    setBulkCancelDayOpen(true);
  };

  // Selection mode helpers
  const handleSelectionChange = (
    scheduleId: Id<"classSchedules">,
    selected: boolean,
  ) => {
    setSelectedScheduleIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(scheduleId);
      } else {
        next.delete(scheduleId);
      }
      return next;
    });
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedScheduleIds(new Set());
  };

  const handleBulkActionSuccess = () => {
    handleExitSelectionMode();
  };

  // Get schedules for the selected day (for bulk-cancel-day dialog)
  const bulkCancelDaySchedules = useMemo(() => {
    if (!bulkCancelDayOpen) return [];
    return enrichedSchedules.filter((s) =>
      isSameDay(new Date(s.startTime), bulkCancelDayDate),
    );
  }, [enrichedSchedules, bulkCancelDayDate, bulkCancelDayOpen]);

  const weekStats = useMemo(() => {
    const active = enrichedSchedules.filter((s) => s.status !== "cancelled");
    const reserved = active.reduce((acc, s) => acc + s.currentReservations, 0);
    const capacity = active.reduce(
      (acc, s) => acc + Math.max(s.capacity, 0),
      0,
    );
    return {
      total: active.length,
      reserved,
      occupancyPct: capacity > 0 ? Math.round((reserved / capacity) * 100) : 0,
      full: active.filter(
        (s) => s.capacity <= 0 || s.currentReservations >= s.capacity,
      ).length,
      cancelled: enrichedSchedules.length - active.length,
    };
  }, [enrichedSchedules]);

  if (orgSettings && !orgSettings.classesEnabled) {
    return <FeatureDisabledPage featureName="Clases" />;
  }

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:space-y-6 md:py-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Clases</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Turnos, reservas y la semana modelo de tu gimnasio.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ResponsiveActionButton
            variant="outline"
            onClick={handleNewClass}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            label="Nueva clase"
            tooltip="Nueva clase"
          />
          <ResponsiveActionButton
            onClick={() => handleOpenGenerateTurnos()}
            icon={<CalendarPlus className="h-4 w-4" aria-hidden />}
            label="Crear turnos"
            tooltip="Crear turnos"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Más acciones">
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFixedSlotsOpen(true)}>
                <Users className="mr-2 h-4 w-4" aria-hidden />
                Turnos fijos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowAvailableSlotsOpen(true)}>
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Compartir turnos disponibles
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* View toggle and filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={selectedView}
          onValueChange={(v) =>
            setSelectedView(v as "calendar" | "list" | "model")
          }
        >
          <TabsList className="w-full md:w-auto">
            <TabsTrigger
              value="calendar"
              className="flex-1 gap-1.5 md:flex-none"
            >
              <Calendar className="h-4 w-4" aria-hidden />
              Turnos
            </TabsTrigger>
            <TabsTrigger value="model" className="flex-1 gap-1.5 md:flex-none">
              <Layers3 className="h-4 w-4" aria-hidden />
              <span className="sm:hidden">Modelo</span>
              <span className="hidden sm:inline">Semana modelo</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="flex-1 gap-1.5 md:flex-none">
              <List className="h-4 w-4" aria-hidden />
              Clases
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedView === "calendar" && (
          <div className="flex items-center gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger
                className="h-9 min-w-0 flex-1 md:w-[200px] md:flex-none"
                aria-label="Filtrar por clase"
              >
                <SelectValue placeholder="Todas las clases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las clases</SelectItem>
                {classes?.map((classItem: Doc<"classes">) => (
                  <SelectItem key={classItem._id} value={classItem._id}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={selectionMode ? "secondary" : "outline"}
              className="h-9 shrink-0 gap-1.5"
              onClick={() =>
                selectionMode
                  ? handleExitSelectionMode()
                  : setSelectionMode(true)
              }
              aria-pressed={selectionMode}
            >
              <CheckSquare className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Seleccionar</span>
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {selectedView === "calendar" ? (
        <div className="space-y-3">
          <WeekNavigation
            currentDate={currentDate}
            onDateChange={setCurrentDate}
          />

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <WeekStat
              label="Turnos"
              value={schedules === undefined ? "…" : weekStats.total}
              detail={
                weekStats.cancelled > 0
                  ? `${weekStats.cancelled} cancelado${weekStats.cancelled === 1 ? "" : "s"}`
                  : undefined
              }
            />
            <WeekStat
              label="Reservas"
              value={schedules === undefined ? "…" : weekStats.reserved}
            />
            <WeekStat
              label="Ocupación"
              value={
                schedules === undefined ? "…" : `${weekStats.occupancyPct}%`
              }
              dotClassName={
                weekStats.occupancyPct >= 100
                  ? "bg-red-500"
                  : weekStats.occupancyPct > 60
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }
            />
            <WeekStat
              label="Completos"
              value={schedules === undefined ? "…" : weekStats.full}
              dotClassName="bg-red-500"
            />
          </div>

          {schedules === undefined ? (
            <TimelineSkeleton />
          ) : (
            <WeeklyTimeline
              schedules={enrichedSchedules}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onScheduleClick={handleScheduleClick}
              staffNameById={staffNameById}
              showWeekNavigation={false}
              onEmptyCellClick={handleEmptyCellClick}
              onDayHeaderAction={handleDayHeaderAction}
              selectionMode={selectionMode}
              selectedScheduleIds={selectedScheduleIds}
              onSelectionChange={handleSelectionChange}
            />
          )}

          {/* Floating bar so bulk actions stay reachable while scrolling the grid. */}
          {selectionMode && (
            <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-xl items-center gap-2 rounded-xl border bg-background/95 p-2 pl-4 shadow-lg backdrop-blur sm:inset-x-0">
              <span className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">
                {selectedScheduleIds.size === 0
                  ? "Tocá los turnos a seleccionar"
                  : `${selectedScheduleIds.size} seleccionado${selectedScheduleIds.size === 1 ? "" : "s"}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkAction("cancel")}
                disabled={selectedScheduleIds.size === 0}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkAction("remove")}
                disabled={selectedScheduleIds.size === 0}
              >
                Eliminar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={handleExitSelectionMode}
                aria-label="Salir de la selección"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ) : selectedView === "model" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              La plantilla de horarios que se copia a cada semana.
            </p>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setApplyModelWeekOpen(true)}
              disabled={!modelWeekSlots || modelWeekSlots.length === 0}
            >
              Aplicar semana
            </Button>
          </div>

          {modelWeekSlots === undefined ? (
            <TimelineSkeleton />
          ) : (
            <ModelWeekTimeline
              modelSlots={(modelWeekSlots ?? []) as ModelWeekSlotDoc[]}
              fixedSlots={fixedSlotsForModel ?? []}
              onSlotClick={(slotId) => {
                setSelectedModelSlotId(slotId);
                setInitialSlotDay(undefined);
                setInitialSlotMinutes(undefined);
                setModelSlotDialogOpen(true);
              }}
              onEmptyCellClick={(dayOfWeek, startTimeMinutes) => {
                setSelectedModelSlotId(undefined);
                setInitialSlotDay(dayOfWeek);
                setInitialSlotMinutes(startTimeMinutes);
                setModelSlotDialogOpen(true);
              }}
            />
          )}
        </div>
      ) : selectedView === "list" ? (
        classes === undefined ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : classes.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia>
                <Image
                  src={matWolfLooking}
                  alt=""
                  className="h-16 w-16 object-contain"
                />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay clases</EmptyTitle>
              <EmptyDescription>
                Creá una clase para empezar a armar turnos y recibir reservas.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className="gap-1.5" onClick={handleNewClass}>
                <Plus className="h-4 w-4" aria-hidden />
                Nueva clase
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ClassList
            classes={classes}
            onEditClass={handleEditClass}
            onOpenGenerateTurnos={handleOpenGenerateTurnos}
          />
        )
      ) : null}

      {/* Dialogs */}
      <ClassFormDialog
        open={classFormOpen}
        onOpenChange={handleClassFormClose}
        classId={editingClassId}
        onSuccess={() => {
          // Optionally refetch data or show success message
        }}
      />

      {selectedScheduleId && (
        <ScheduleDetailDialog
          open={scheduleDetailOpen}
          onOpenChange={handleScheduleDetailClose}
          scheduleId={selectedScheduleId}
        />
      )}

      <GenerateSchedulesDialog
        open={generateTurnosOpen}
        onOpenChange={setGenerateTurnosOpen}
        initialClassId={generateTurnosInitial?.id}
        initialClassTitle={generateTurnosInitial?.name}
        onSuccess={() => setGenerateTurnosInitial(null)}
      />

      <FixedSlotsDialog
        open={fixedSlotsOpen}
        onOpenChange={setFixedSlotsOpen}
      />

      <ShowAvailableSlotsDialog
        open={showAvailableSlotsOpen}
        onOpenChange={setShowAvailableSlotsOpen}
      />

      <ApplyModelWeekDialog
        open={applyModelWeekOpen}
        onOpenChange={setApplyModelWeekOpen}
      />

      <ModelWeekSlotDialog
        open={modelSlotDialogOpen}
        onOpenChange={(open) => {
          setModelSlotDialogOpen(open);
          if (!open) {
            setSelectedModelSlotId(undefined);
            setInitialSlotDay(undefined);
            setInitialSlotMinutes(undefined);
          }
        }}
        slot={
          modelWeekSlots?.find((s) => s._id === selectedModelSlotId) as
            | ModelWeekSlotDoc
            | undefined
        }
        initialDayOfWeek={initialSlotDay}
        initialStartTimeMinutes={initialSlotMinutes}
        classes={classes ?? []}
      />

      <QuickCreateScheduleDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialDate={quickCreateDate}
        initialHour={quickCreateHour}
        classes={classes ?? []}
      />

      <BulkCancelDayDialog
        open={bulkCancelDayOpen}
        onOpenChange={setBulkCancelDayOpen}
        dayDate={bulkCancelDayDate}
        schedules={bulkCancelDaySchedules}
      />

      {bulkAction !== null && (
        <BulkActionConfirmationDialog
          open={bulkAction !== null}
          onOpenChange={(open) => {
            if (!open) setBulkAction(null);
          }}
          action={bulkAction}
          scheduleIds={
            Array.from(selectedScheduleIds) as Id<"classSchedules">[]
          }
          schedules={enrichedSchedules}
          onSuccess={handleBulkActionSuccess}
        />
      )}
    </DashboardPageContainer>
  );
}
