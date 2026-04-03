'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type Id, type Doc } from '@/convex/_generated/dataModel'
import { useIsMobile } from '@/hooks/use-mobile'
import { Plus } from 'lucide-react'

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am to 10pm
const DAYS_OF_WEEK = [
  { label: 'Lun', dayOfWeek: 1 },
  { label: 'Mar', dayOfWeek: 2 },
  { label: 'Mié', dayOfWeek: 3 },
  { label: 'Jue', dayOfWeek: 4 },
  { label: 'Vie', dayOfWeek: 5 },
  { label: 'Sáb', dayOfWeek: 6 },
  { label: 'Dom', dayOfWeek: 0 },
] as const

export type ModelWeekSlotDoc = Doc<'modelWeekSlots'> & {
  class: Doc<'classes'> | null
}

interface ModelWeekTimelineProps {
  modelSlots: ModelWeekSlotDoc[]
  /** Used to display fixed-member count per slot. */
  fixedSlots: Doc<'fixedClassSlots'>[]
  onSlotClick: (slotId: Id<'modelWeekSlots'>) => void
  onEmptyCellClick?: (dayOfWeek: number, startTimeMinutes: number) => void
}

type SlotBlock = {
  slot: ModelWeekSlotDoc
  fixedCount: number
  dayIndex: number // 0=Mon...6=Sun in display order
  hour: number
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function capacityColor(fixedCount: number, capacity: number): string {
  const ratio = capacity > 0 ? fixedCount / capacity : 0
  if (ratio >= 1) return 'bg-red-600'
  if (ratio >= 0.7) return 'bg-orange-500'
  return 'bg-indigo-600'
}

export default function ModelWeekTimeline({
  modelSlots,
  fixedSlots,
  onSlotClick,
  onEmptyCellClick,
}: ModelWeekTimelineProps) {
  const isMobile = useIsMobile()

  // Count fixed members per (classId, dayOfWeek, startTimeMinutes) key
  const fixedCountByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const fs of fixedSlots) {
      const key = `${fs.classId}-${fs.dayOfWeek}-${fs.startTimeMinutes}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [fixedSlots])

  // Build slot blocks grouped by display day index and hour
  const blocksByDayHour = useMemo(() => {
    const map = new Map<string, SlotBlock[]>()

    for (const slot of modelSlots) {
      const hour = Math.floor(slot.startTimeMinutes / 60)
      if (!HOURS.includes(hour)) continue

      // Convert dayOfWeek (0=Sun…6=Sat) to display index (0=Mon…6=Sun)
      const dayIndex = (slot.dayOfWeek + 6) % 7
      const key = `${dayIndex}-${hour}`
      const fixedCount =
        fixedCountByKey.get(
          `${slot.classId}-${slot.dayOfWeek}-${slot.startTimeMinutes}`
        ) ?? 0

      const existing = map.get(key) ?? []
      map.set(key, [
        ...existing,
        { slot, fixedCount, dayIndex, hour },
      ])
    }

    return map
  }, [modelSlots, fixedCountByKey])

  // Group by day for mobile
  const blocksByDay = useMemo(() => {
    const groups: SlotBlock[][] = Array.from({ length: 7 }, () => [])
    Array.from(blocksByDayHour.values()).forEach((blocks) => {
      blocks.forEach((block) => {
        groups[block.dayIndex].push(block)
      })
    })
    groups.forEach((g) => g.sort((a, b) => a.slot.startTimeMinutes - b.slot.startTimeMinutes))
    return groups
  }, [blocksByDayHour])

  if (isMobile) {
    return (
      <div className="space-y-3">
        {DAYS_OF_WEEK.map((day, dayIndex) => {
          const dayBlocks = blocksByDay[dayIndex] ?? []
          return (
            <section
              key={day.dayOfWeek}
              className="overflow-hidden rounded-lg border"
            >
              <header className="flex items-center justify-between border-b bg-muted px-3 py-2">
                <p className="text-sm font-semibold">{day.label}</p>
                {onEmptyCellClick && (
                  <button
                    type="button"
                    onClick={() => onEmptyCellClick(day.dayOfWeek, 9 * 60)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Agregar slot el ${day.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </header>
              <div className="space-y-2 p-3">
                {dayBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin clases</p>
                ) : (
                  dayBlocks.map((block) => {
                    const cap = block.slot.capacity ?? block.slot.class?.capacity ?? 0
                    const endMinutes =
                      block.slot.startTimeMinutes + block.slot.durationMinutes
                    return (
                      <button
                        key={block.slot._id}
                        type="button"
                        onClick={() => onSlotClick(block.slot._id)}
                        className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {block.slot.class?.name ?? 'Clase'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatMinutes(block.slot.startTimeMinutes)} -{' '}
                              {formatMinutes(endMinutes)} · {block.slot.durationMinutes} min
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {block.fixedCount}/{cap}
                          </Badge>
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
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 bg-muted">
            <div className="border-r border-b p-2 text-sm font-medium text-muted-foreground">
              Hora
            </div>
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day.dayOfWeek}
                className="border-r border-b p-2 text-center"
              >
                <div className="font-medium">{day.label}</div>
              </div>
            ))}
          </div>

          {/* Time rows */}
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b last:border-b-0">
              <div className="border-r p-2 text-sm text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {DAYS_OF_WEEK.map((day, dayIndex) => {
                const cellKey = `${dayIndex}-${hour}`
                const cellBlocks = blocksByDayHour.get(cellKey) ?? []

                return (
                  <div
                    key={day.dayOfWeek}
                    className={cn(
                      'group relative min-h-[60px] border-r p-1',
                      onEmptyCellClick &&
                        cellBlocks.length === 0 &&
                        'cursor-pointer hover:bg-accent/30'
                    )}
                    onClick={() => {
                      if (cellBlocks.length === 0 && onEmptyCellClick) {
                        onEmptyCellClick(day.dayOfWeek, hour * 60)
                      }
                    }}
                  >
                    {cellBlocks.length === 0 && onEmptyCellClick && (
                      <Plus className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-40" />
                    )}

                    {cellBlocks.map((block) => {
                      const cap =
                        block.slot.capacity ?? block.slot.class?.capacity ?? 0
                      const durationHours = block.slot.durationMinutes / 60
                      const endMinutes =
                        block.slot.startTimeMinutes + block.slot.durationMinutes
                      const colorClass = capacityColor(block.fixedCount, cap)

                      return (
                        <button
                          key={block.slot._id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSlotClick(block.slot._id)
                          }}
                          className={cn(
                            'mb-1 w-full rounded p-2 text-left text-xs text-white transition-opacity hover:opacity-80',
                            colorClass
                          )}
                          style={{
                            minHeight: `${Math.max(durationHours * 50, 40)}px`,
                          }}
                        >
                          <div className="truncate font-medium">
                            {block.slot.class?.name ?? 'Clase'}
                          </div>
                          <div className="text-[10px] opacity-90">
                            {formatMinutes(block.slot.startTimeMinutes)} –{' '}
                            {formatMinutes(endMinutes)}
                          </div>
                          <div className="mt-1 text-[10px] opacity-90">
                            {block.fixedCount}/{cap} fijos
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t bg-muted/30 p-3 text-xs text-muted-foreground">
        <span>Capacidad fija:</span>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-indigo-600" />
          <span>&lt;70%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-orange-500" />
          <span>70–99%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-red-600" />
          <span>Lleno</span>
        </div>
      </div>
    </div>
  )
}
