'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { useAuth } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ResponsiveActionButton } from '@/components/ui/responsive-action-button'
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
import WeeklyTimeline from '@/components/features/classes/calendar/weekly-timeline'
import ClassList from '@/components/features/classes/class-list'
import { Plus, Calendar, List, ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react'
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { type Id } from '@/convex/_generated/dataModel'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'

export default function ClassesPage() {
  const { isLoaded: authLoaded, userId, orgId } = useAuth()
  const canQueryOrgData = authLoaded && Boolean(userId) && Boolean(orgId)
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
  const [generateTurnosOpen, setGenerateTurnosOpen] = useState(false)
  const [generateTurnosInitial, setGenerateTurnosInitial] = useState<{
    id: Id<'classes'>
    name: string
  } | null>(null)

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

  const handleOpenGenerateTurnos = (classItem?: { _id: Id<'classes'>; name: string }) => {
    setGenerateTurnosInitial(classItem ? { id: classItem._id, name: classItem.name } : null)
    setGenerateTurnosOpen(true)
  }

  return (
    <DashboardPageContainer className='space-y-4 py-4 md:space-y-6 md:py-6'>
      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold md:text-3xl'>Clases y Turnos</h1>
          <p className='mt-1 text-sm text-muted-foreground md:text-base'>
            Gestiona las clases y los turnos de tu gimnasio
          </p>
        </div>
        <div className='flex gap-2'>
          <ResponsiveActionButton
            onClick={() => handleOpenGenerateTurnos()}
            icon={<CalendarPlus className='h-4 w-4' aria-hidden />}
            label='Crear turnos'
            tooltip='Crear turnos'
          />
          <ResponsiveActionButton
            onClick={handleNewClass}
            icon={<Plus className='h-4 w-4' aria-hidden />}
            label='Nueva Clase'
            tooltip='Nueva Clase'
          />
        </div>
      </div>

      {/* View toggle and filters */}
      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <Tabs
          value={selectedView}
          onValueChange={(v) => setSelectedView(v as 'calendar' | 'list')}
        >
          <TabsList>
            <TabsTrigger
              value='calendar'
              className='gap-0 md:gap-2'
              aria-label='Vista calendario'
            >
              <Calendar className='h-4 w-4' />
              <span className='sr-only md:not-sr-only'>Calendario</span>
            </TabsTrigger>
            <TabsTrigger
              value='list'
              className='gap-0 md:gap-2'
              aria-label='Vista lista'
            >
              <List className='h-4 w-4' />
              <span className='sr-only md:not-sr-only'>Lista</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {selectedView === 'calendar' && (
          <div className='flex items-center gap-2'>
            <span className='hidden text-sm text-muted-foreground sm:inline'>
              Filtrar por clase:
            </span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className='w-full sm:w-[220px]'>
                <SelectValue placeholder='Todas las clases' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Todas las clases</SelectItem>
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
        <div className='space-y-4 rounded-lg border p-3 md:p-4'>
          {/* Week navigation – always visible so users can move between weeks even when empty */}
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='icon'
                onClick={goToPreviousWeek}
                aria-label='Semana anterior'
              >
                <ChevronLeft className='h-4 w-4' aria-hidden />
              </Button>
              <Button variant='outline' onClick={goToToday}>
                Hoy
              </Button>
              <Button
                variant='outline'
                size='icon'
                onClick={goToNextWeek}
                aria-label='Semana siguiente'
              >
                <ChevronRight className='h-4 w-4' aria-hidden />
              </Button>
            </div>
            <h2 className='text-base font-semibold md:text-lg'>
              {format(weekStart, 'd', { locale: es })} -{' '}
              {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            </h2>
          </div>

          {schedules === undefined ? (
            <div className='overflow-hidden rounded-lg border'>
              <div className='overflow-x-auto'>
                <div className='min-w-[800px]'>
                  {/* Day headers */}
                  <div className='grid grid-cols-8 bg-muted'>
                    <Skeleton className='h-14 rounded-none border-r border-b border-border' />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className='h-14 rounded-none border-r border-b border-border'
                      />
                    ))}
                  </div>
                  {/* Time rows */}
                  {Array.from({ length: 12 }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      className='grid grid-cols-8 border-b border-border last:border-b-0'
                    >
                      <Skeleton className='h-[60px] rounded-none border-r border-border' />
                      {Array.from({ length: 7 }).map((_, colIndex) => (
                        <Skeleton
                          key={colIndex}
                          className='h-[60px] rounded-none border-r border-border'
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
        <div className='rounded-lg border p-3 md:p-4'>
          {classes === undefined ? (
            <div className='py-12 text-center'>
              <p className='text-muted-foreground'>Cargando clases...</p>
            </div>
          ) : classes.length === 0 ? (
            <Empty className='py-12'>
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=''
                    className='h-20 w-20 object-contain'
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
    </DashboardPageContainer>
  )
}
