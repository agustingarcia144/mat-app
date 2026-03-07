'use client'

import { useMemo, useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Doc, type Id } from '@/convex/_generated/dataModel'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

type Props = {
  onOpenDetail: (id: Id<'classSchedules'>) => void
}

export default function NextClassCard({ onOpenDetail }: Props) {
  const canQuery = useCanQueryCurrentOrganization()
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())

  const schedules = useQuery(
    api.classSchedules.getUpcoming,
    canQuery ? { limit: 20 } : 'skip'
  )

  const classes = useQuery(
    api.classes.getByOrganization,
    canQuery ? { activeOnly: true } : 'skip'
  )

  const [index, setIndex] = useState(0)

  const enriched = useMemo(() => {
    if (!schedules || !classes) return []

    const next48hs = nowTimestamp + 48 * 60 * 60 * 1000

    return schedules
      .filter(
        (s: Doc<'classSchedules'>) =>
          s.startTime >= nowTimestamp &&
          s.startTime <= next48hs &&
          s.status !== 'cancelled'
      )
      .map((s: Doc<'classSchedules'>) => ({
        ...s,
        class: classes.find((c: Doc<'classes'>) => c._id === s.classId),
      }))
      .sort((a: { startTime: number }, b: { startTime: number }) => a.startTime - b.startTime)
  }, [schedules, classes, nowTimestamp])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  const currentIndex = Math.min(index, Math.max(0, enriched.length - 1))
  const current = enriched[currentIndex]

  const next = () => {
    if (currentIndex < enriched.length - 1) {
      setIndex(currentIndex + 1)
    }
  }

  const prev = () => {
    if (currentIndex > 0) {
      setIndex(currentIndex - 1)
    }
  }

  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!current) return

    const tick = () => {
      const diff = current.startTime - Date.now()

      if (diff <= 0) {
        setTimeLeft('En curso')
        return
      }

      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)

      setTimeLeft(h > 0 ? `Empieza en ${h}h ${m}m` : `Empieza en ${m}m`)
    }

    tick()
    const interval = setInterval(tick, 60000)
    return () => clearInterval(interval)
  }, [current])

  const getColor = () => {
    if (!current) return 'bg-gray-400'
    const cap = current.capacity ?? 0
    if (cap <= 0) return 'bg-gray-500'

    const p = (current.currentReservations / cap) * 100

    if (p >= 100) return 'bg-red-500'
    if (p >= 80) return 'bg-orange-500'
    if (p >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (!current) {
    return (
      <div className="p-5 rounded-xl border w-full h-[180px] flex items-center justify-center">
        No hay clases programadas en las próximas 48 horas.
      </div>
    )
  }

  const start = new Date(current.startTime)
  const end = new Date(current.endTime)

  return (
    <div className="rounded-xl border w-full p-5 h-[180px] flex flex-col">

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Próximas clases</h3>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={prev}
            disabled={currentIndex === 0}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={next}
            disabled={currentIndex === enriched.length - 1}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <p className="font-medium leading-tight">
          {current.class?.name || 'Clase'}
        </p>

        <p className="text-sm text-muted-foreground leading-tight">
          {format(start, "EEEE d 'de' MMMM", { locale: es })}
        </p>

        <p className="text-sm leading-tight">
          {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
        </p>
      </div>

      {/* FOOTER */}
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" />
          <span>{timeLeft}</span>
        </div>

        <div className="flex items-center gap-3">

          <Button
            className="h-9 px-5 font-medium"
            onClick={() => onOpenDetail(current._id)}
          >
            Ver detalle
          </Button>

          <div className="flex items-center gap-2 text-sm">
            <span className={cn('w-3 h-3 rounded-full', getColor())} />
            {current.currentReservations}/{current.capacity}
          </div>
        </div>
      </div>
    </div>
  )
}