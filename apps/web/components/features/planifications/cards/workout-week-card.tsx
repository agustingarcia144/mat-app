import Image from 'next/image'
import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'
import { useQuery } from 'convex/react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import WorkoutDayCard from './workout-day-card'
import matWolfLooking from '@/assets/mat-wolf-looking.png'

export default function WorkoutWeekCard({ week }: { week: Doc<'workoutWeeks'> }) {
  const workoutDays = useQuery(api.workoutDays.getByWeek, {
    weekId: week._id,
  })

  return (
    <div className="border rounded-lg p-6 bg-muted/30">
      <h2 className="text-2xl font-bold mb-6">{week.name}</h2>

      {workoutDays === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : workoutDays.length === 0 ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={matWolfLooking}
                alt=""
                className="h-14 w-14 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>No hay días en esta semana</EmptyTitle>
            <EmptyDescription>
              No hay días de entrenamiento en esta semana
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {workoutDays.map((day: Doc<'workoutDays'>) => (
            <WorkoutDayCard key={day._id} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}
