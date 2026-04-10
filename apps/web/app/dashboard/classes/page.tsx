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
import FixedSlotsDialog from "@/components/features/classes/dialogs/fixed-slots-dialog";
import ModelWeekTimeline, {
  type ModelWeekSlotDoc,
} from "@/components/features/classes/calendar/model-week-timeline";
import ModelWeekSlotDialog from "@/components/features/classes/dialogs/model-week-slot-dialog";
import ApplyModelWeekDialog from "@/components/features/classes/dialogs/apply-model-week-dialog";
import WeeklyTimeline from "@/components/features/classes/calendar/weekly-timeline";
import ClassList from "@/components/features/classes/class-list";
import {
  Plus,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  Users,
  Layers3,
  MoreVertical,
  CheckSquare,
  X,
} from "lucide-react";
import { startOfWeek, endOfWeek, addDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { type Doc, type Id } from "@/convex/_generated/dataModel";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

export default function ClassesPage() {
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

  // Get schedules for the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const goToPreviousWeek = () => setCurrentDate((d) => addDays(d, -7));
  const goToNextWeek = () => setCurrentDate((d) => addDays(d, 7));
  const goToToday = () => setCurrentDate(new Date());

  const schedules = useQuery(
    api.classSchedules.getByOrganizationAndDateRange,
    canQueryOrgData
      ? {
          startDate: weekStart.getTime(),
          endDate: weekEnd.getTime(),
          classId:
            classFilter === "all" ? undefined : (classFilter as Id<"classes">),
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

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Clases y Turnos</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Gestiona las clases y los turnos de tu gimnasio
          </p>
        </div>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFixedSlotsOpen(true)}>
                <Users className="mr-2 h-4 w-4" aria-hidden />
                Turnos fijos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenGenerateTurnos()}>
                <CalendarPlus className="mr-2 h-4 w-4" aria-hidden />
                Crear turnos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewClass}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Nueva clase
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* View toggle and filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={selectedView}
          onValueChange={(v) =>
            setSelectedView(v as "calendar" | "list" | "model")
          }
        >
          <TabsList>
            <TabsTrigger
              value="calendar"
              className="gap-0 md:gap-2"
              aria-label="Vista calendario"
            >
              <Calendar className="h-4 w-4" />
              <span className="sr-only md:not-sr-only">Calendario</span>
            </TabsTrigger>
            <TabsTrigger
              value="model"
              className="gap-0 md:gap-2"
              aria-label="Vista semana modelo"
            >
              <Layers3 className="h-4 w-4" />
              <span className="sr-only md:not-sr-only">Semana Modelo</span>
            </TabsTrigger>
            <TabsTrigger
              value="list"
              className="gap-0 md:gap-2"
              aria-label="Vista clases"
            >
              <List className="h-4 w-4" />
              <span className="sr-only md:not-sr-only">Clases</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedView === "calendar" && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Filtrar por clase:
            </span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
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
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (selectionMode) {
                  handleExitSelectionMode();
                } else {
                  setSelectionMode(true);
                }
              }}
              className="gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Seleccionar</span>
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {selectedView === "calendar" ? (
        <div className="space-y-4 rounded-lg border p-3 md:p-4">
          {/* Week navigation – always visible so users can move between weeks even when empty */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
            <h2 className="text-base font-semibold md:text-lg">
              {format(weekStart, "d", { locale: es })} -{" "}
              {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            </h2>
          </div>

          {/* Selection mode toolbar */}
          {selectionMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
              <span className="text-sm font-medium">
                {selectedScheduleIds.size} seleccionados
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkAction("cancel")}
                  disabled={selectedScheduleIds.size === 0}
                >
                  Cancelar seleccionados
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkAction("remove")}
                  disabled={selectedScheduleIds.size === 0}
                >
                  Eliminar seleccionados
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExitSelectionMode}
                  className="gap-1"
                >
                  <X className="h-4 w-4" />
                  Salir
                </Button>
              </div>
            </div>
          )}

          {schedules === undefined ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Day headers */}
                  <div className="grid grid-cols-8 bg-muted">
                    <Skeleton className="h-14 rounded-none border-r border-b border-border" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-14 rounded-none border-r border-b border-border"
                      />
                    ))}
                  </div>
                  {/* Time rows */}
                  {Array.from({ length: 12 }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="grid grid-cols-8 border-b border-border last:border-b-0"
                    >
                      <Skeleton className="h-[60px] rounded-none border-r border-border" />
                      {Array.from({ length: 7 }).map((_, colIndex) => (
                        <Skeleton
                          key={colIndex}
                          className="h-[60px] rounded-none border-r border-border"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <WeeklyTimeline
              schedules={enrichedSchedules}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onScheduleClick={handleScheduleClick}
              showWeekNavigation={false}
              onEmptyCellClick={handleEmptyCellClick}
              onDayHeaderAction={handleDayHeaderAction}
              selectionMode={selectionMode}
              selectedScheduleIds={selectedScheduleIds}
              onSelectionChange={handleSelectionChange}
            />
          )}
        </div>
      ) : selectedView === "model" ? (
        <div className="space-y-4 rounded-lg border p-3 md:p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold md:text-lg">
              Semana Modelo
            </h2>
            <Button
              variant="outline"
              onClick={() => setApplyModelWeekOpen(true)}
              disabled={!modelWeekSlots || modelWeekSlots.length === 0}
            >
              Aplicar semana modelo
            </Button>
          </div>

          {modelWeekSlots === undefined ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Day headers */}
                  <div className="grid grid-cols-8 bg-muted">
                    <Skeleton className="h-14 rounded-none border-r border-b border-border" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-14 rounded-none border-r border-b border-border"
                      />
                    ))}
                  </div>
                  {/* Time rows */}
                  {Array.from({ length: 12 }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="grid grid-cols-8 border-b border-border last:border-b-0"
                    >
                      <Skeleton className="h-[60px] rounded-none border-r border-border" />
                      {Array.from({ length: 7 }).map((_, colIndex) => (
                        <Skeleton
                          key={colIndex}
                          className="h-[60px] rounded-none border-r border-border"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
        <div className="rounded-lg border p-3 md:p-4">
          {classes === undefined ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">Cargando clases...</p>
            </div>
          ) : classes.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=""
                    className="h-20 w-20 object-contain"
                  />
                </EmptyMedia>
                <EmptyTitle>No hay clases creadas</EmptyTitle>
                <EmptyDescription>
                  Crea tu primera clase para comenzar a gestionar horarios y
                  reservas.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleNewClass}>Crear primera clase</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ClassList
              classes={classes}
              onEditClass={handleEditClass}
              onOpenGenerateTurnos={handleOpenGenerateTurnos}
            />
          )}
        </div>
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
