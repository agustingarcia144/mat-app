'use client'

import { useMemo } from 'react'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Id, type Doc } from '@/convex/_generated/dataModel'

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

export default function WeeklyTimeline({
  schedules,
  currentDate,
  onDateChange,
  onScheduleClick,
  showWeekNavigation = true,
}: WeeklyTimelineProps) {
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  )

  const weekDays = useMemo(() => {
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  // Group schedules by day and hour
  const schedulesByDayHour = useMemo(() => {
    const map = new Map<string, (Doc<'classSchedules'> & { class?: { name: string } })[]>()
    
    schedules.forEach((schedule) => {
      const scheduleDate = new Date(schedule.startTime)
      const dayIndex = weekDays.findIndex((day) => isSameDay(day, scheduleDate))
      
      if (dayIndex !== -1) {
        const hour = scheduleDate.getHours()
        const key = `${dayIndex}-${hour}`
        const existing = map.get(key) || []
        map.set(key, [...existing, schedule])
      }
    })
    
    return map
  }, [schedules, weekDays])

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

  return (
    <div className="space-y-4">
      {showWeekNavigation && (
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
            {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", { locale: es })}
          </h2>
        </div>
      )}

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-8 bg-muted">
              <div className="p-2 border-r border-b font-medium text-sm">
                Hora
              </div>
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={index}
                    className={cn(
                      'p-2 border-r border-b text-center',
                      isToday && 'bg-primary/10'
                    )}
                  >
                    <div className="font-medium">
                      {format(day, 'EEE', { locale: es })}
                    </div>
                    <div
                      className={cn(
                        'text-sm',
                        isToday ? 'text-primary font-semibold' : 'text-muted-foreground'
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
              <div key={hour} className="grid grid-cols-8 border-b">
                <div className="p-2 border-r text-sm text-muted-foreground">
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
                        'p-1 border-r min-h-[60px] relative',
                        isToday && 'bg-primary/5'
                      )}
                    >
                      {daySchedules.map((schedule) => {
                        const startTime = new Date(schedule.startTime)
                        const endTime = new Date(schedule.endTime)
                        const durationHours =
                          (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
                        
                        return (
                          <button
                            key={schedule._id}
                            onClick={() => onScheduleClick(schedule._id)}
                            className={cn(
                              'w-full text-left p-2 rounded text-xs text-white hover:opacity-80 transition-opacity mb-1',
                              getScheduleColor(schedule)
                            )}
                            style={{
                              minHeight: `${Math.max(durationHours * 50, 40)}px`,
                            }}
                          >
                            <div className="font-medium truncate">
                              {schedule.class?.name || 'Clase'}
                            </div>
                            <div className="text-[10px] opacity-90">
                              {format(startTime, 'HH:mm')} -{' '}
                              {format(endTime, 'HH:mm')}
                            </div>
                            <div className="text-[10px] opacity-90 mt-1">
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
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Estado:</span>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span>Medio lleno</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span>Casi lleno</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>Completo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-400" />
          <span>Cancelada</span>
        </div>
      </div>
    </div>
  )
}
