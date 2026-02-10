'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from './basic-info-section'
import WorkoutWeeksSection from './workout-weeks-section'
import {
  planificationFormSchema,
  PlanificationForm as PlanificationFormType,
} from '@repo/core/schemas'
import { toast } from 'sonner'

interface PlanificationEditFormProps {
  planificationId: string
  initialData: any
  fullWeeksData: any[]
}

export default function PlanificationEditForm({
  planificationId,
  initialData,
  fullWeeksData,
}: PlanificationEditFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const hasInitialized = useRef(false)

  const updatePlanification = useMutation(api.planifications.update)
  const createWorkoutWeek = useMutation(api.workoutWeeks.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createDayExercise = useMutation(api.dayExercises.create)
  const removeWorkoutWeek = useMutation(api.workoutWeeks.remove)

  const form = useForm<PlanificationFormType>({
    resolver: zodResolver(planificationFormSchema),
    defaultValues: {
      name: initialData.name,
      description: initialData.description || '',
      folderId: initialData.folderId,
      isTemplate: initialData.isTemplate,
      workoutWeeks:
        fullWeeksData.length > 0
          ? fullWeeksData
          : [
              {
                id: 'temp-week-1',
                name: 'Semana 1',
                workoutDays: [],
              },
            ],
    },
  })

  // Reset form when data changes (but NOT during save operation)
  useEffect(() => {
    // Skip updates while saving
    if (isSaving) return

    // Only reset on initial load or if we're not saving
    if (!hasInitialized.current) {
      hasInitialized.current = true
      form.reset({
        name: initialData.name,
        description: initialData.description || '',
        folderId: initialData.folderId,
        isTemplate: initialData.isTemplate,
        workoutWeeks:
          fullWeeksData.length > 0
            ? fullWeeksData
            : [
                {
                  id: 'temp-week-1',
                  name: 'Semana 1',
                  workoutDays: [],
                },
              ],
      })
    }
  }, [initialData, fullWeeksData, form, isSaving])

  const onSubmit = async (data: PlanificationFormType) => {
    setIsSaving(true)

    try {
      // Update basic info
      await updatePlanification({
        id: planificationId as any,
        name: data.name,
        description: data.description || undefined,
        folderId: data.folderId as any,
        isTemplate: data.isTemplate,
      })

      // Delete all existing weeks (cascade deletes days and exercises)
      for (const week of fullWeeksData) {
        await removeWorkoutWeek({ id: week.id as any })
      }

      // Create new weeks, days, and exercises
      for (let i = 0; i < data.workoutWeeks.length; i++) {
        const week = data.workoutWeeks[i]
        const weekId = await createWorkoutWeek({
          planificationId: planificationId as any,
          name: week.name,
          order: i,
          notes: undefined,
        })

        for (let j = 0; j < week.workoutDays.length; j++) {
          const day = week.workoutDays[j]
          const dayId = await createWorkoutDay({
            weekId,
            planificationId: planificationId as any,
            name: day.name,
            order: j,
            dayOfWeek: day.dayOfWeek,
            notes: undefined,
          })

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

      // Redirect immediately after all operations complete
      router.push(`/dashboard/planifications/${planificationId}`)
    } catch (error) {
      console.error('Failed to update planification:', error)
      setIsSaving(false)
      toast.error('Error al actualizar la planificación')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <BasicInfoSection form={form} />

      <WorkoutWeeksSection form={form} />

      <div className="flex gap-3 pt-6 border-t">
        <Button
          type="submit"
          disabled={
            isSaving || form.formState.isSubmitting || !form.formState.isValid
          }
        >
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSaving || form.formState.isSubmitting}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
