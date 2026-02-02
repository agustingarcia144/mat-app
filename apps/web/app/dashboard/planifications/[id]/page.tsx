'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Edit, Users, Copy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from 'date-fns'

export default function PlanificationViewPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()

  const planification = useQuery(api.planifications.getById, {
    id: params.id as any,
  })
  const workoutDays = useQuery(api.workoutDays.getByPlanification, {
    planificationId: params.id as any,
  })

  if (planification === undefined || workoutDays === undefined) {
    return (
      <div className="container mx-auto py-6 max-w-5xl">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-6 w-96 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/planifications')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a planificaciones
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{planification.name}</h1>
              {planification.isTemplate && (
                <Badge variant="secondary">Plantilla</Badge>
              )}
            </div>
            {planification.description && (
              <p className="text-muted-foreground">
                {planification.description}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Creado el {formatDate(planification.createdAt, 'dd/MM/yyyy')}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/dashboard/planifications/${params.id}/edit`)
              }
            >
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 mr-2" />
              Asignar
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {workoutDays.length === 0 ? (
          <div className="text-center py-12 border rounded-lg border-dashed">
            <p className="text-muted-foreground">
              Esta planificación no tiene días de entrenamiento
            </p>
          </div>
        ) : (
          workoutDays.map((day, index) => (
            <WorkoutDayCard key={day._id} day={day} index={index} />
          ))
        )}
      </div>
    </div>
  )
}

function WorkoutDayCard({ day, index }: { day: any; index: number }) {
  const dayExercises = useQuery(api.dayExercises.getByWorkoutDay, {
    workoutDayId: day._id,
  })

  return (
    <div className="border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">{day.name}</h2>

      {dayExercises === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : dayExercises.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay ejercicios en este día
        </p>
      ) : (
        <div className="space-y-3">
          {dayExercises.map((ex, i) => (
            <div
              key={ex._id}
              className="flex items-center gap-4 p-3 bg-muted/50 rounded-md"
            >
              <span className="text-sm font-medium text-muted-foreground w-6">
                {i + 1}.
              </span>
              <div className="flex-1">
                <p className="font-medium">
                  {ex.exercise?.name || 'Ejercicio eliminado'}
                </p>
                {ex.exercise?.category && (
                  <p className="text-xs text-muted-foreground">
                    {ex.exercise.category}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{ex.sets}</span>
                <span className="text-muted-foreground">×</span>
                <span className="font-medium">{ex.reps}</span>
                {ex.weight && (
                  <>
                    <span className="text-muted-foreground">@</span>
                    <span className="font-medium">{ex.weight}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
