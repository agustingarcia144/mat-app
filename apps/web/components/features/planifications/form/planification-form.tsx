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
import { toast } from 'sonner'

export default function PlanificationForm() {
  const router = useRouter()
  const createPlanification = useMutation(api.planifications.create)
  const createWorkoutWeek = useMutation(api.workoutWeeks.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createExerciseBlock = useMutation(api.exerciseBlocks.create)
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
          const day = week.workoutDays[j] as any
          const dayId = await createWorkoutDay({
            weekId,
            planificationId,
            name: day.name,
            order: j,
            dayOfWeek: day.dayOfWeek,
            notes: undefined,
          })

          // Create blocks for this day
          const blockIdMap = new Map<string, string>() // temp block id -> real block id
          if (day.blocks && day.blocks.length > 0) {
            for (let b = 0; b < day.blocks.length; b++) {
              const block = day.blocks[b]
              const realBlockId = await createExerciseBlock({
                workoutDayId: dayId,
                name: block.name,
                order: b,
                notes: block.notes,
              })
              blockIdMap.set(block.id, realBlockId)
            }
          }

          // Create exercises for this day
          // Group exercises by block to maintain order within blocks
          const exercisesByBlock = new Map<string | null, any[]>()
          const unblockedExercises: any[] = []

          ;(day.exercises || []).forEach((ex: any) => {
            if (ex.blockId && blockIdMap.has(ex.blockId)) {
              const blockExercises = exercisesByBlock.get(ex.blockId) || []
              blockExercises.push(ex)
              exercisesByBlock.set(ex.blockId, blockExercises)
            } else {
              unblockedExercises.push(ex)
            }
          })

          let globalOrder = 0

          // Create exercises in blocks first (in block order)
          if (day.blocks) {
            for (const block of day.blocks) {
              const blockExercises = exercisesByBlock.get(block.id) || []
              for (const exercise of blockExercises) {
                await createDayExercise({
                  workoutDayId: dayId,
                  exerciseId: exercise.exerciseId as any,
                  blockId: blockIdMap.get(block.id) as any,
                  order: globalOrder++,
                  sets: exercise.sets,
                  reps: exercise.reps,
                  weight: exercise.weight,
                  notes: exercise.notes,
                })
              }
            }
          }

          // Then create unblocked exercises
          for (const exercise of unblockedExercises) {
            await createDayExercise({
              workoutDayId: dayId,
              exerciseId: exercise.exerciseId as any,
              order: globalOrder++,
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
      toast.error('Error al crear la planificación')
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
