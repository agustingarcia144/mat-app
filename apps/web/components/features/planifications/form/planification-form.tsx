'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from '@/components/features/planifications/form/basic-info-section'
import WorkoutDaysSection from '@/components/features/planifications/form/workout-days-section'
import {
  planificationFormSchema,
  PlanificationForm as PlanificationFormType,
} from '@repo/core/schemas'

export default function PlanificationForm() {
  const router = useRouter()
  const createPlanification = useMutation(api.planifications.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createDayExercise = useMutation(api.dayExercises.create)

  const form = useForm<PlanificationFormType>({
    resolver: zodResolver(planificationFormSchema),
    defaultValues: {
      name: '',
      description: '',
      folderId: undefined,
      isTemplate: false,
      workoutDays: [],
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

      // Create workout days and exercises
      for (let i = 0; i < data.workoutDays.length; i++) {
        const day = data.workoutDays[i]
        const dayId = await createWorkoutDay({
          planificationId,
          name: day.name,
          order: i,
          notes: undefined,
        })

        // Create exercises for this day
        for (let j = 0; j < day.exercises.length; j++) {
          const exercise = day.exercises[j]
          await createDayExercise({
            workoutDayId: dayId,
            exerciseId: exercise.exerciseId as any,
            order: j,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
            notes: exercise.notes,
          })
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

      <WorkoutDaysSection form={form} />

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
