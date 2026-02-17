'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import ClassFormDialog from '@/components/features/classes/dialogs/class-form-dialog'
import ScheduleDetailDialog from '@/components/features/classes/dialogs/schedule-detail-dialog'
import WeeklyTimeline from '@/components/features/classes/calendar/weekly-timeline'
import ClassList from '@/components/features/classes/class-list'
import { Plus, Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { type Id } from '@/convex/_generated/dataModel'

export default function ClassesPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedView, setSelectedView] = useState<'calendar' | 'list'>(
    'calendar'
  )
  const [classFormOpen, setClassFormOpen] = useState(false)
  const [editingClassId, setEditingClassId] = useState<
    Id<'classes'> | undefined
  >()
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState<
    Id<'classSchedules'> | undefined
  >()
  const [classFilter, setClassFilter] = useState<string>('all')

  const classes = useQuery(api.classes.getByOrganization, { activeOnly: false })

  // Get schedules for the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })

  const goToPreviousWeek = () => setCurrentDate((d) => addDays(d, -7))
  const goToNextWeek = () => setCurrentDate((d) => addDays(d, 7))
  const goToToday = () => setCurrentDate(new Date())

  const schedules = useQuery(api.classSchedules.getByOrganizationAndDateRange, {
    startDate: weekStart.getTime(),
    endDate: weekEnd.getTime(),
    classId: classFilter === 'all' ? undefined : (classFilter as Id<'classes'>),
  })

  // Enrich schedules with class data
  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return []

    return schedules.map((schedule) => ({
      ...schedule,
      class: classes.find((c) => c._id === schedule.classId),
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Clases</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las clases y horarios de tu gimnasio
          </p>
        </div>
        <Button onClick={handleNewClass}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Clase
        </Button>
      </div>

      {/* View toggle and filters */}
      <div className="flex items-center justify-between">
        <Tabs
          value={selectedView}
          onValueChange={(v) => setSelectedView(v as 'calendar' | 'list')}
        >
          <TabsList>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="h-4 w-4" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedView === 'calendar' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtrar por:</span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas las clases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las clases</SelectItem>
                {classes?.map((classItem) => (
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
        <div className="border rounded-lg p-4 space-y-4">
          {/* Week navigation – always visible so users can move between weeks even when empty */}
          <div className="flex items-center justify-between">
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
            <h2 className="text-lg font-semibold">
              {format(weekStart, 'd', { locale: es })} -{' '}
              {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            </h2>
          </div>

          {schedules === undefined ? (
            <div className="border rounded-lg overflow-hidden">
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
            />
          )}
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          {classes === undefined ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando clases...</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No hay clases creadas</p>
              <Button onClick={handleNewClass} className="mt-4">
                Crear primera clase
              </Button>
            </div>
          ) : (
            <ClassList onEditClass={handleEditClass} />
          )}
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
    </div>
  )
}
