'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from '@/components/features/planifications/form/basic-info-section'
import WorkoutWeeksSection from '@/components/features/planifications/form/workout-weeks-section'
import {
  planificationFormSchema,
  PlanificationForm as PlanificationFormType,
} from '@repo/core/schemas'

export default function PlanificationForm() {
  const router = useRouter()
  const createPlanification = useMutation(api.planifications.create)
  const createWorkoutWeek = useMutation(api.workoutWeeks.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createDayExercise = useMutation(api.dayExercises.create)

  const form = useForm<PlanificationFormType>({
    resolver: zodResolver(planificationFormSchema),
    defaultValues: {
      name: '',
      description: '',
      folderId: undefined,
      isTemplate: false,
      workoutWeeks: [
        {
          id: 'temp-week-1',
          name: 'Semana 1',
          workoutDays: [],
        },
      ],
    },
  })

  const onSubmit = async (data: PlanificationFormType) => {
    try {
      // Create planification
      const planificationId = await createPlanification({
        name: data.name,
        description: data.description || undefined,
        folderId: data.folderId as any,
        isTemplate: data.isTemplate,
      })

      // Create workout weeks, days, and exercises
      for (let i = 0; i < data.workoutWeeks.length; i++) {
        const week = data.workoutWeeks[i]
        const weekId = await createWorkoutWeek({
          planificationId,
          name: week.name,
          order: i,
          notes: undefined,
        })

        // Create workout days for this week
        for (let j = 0; j < week.workoutDays.length; j++) {
          const day = week.workoutDays[j]
          const dayId = await createWorkoutDay({
            weekId,
            planificationId,
            name: day.name,
            order: j,
            notes: undefined,
          })

          // Create exercises for this day
          for (let k = 0; k < day.exercises.length; k++) {
            const exercise = day.exercises[k]
            await createDayExercise({
              workoutDayId: dayId,
              exerciseId: exercise.exerciseId as any,
              order: k,
              sets: exercise.sets,
              reps: exercise.reps,
              weight: exercise.weight,
              notes: exercise.notes,
            })
          }
        }
      }

      router.push('/dashboard/planifications')
    } catch (error) {
      console.error('Failed to create planification:', error)
      alert('Error al crear la planificación')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <BasicInfoSection form={form} />

      <WorkoutWeeksSection form={form} />

      <div className="flex gap-3 pt-6 border-t">
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || !form.formState.isValid}
        >
          {form.formState.isSubmitting ? 'Creando...' : 'Crear planificación'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={form.formState.isSubmitting}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
