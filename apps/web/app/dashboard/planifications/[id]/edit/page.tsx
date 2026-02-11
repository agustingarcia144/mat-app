'use client'

import { use, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import PlanificationEditForm from '@/components/features/planifications/form/planification-edit-form'

export default function EditPlanificationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  })

  const workoutWeeks = useQuery(api.workoutWeeks.getByPlanification, {
    planificationId: id as any,
  })

  const workoutDays = useQuery(api.workoutDays.getByPlanification, {
    planificationId: id as any,
  })

  const allExercises = useQuery(api.dayExercises.getByPlanification, {
    planificationId: id as any,
  })

  // Load blocks for each day - we'll create a component that handles this
  // For now, we'll structure the data and blocks will be loaded in the form component
  // Build the complete data structure
  const fullWeeksData = useMemo(() => {
    if (!workoutWeeks || !workoutDays || !allExercises) return null

    // Group exercises by day
    const exercisesByDay: Record<string, any[]> = {}
    allExercises.forEach((ex) => {
      const dayId = ex.workoutDayId
      if (!exercisesByDay[dayId]) {
        exercisesByDay[dayId] = []
      }
      exercisesByDay[dayId].push(ex)
    })

    // Build weeks with days and exercises
    // Blocks will be loaded separately in the form component
    const weeks = workoutWeeks.map((week) => {
      const daysForWeek = workoutDays.filter((day) => day.weekId === week._id)

      const daysWithExercises = daysForWeek.map((day) => {
        const dayExercises = exercisesByDay[day._id] || []
        
        return {
          id: day._id,
          name: day.name,
          order: day.order,
          dayOfWeek: day.dayOfWeek,
          blocks: [], // Will be loaded in form component
          exercises: dayExercises.map((ex) => ({
            id: ex._id,
            exerciseId: ex.exerciseId,
            exerciseName: ex.exercise?.name || 'Unknown',
            blockId: ex.blockId,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight || '',
            notes: ex.notes || '',
          })),
        }
      })

      return {
        id: week._id,
        name: week.name,
        order: week.order,
        workoutDays: daysWithExercises.sort((a, b) => a.order - b.order),
      }
    })

    return weeks.sort((a, b) => a.order - b.order)
  }, [workoutWeeks, workoutDays, allExercises])

  const isLoading =
    planification === undefined ||
    workoutWeeks === undefined ||
    workoutDays === undefined ||
    allExercises === undefined ||
    fullWeeksData === null

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 max-w-5xl">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
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
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/dashboard/planifications/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Link>
        </Button>

        <h1 className="text-3xl font-bold">Editar planificación</h1>
        <p className="text-muted-foreground mt-1">{planification.name}</p>
      </div>

      <PlanificationEditForm
        planificationId={id}
        initialData={planification}
        fullWeeksData={fullWeeksData}
      />
    </div>
  )
}
