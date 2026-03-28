'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { api } from '@/convex/_generated/api'
import { type Doc, type Id } from '@/convex/_generated/dataModel'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { cn } from '@/lib/utils'

type Props = {
  onOpenDetail: (id: Id<'classSchedules'>) => void
}

export default function NextClassCard({ onOpenDetail }: Props) {
  const pageSize = 3
  const upcomingWindowMs = 7 * 24 * 60 * 60 * 1000
  const canQuery = useCanQueryCurrentOrganization()
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
  const [pageIndex, setPageIndex] = useState(0)

  const schedules = useQuery(
    api.classSchedules.getUpcoming,
    canQuery ? { limit: 20 } : 'skip'
  )

  const classes = useQuery(
    api.classes.getByOrganization,
    canQuery ? { activeOnly: true } : 'skip'
  )

  const enriched = useMemo(() => {
    if (!schedules || !classes) return []

    const next7Days = nowTimestamp + upcomingWindowMs

    return schedules
      .filter(
        (schedule: Doc<'classSchedules'>) =>
          schedule.startTime >= nowTimestamp &&
          schedule.startTime <= next7Days &&
          schedule.status !== 'cancelled'
      )
      .map((schedule: Doc<'classSchedules'>) => ({
        ...schedule,
        class: classes.find((item: Doc<'classes'>) => item._id === schedule.classId),
      }))
      .sort(
        (a: { startTime: number }, b: { startTime: number }) =>
          a.startTime - b.startTime
      )
  }, [classes, nowTimestamp, schedules, upcomingWindowMs])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  const totalPages = Math.max(1, Math.ceil(enriched.length / pageSize))
  const currentPage = Math.min(pageIndex, totalPages - 1)
  const visibleClasses = enriched.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  )

  const next = () => {
    if (currentPage < totalPages - 1) {
      setPageIndex(currentPage + 1)
    }
  }

  const prev = () => {
    if (currentPage > 0) {
      setPageIndex(currentPage - 1)
    }
  }

  const getTimeLeft = (schedule: (typeof enriched)[number]) => {
    const diff = schedule.startTime - nowTimestamp

    if (diff <= 0) {
      return 'En curso'
    }

    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)

    return hours > 0
      ? `Empieza en ${hours}h ${minutes}m`
      : `Empieza en ${minutes}m`
  }

  const getColor = (schedule: (typeof enriched)[number]) => {
    const capacity = schedule.capacity ?? 0

    if (capacity <= 0) return 'bg-gray-500'

    const percentage = (schedule.currentReservations / capacity) * 100

    if (percentage >= 100) return 'bg-red-500'
    if (percentage >= 80) return 'bg-orange-500'
    if (percentage >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (visibleClasses.length === 0) {
    return (
      <div className="flex h-[180px] w-full items-center justify-center rounded-xl border p-5">
        No hay clases programadas en los próximos 7 días.
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Próximas clases</h3>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={prev}
            disabled={currentPage === 0}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={next}
            disabled={currentPage === totalPages - 1}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {visibleClasses.map((schedule: (typeof enriched)[number]) => {
          const start = new Date(schedule.startTime)
          const end = new Date(schedule.endTime)

          return (
            <div
              key={schedule._id}
              className="flex min-h-[150px] flex-col rounded-lg border p-4"
            >
              <div className="space-y-1">
                <p className="font-medium leading-tight">
                  {schedule.class?.name || 'Clase'}
                </p>

                <p className="text-sm leading-tight text-muted-foreground">
                  {format(start, "EEEE d 'de' MMMM", { locale: es })}
                </p>

                <p className="text-sm leading-tight">
                  {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-3 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>{getTimeLeft(schedule)}</span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    className="h-9 px-5 font-medium"
                    onClick={() => onOpenDetail(schedule._id)}
                  >
                    Ver detalle
                  </Button>

                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={cn('h-3 w-3 rounded-full', getColor(schedule))}
                    />
                    {schedule.currentReservations}/{schedule.capacity}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
