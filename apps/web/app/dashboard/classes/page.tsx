'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import ClassFormDialog from '@/components/features/classes/dialogs/class-form-dialog'
import GenerateSchedulesDialog from '@/components/features/classes/dialogs/generate-schedules-dialog'
import ScheduleDetailDialog from '@/components/features/classes/dialogs/schedule-detail-dialog'
import FixedSlotsDialog from '@/components/features/classes/dialogs/fixed-slots-dialog'
import FixedSlotScheduleDetailDialog from '@/components/features/classes/dialogs/fixed-slot-schedule-detail-dialog'
import CopyModelWeekDialog, {
  type ModelScheduleTemplate,
} from '@/components/features/classes/dialogs/copy-model-week-dialog'
import ModelWeeklyTimeline from '@/components/features/classes/calendar/fixed-slots-weekly-timeline'
import WeeklyTimeline from '@/components/features/classes/calendar/weekly-timeline'
import ClassList from '@/components/features/classes/class-list'
import BatchList from '@/components/features/classes/batch-list'
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
} from 'lucide-react'
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { type Doc, type Id } from '@/convex/_generated/dataModel'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

export default function ClassesPage() {
  const canQueryOrgData = useCanQueryCurrentOrganization()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedView, setSelectedView] = useState<
    'calendar' | 'list' | 'batches'
  >('calendar')
  const [calendarTab, setCalendarTab] = useState<'actual' | 'model'>('actual')
  const [classFormOpen, setClassFormOpen] = useState(false)
  const [editingClassId, setEditingClassId] = useState<
    Id<'classes'> | undefined
  >()
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    Id<'classSchedules'> | undefined
  >()
  const [classFilter, setClassFilter] = useState<string>('all')
  const [generateTurnosOpen, setGenerateTurnosOpen] = useState(false)
  const [generateTurnosInitial, setGenerateTurnosInitial] = useState<{
    id: Id<'classes'>
    name: string
  } | null>(null)
  const [fixedSlotsOpen, setFixedSlotsOpen] = useState(false)
  const [modelFixedSlotDialogOpen, setModelFixedSlotDialogOpen] =
    useState(false)
  const [selectedModelFixedSlot, setSelectedModelFixedSlot] = useState<{
    classId: Id<'classes'>
    dayOfWeek: number
    startTimeMinutes: number
  } | null>(null)
  const showModelCalendar =
    selectedView === 'calendar' && calendarTab === 'model'
  const [copyModelWeekOpen, setCopyModelWeekOpen] = useState(false)

  const classes = useQuery(
    api.classes.getByOrganization,
    canQueryOrgData ? { activeOnly: false } : 'skip'
  )

  // Get schedules for the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })

  const goToPreviousWeek = () => setCurrentDate((d) => addDays(d, -7))
  const goToNextWeek = () => setCurrentDate((d) => addDays(d, 7))
  const goToToday = () => setCurrentDate(new Date())

  const schedules = useQuery(
    api.classSchedules.getByOrganizationAndDateRange,
    canQueryOrgData
      ? {
          startDate: weekStart.getTime(),
          endDate: weekEnd.getTime(),
          classId:
            classFilter === 'all' ? undefined : (classFilter as Id<'classes'>),
        }
      : 'skip'
  )

  const modelFixedSlots = useQuery(
    api.fixedClassSlots.listByOrganizationAndClass,
    showModelCalendar && canQueryOrgData
      ? {
          classId:
            classFilter === 'all' ? undefined : (classFilter as Id<'classes'>),
        }
      : 'skip'
  )

  // Enrich schedules with class data
  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return []

    return schedules.map((schedule: Doc<'classSchedules'>) => ({
      ...schedule,
      class: classes.find((c: Doc<'classes'>) => c._id === schedule.classId),
    }))
  }, [schedules, classes])

  const handleNewClass = () => {
    setEditingClassId(undefined)
    setClassFormOpen(true)
  }

  const handleEditClass = (classId: Id<'classes'>) => {
    setEditingClassId(classId)
    setClassFormOpen(true)
  }

  const handleScheduleClick = (scheduleId: Id<'classSchedules'>) => {
    setSelectedScheduleId(scheduleId)
    setScheduleDetailOpen(true)
  }

  const handleClassFormClose = () => {
    setClassFormOpen(false)
    setEditingClassId(undefined)
  }

  const handleScheduleDetailClose = () => {
    setScheduleDetailOpen(false)
    setSelectedScheduleId(undefined)
  }

  const handleModelFixedSlotClick = (slot: {
    classId: Id<'classes'>
    dayOfWeek: number
    startTimeMinutes: number
  }) => {
    setSelectedModelFixedSlot(slot)
    setModelFixedSlotDialogOpen(true)
  }

  const handleModelFixedSlotDialogClose = () => {
    setModelFixedSlotDialogOpen(false)
    setSelectedModelFixedSlot(null)
  }

  const selectedFixedSlotsForModelDialog = useMemo(() => {
    if (!selectedModelFixedSlot) return undefined
    if (!modelFixedSlots) return undefined
    return modelFixedSlots.filter(
      (s) =>
        s.classId === selectedModelFixedSlot.classId &&
        s.dayOfWeek === selectedModelFixedSlot.dayOfWeek &&
        s.startTimeMinutes === selectedModelFixedSlot.startTimeMinutes
    )
  }, [modelFixedSlots, selectedModelFixedSlot])

  const slotInfoFallbackForModelDialog = useMemo(() => {
    if (!selectedModelFixedSlot) return undefined
    const classItem = classes?.find(
      (c: Doc<'classes'>) => c._id === selectedModelFixedSlot.classId
    )
    return {
      className: classItem?.name ?? null,
      dayOfWeek: selectedModelFixedSlot.dayOfWeek,
      startTimeMinutes: selectedModelFixedSlot.startTimeMinutes,
    }
  }, [classes, selectedModelFixedSlot])

  const HOURS_IN_VIEW = useMemo(
    () => Array.from({ length: 17 }, (_, i) => i + 6),
    []
  )
  const DEFAULT_FIXED_SLOT_DURATION_MINUTES = 60

  const modelTemplatesForCopy = useMemo((): ModelScheduleTemplate[] | null => {
    if (
      classes === undefined ||
      schedules === undefined ||
      modelFixedSlots === undefined
    ) {
      return null
    }

    const hoursSet = new Set(HOURS_IN_VIEW)
    const templates: ModelScheduleTemplate[] = []
    const scheduleKeySet = new Set<string>()

    // 1) Schedules visible in the current week (even if they don't have fixed slots).
    for (const sched of enrichedSchedules) {
      const start = new Date(sched.startTime)
      const blockHour = start.getHours()
      if (!hoursSet.has(blockHour)) continue

      const dayOfWeek = start.getDay() // 0-6, Sunday=0
      const startTimeMinutes = start.getHours() * 60 + start.getMinutes()
      const key = `${sched.classId}-${dayOfWeek}-${startTimeMinutes}`

      scheduleKeySet.add(key)
      templates.push({
        classId: sched.classId,
        startTime: sched.startTime,
        endTime: sched.endTime,
        capacity: sched.capacity,
        notes: sched.notes,
      })
    }

    // 2) Fixed-slot-only blocks (no schedule occurrence in the week).
    const fixedSlotOnlyKeySet = new Set<string>()
    for (const slot of modelFixedSlots) {
      const slotHour = Math.floor(slot.startTimeMinutes / 60)
      if (!hoursSet.has(slotHour)) continue

      const key = `${slot.classId}-${slot.dayOfWeek}-${slot.startTimeMinutes}`
      if (scheduleKeySet.has(key)) continue
      if (fixedSlotOnlyKeySet.has(key)) continue
      fixedSlotOnlyKeySet.add(key)

      const classTemplate = classes.find(
        (c: Doc<'classes'>) => c._id === slot.classId
      )
      if (!classTemplate) continue

      const dayOffset = (slot.dayOfWeek + 6) % 7 // Week starts on Monday.
      const dayDate = addDays(weekStart, dayOffset)
      const start = new Date(dayDate)
      const minutes = slot.startTimeMinutes % 60
      start.setHours(slotHour, minutes, 0, 0)

      const startTime = start.getTime()
      templates.push({
        classId: slot.classId,
        startTime,
        endTime: startTime + DEFAULT_FIXED_SLOT_DURATION_MINUTES * 60 * 1000,
        capacity: classTemplate.capacity,
      })
    }

    templates.sort((a, b) => a.startTime - b.startTime)
    return templates
  }, [
    HOURS_IN_VIEW,
    classes,
    schedules,
    modelFixedSlots,
    enrichedSchedules,
    weekStart,
  ])

  const handleOpenGenerateTurnos = (classItem?: {
    _id: Id<'classes'>
    name: string
  }) => {
    setGenerateTurnosInitial(
      classItem ? { id: classItem._id, name: classItem.name } : null
    )
    setGenerateTurnosOpen(true)
  }

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
              <DropdownMenuItem onClick={() => setSelectedView('batches')}>
                <Layers3 className="mr-2 h-4 w-4" aria-hidden />
                Lotes de turnos
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
            setSelectedView(v as 'calendar' | 'list' | 'batches')
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
              value="list"
              className="gap-0 md:gap-2"
              aria-label="Vista clases"
            >
              <List className="h-4 w-4" />
              <span className="sr-only md:not-sr-only">Clases</span>
            </TabsTrigger>
            <TabsTrigger
              value="batches"
              className="gap-0 md:gap-2"
              aria-label="Vista lotes"
            >
              <Layers3 className="h-4 w-4" />
              <span className="sr-only md:not-sr-only">Lotes</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedView === 'calendar' && (
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
                {classes?.map((classItem: Doc<'classes'>) => (
                  <SelectItem key={classItem._id} value={classItem._id}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Content */}
      {selectedView === 'calendar' ? (
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
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <Tabs
                value={calendarTab}
                onValueChange={(v) => setCalendarTab(v as 'actual' | 'model')}
              >
                <TabsList>
                  <TabsTrigger value="actual">Calendario Real</TabsTrigger>
                  <TabsTrigger value="model">Calendario Modelo</TabsTrigger>
                </TabsList>
              </Tabs>
              {calendarTab === 'model' && (
                <Button
                  variant="outline"
                  onClick={() => setCopyModelWeekOpen(true)}
                  disabled={
                    modelTemplatesForCopy == null ||
                    modelTemplatesForCopy.length === 0
                  }
                >
                  Copiar semana (modelo)
                </Button>
              )}
              <h2 className="text-base font-semibold md:text-lg">
                {format(weekStart, 'd', { locale: es })} -{' '}
                {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                  locale: es,
                })}
              </h2>
            </div>
          </div>

          {(calendarTab === 'actual' && schedules === undefined) ||
          (calendarTab === 'model' && modelFixedSlots === undefined) ? (
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
          ) : calendarTab === 'actual' ? (
            <WeeklyTimeline
              schedules={enrichedSchedules}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onScheduleClick={handleScheduleClick}
              showWeekNavigation={false}
            />
          ) : (
            <ModelWeeklyTimeline
              fixedSlots={modelFixedSlots ?? []}
              currentDate={currentDate}
              schedules={enrichedSchedules}
              onDateChange={setCurrentDate}
              onFixedSlotClick={handleModelFixedSlotClick}
              showWeekNavigation={false}
            />
          )}
        </div>
      ) : selectedView === 'list' ? (
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
      ) : (
        <div className="rounded-lg border p-3 md:p-4">
          <BatchList />
        </div>
      )}

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

      <CopyModelWeekDialog
        open={copyModelWeekOpen}
        onOpenChange={setCopyModelWeekOpen}
        sourceWeekStartDate={weekStart.getTime()}
        templates={modelTemplatesForCopy ?? []}
      />

      {modelFixedSlotDialogOpen && selectedModelFixedSlot && (
        <FixedSlotScheduleDetailDialog
          open={modelFixedSlotDialogOpen}
          onOpenChange={handleModelFixedSlotDialogClose}
          fixedSlots={selectedFixedSlotsForModelDialog}
          slotInfoFallback={slotInfoFallbackForModelDialog}
        />
      )}
    </DashboardPageContainer>
  )
}
