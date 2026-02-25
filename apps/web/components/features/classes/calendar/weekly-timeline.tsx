'use client'

import { useMemo } from 'react'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Id, type Doc } from '@/convex/_generated/dataModel'
import { useIsMobile } from '@/hooks/use-mobile'

interface WeeklyTimelineProps {
  schedules: (Doc<'classSchedules'> & { class?: { name: string } })[]
  currentDate: Date
  onDateChange: (date: Date) => void
  onScheduleClick: (scheduleId: Id<'classSchedules'>) => void
  /** When false, week navigation is rendered by the parent (e.g. classes page). Default true. */
  showWeekNavigation?: boolean
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am to 10pm
const DAYS_IN_WEEK = 7

type ScheduleWithClass = Doc<'classSchedules'> & { class?: { name: string } }

export default function WeeklyTimeline({
  schedules,
  currentDate,
  onDateChange,
  onScheduleClick,
  showWeekNavigation = true,
}: WeeklyTimelineProps) {
  const isMobile = useIsMobile()
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  )

  const weekDays = useMemo(() => {
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const schedulesByDay = useMemo(() => {
    const groupedByDay: ScheduleWithClass[][] = Array.from(
      { length: DAYS_IN_WEEK },
      () => []
    )

    schedules.forEach((schedule) => {
      const scheduleDate = new Date(schedule.startTime)
      const dayIndex = weekDays.findIndex((day) => isSameDay(day, scheduleDate))
      if (dayIndex !== -1) groupedByDay[dayIndex].push(schedule)
    })

    groupedByDay.forEach((daySchedules) => {
      daySchedules.sort((a, b) => a.startTime - b.startTime)
    })

    return groupedByDay
  }, [schedules, weekDays])

  // Group schedules by day/hour for desktop calendar grid
  const schedulesByDayHour = useMemo(() => {
    const map = new Map<string, ScheduleWithClass[]>()
    if (isMobile) return map

    schedulesByDay.forEach((daySchedules, dayIndex) => {
      daySchedules.forEach((schedule) => {
        const hour = new Date(schedule.startTime).getHours()
        const key = `${dayIndex}-${hour}`
        const existing = map.get(key) || []
        map.set(key, [...existing, schedule])
      })
    })

    return map
  }, [schedulesByDay, isMobile])

  const goToPreviousWeek = () => {
    onDateChange(addDays(currentDate, -7))
  }

  const goToNextWeek = () => {
    onDateChange(addDays(currentDate, 7))
  }

  const goToToday = () => {
    onDateChange(new Date())
  }

  const getScheduleColor = (schedule: Doc<'classSchedules'>) => {
    if (schedule.status === 'cancelled') return 'bg-gray-400'
    if (schedule.status === 'completed') return 'bg-gray-300'

    // Guard against division by zero
    if (schedule.capacity === 0) {
      return schedule.currentReservations > 0 ? 'bg-red-500' : 'bg-gray-500'
    }

    const percentFull = (schedule.currentReservations / schedule.capacity) * 100
    if (percentFull >= 100) return 'bg-red-500'
    if (percentFull >= 80) return 'bg-orange-500'
    if (percentFull >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getScheduleStatusLabel = (schedule: Doc<'classSchedules'>) => {
    if (schedule.status === 'cancelled') return 'Cancelada'
    if (schedule.status === 'completed') return 'Completada'
    if (schedule.capacity === 0) return 'Sin cupo'

    const percentFull = (schedule.currentReservations / schedule.capacity) * 100
    if (percentFull >= 100) return 'Completa'
    if (percentFull >= 80) return 'Casi llena'
    if (percentFull >= 50) return 'Medio llena'
    return 'Disponible'
  }

  const weekNavigation = showWeekNavigation && (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
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
      <h2 className='text-base font-semibold sm:text-lg'>
        {format(weekStart, 'd', { locale: es })} -{' '}
        {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", { locale: es })}
      </h2>
    </div>
  )

  if (isMobile) {
    return (
      <div className='space-y-4'>
        {weekNavigation}

        <div className='space-y-3'>
          {weekDays.map((day, dayIndex) => {
            const daySchedules = schedulesByDay[dayIndex] || []
            const isToday = isSameDay(day, new Date())

            return (
              <section
                key={day.toISOString()}
                className={cn(
                  'overflow-hidden rounded-lg border',
                  isToday && 'border-primary/40'
                )}
              >
                <header
                  className={cn(
                    'flex items-center justify-between border-b px-3 py-2',
                    isToday && 'bg-primary/5'
                  )}
                >
                  <div>
                    <p className='text-sm font-semibold'>
                      {format(day, 'EEEE', { locale: es })}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {format(day, "d 'de' MMMM", { locale: es })}
                    </p>
                  </div>
                  {isToday && <Badge variant='secondary'>Hoy</Badge>}
                </header>

                <div className='space-y-2 p-3'>
                  {daySchedules.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      Sin turnos
                    </p>
                  ) : (
                    daySchedules.map((schedule) => {
                      const startTime = new Date(schedule.startTime)
                      const endTime = new Date(schedule.endTime)

                      return (
                        <button
                          key={schedule._id}
                          type='button'
                          onClick={() => onScheduleClick(schedule._id)}
                          className='w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/40'
                        >
                          <div className='flex items-start justify-between gap-2'>
                            <div className='min-w-0'>
                              <p className='truncate text-sm font-medium'>
                                {schedule.class?.name || 'Clase'}
                              </p>
                              <p className='text-xs text-muted-foreground'>
                                {format(startTime, 'HH:mm')} -{' '}
                                {format(endTime, 'HH:mm')}
                              </p>
                            </div>
                            <Badge variant='outline' className='shrink-0 text-[10px]'>
                              {getScheduleStatusLabel(schedule)}
                            </Badge>
                          </div>
                          <div className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
                            <span
                              className={cn(
                                'inline-block h-2.5 w-2.5 rounded-full',
                                getScheduleColor(schedule)
                              )}
                            />
                            <span>
                              {schedule.currentReservations}/{schedule.capacity}{' '}
                              reservados
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {weekNavigation}

      {/* Calendar grid */}
      <div className='overflow-hidden rounded-lg border'>
        <div className='overflow-x-auto'>
          <div className='min-w-[800px]'>
            {/* Day headers */}
            <div className='grid grid-cols-8 bg-muted'>
              <div className='border-r border-b p-2 text-sm font-medium'>Hora</div>
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={index}
                    className={cn(
                      'border-r border-b p-2 text-center',
                      isToday && 'bg-primary/10'
                    )}
                  >
                    <div className='font-medium'>
                      {format(day, 'EEE', { locale: es })}
                    </div>
                    <div
                      className={cn(
                        'text-sm',
                        isToday
                          ? 'text-primary font-semibold'
                          : 'text-muted-foreground'
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time rows */}
            {HOURS.map((hour) => (
              <div key={hour} className='grid grid-cols-8 border-b'>
                <div className='border-r p-2 text-sm text-muted-foreground'>
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  const key = `${dayIndex}-${hour}`
                  const daySchedules = schedulesByDayHour.get(key) || []
                  const isToday = isSameDay(day, new Date())

                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className={cn(
                        'relative min-h-[60px] border-r p-1',
                        isToday && 'bg-primary/5'
                      )}
                    >
                      {daySchedules.map((schedule) => {
                        const startTime = new Date(schedule.startTime)
                        const endTime = new Date(schedule.endTime)
                        const durationHours =
                          (endTime.getTime() - startTime.getTime()) /
                          (1000 * 60 * 60)

                        return (
                          <button
                            key={schedule._id}
                            onClick={() => onScheduleClick(schedule._id)}
                            className={cn(
                              'mb-1 w-full rounded p-2 text-left text-xs text-white transition-opacity hover:opacity-80',
                              getScheduleColor(schedule)
                            )}
                            style={{
                              minHeight: `${Math.max(durationHours * 50, 40)}px`,
                            }}
                          >
                            <div className='truncate font-medium'>
                              {schedule.class?.name || 'Clase'}
                            </div>
                            <div className='text-[10px] opacity-90'>
                              {format(startTime, 'HH:mm')} -{' '}
                              {format(endTime, 'HH:mm')}
                            </div>
                            <div className='mt-1 text-[10px] opacity-90'>
                              {schedule.currentReservations}/{schedule.capacity}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className='flex flex-wrap items-center gap-4 text-sm'>
        <span className='text-muted-foreground'>Estado:</span>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded bg-green-500' />
          <span>Disponible</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded bg-yellow-500' />
          <span>Medio lleno</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded bg-orange-500' />
          <span>Casi lleno</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded bg-red-500' />
          <span>Completo</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded bg-gray-400' />
          <span>Cancelada</span>
        </div>
      </div>
    </div>
  )
}
