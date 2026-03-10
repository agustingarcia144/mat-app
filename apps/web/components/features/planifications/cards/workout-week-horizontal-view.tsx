'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'
import { Skeleton } from '@/components/ui/skeleton'
import WorkoutDayCard from './workout-day-card'

const DAY_NAMES = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const

interface WorkoutWeekHorizontalViewProps {
  week: Doc<'workoutWeeks'>
}

export default function WorkoutWeekHorizontalView({
  week,
}: WorkoutWeekHorizontalViewProps) {
  const workoutDays = useQuery(api.workoutDays.getByWeek, {
    weekId: week._id,
  })
  const daysByWeekday = (() => {
    const map = new Map<number, Doc<'workoutDays'>[]>()
    for (let dow = 1; dow <= 7; dow++) map.set(dow, [])
    ;(workoutDays ?? []).forEach((day) => {
      const dow = day.dayOfWeek ?? 1
      const key = dow >= 1 && dow <= 7 ? dow : 1
      map.get(key)!.push(day)
    })
    return map
  })()

  if (workoutDays === undefined) {
    return (
      <div className="border rounded-lg p-6 bg-muted/30">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="overflow-x-auto w-full">
          <div className="grid w-full gap-3 grid-cols-1 sm:min-w-[560px] sm:grid-cols-4 lg:grid-cols-7">
            {DAY_NAMES.map(({ value: dow }) => (
              <div
                key={dow}
                className="flex min-h-[100px] flex-col rounded-lg border bg-muted/20 p-2"
              >
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-32 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-muted/30">
      <h2 className="text-2xl font-bold mb-6">{week.name}</h2>
      <div className="overflow-x-auto w-full">
        {/* Mobile: single column; empty days get a narrow placeholder. */}
        {/* sm+: flex row; empty columns stay narrow, columns with exercises grow. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:min-w-0 sm:gap-2">
          {DAY_NAMES.map(({ value: dow, label }) => {
            const days = daysByWeekday.get(dow) ?? []
            const hasExercises = days.length > 0

            return (
              <div
                key={dow}
                className={`
                  flex flex-col rounded-lg border bg-muted/20 overflow-hidden
                  min-h-[60px] max-h-[70vh]
                  ${hasExercises ? 'sm:min-w-[200px] sm:flex-1 sm:basis-0 p-2' : 'sm:w-14 sm:flex-none p-1.5'}
                `}
              >
                <div className="mb-1.5 flex shrink-0">
                  <span className="text-sm font-medium text-muted-foreground truncate block">
                    {label}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto">
                  {hasExercises ? (
                    days.map((day) => (
                      <WorkoutDayCard key={day._id} day={day} compact />
                    ))
                  ) : (
                    <div className="flex-1 min-h-[32px] rounded bg-muted/20 sm:min-h-[40px]" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
