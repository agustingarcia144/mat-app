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
import ClassFormDialog from '@/components/features/classes/dialogs/class-form-dialog'
import ScheduleDetailDialog from '@/components/features/classes/dialogs/schedule-detail-dialog'
import WeeklyTimeline from '@/components/features/classes/calendar/weekly-timeline'
import ClassList from '@/components/features/classes/class-list'
import { Plus, Calendar, List } from 'lucide-react'
import { startOfWeek, endOfWeek, addDays } from 'date-fns'
import { type Id } from '@/convex/_generated/dataModel'

export default function ClassesPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedView, setSelectedView] = useState<'calendar' | 'list'>('calendar')
  const [classFormOpen, setClassFormOpen] = useState(false)
  const [editingClassId, setEditingClassId] = useState<Id<'classes'> | undefined>()
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState<Id<'classSchedules'> | undefined>()
  const [classFilter, setClassFilter] = useState<string>('all')

  const classes = useQuery(api.classes.getByOrganization, { activeOnly: false })

  // Get schedules for the current week
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })

  const schedules = useQuery(
    api.classSchedules.getByOrganizationAndDateRange,
    {
      startDate: weekStart.getTime(),
      endDate: weekEnd.getTime(),
      classId: classFilter === 'all' ? undefined : (classFilter as Id<'classes'>),
    }
  )

  // Debug: Get all schedules
  const allSchedules = useQuery(api.classSchedules.getAllByOrganization, {})
  
  // Log for debugging
  if (allSchedules) {
    console.log('Total schedules in DB:', allSchedules.length)
    console.log('Schedules for current week:', schedules?.length || 0)
    console.log('Week range:', new Date(weekStart), 'to', new Date(weekEnd))
    if (allSchedules.length > 0) {
      console.log('First schedule date:', new Date(allSchedules[0].startTime))
    }
  }

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
        <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as 'calendar' | 'list')}>
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
        <div className="border rounded-lg p-4">
          {schedules === undefined ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Cargando calendario...</p>
            </div>
          ) : enrichedSchedules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No hay clases programadas para esta semana
              </p>
              <Button onClick={handleNewClass} className="mt-4">
                Crear primera clase
              </Button>
            </div>
          ) : (
            <WeeklyTimeline
              schedules={enrichedSchedules}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onScheduleClick={handleScheduleClick}
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
              <p className="text-muted-foreground">
                No hay clases creadas
              </p>
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
