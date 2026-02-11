'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from './basic-info-section'
import WorkoutWeeksSection from './workout-weeks-section'
import BlocksLoader from './blocks-loader'
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
  const createExerciseBlock = useMutation(api.exerciseBlocks.create)
  const createDayExercise = useMutation(api.dayExercises.create)
  const removeWorkoutWeek = useMutation(api.workoutWeeks.remove)

  const [blocksByDay, setBlocksByDay] = useState<Map<string, any[]>>(new Map())
  const blocksLoadedRef = useRef(false)

  // Load blocks for all days
  const dayIds = useMemo(
    () =>
      (fullWeeksData || []).flatMap((week: any) =>
        (week.workoutDays || []).map((day: any) => day.id)
      ) || [],
    [fullWeeksData]
  )

  const handleBlocksLoaded = useCallback((blocks: Map<string, any[]>) => {
    if (!blocksLoadedRef.current) {
      blocksLoadedRef.current = true
      setBlocksByDay(blocks)
    }
  }, [])

  // Merge blocks into fullWeeksData
  const fullWeeksDataWithBlocks = useMemo(() => {
    if (!fullWeeksData) return fullWeeksData

    return (fullWeeksData as any[]).map((week: any) => ({
      ...week,
      workoutDays: (week.workoutDays || []).map((day: any) => ({
        ...day,
        blocks: (blocksByDay.get(day.id) || []).map((block: any) => ({
          id: block._id,
          name: block.name,
          order: block.order,
          notes: block.notes || '',
        })),
      })),
    }))
  }, [fullWeeksData, blocksByDay])

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
    // Wait for blocks to be loaded before resetting
    if (!hasInitialized.current && fullWeeksDataWithBlocks && blocksLoadedRef.current) {
      hasInitialized.current = true
      form.reset({
        name: initialData.name,
        description: initialData.description || '',
        folderId: initialData.folderId,
        isTemplate: initialData.isTemplate,
        workoutWeeks:
          fullWeeksDataWithBlocks.length > 0
            ? fullWeeksDataWithBlocks
            : [
                {
                  id: 'temp-week-1',
                  name: 'Semana 1',
                  workoutDays: [],
                },
              ],
      })
    }
  }, [initialData, fullWeeksDataWithBlocks, form, isSaving])

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
          const day = week.workoutDays[j] as any
          const dayId = await createWorkoutDay({
            weekId,
            planificationId: planificationId as any,
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

      // Redirect immediately after all operations complete
      router.push(`/dashboard/planifications/${planificationId}`)
    } catch (error) {
      console.error('Failed to update planification:', error)
      setIsSaving(false)
      toast.error('Error al actualizar la planificación')
    }
  }

  return (
    <>
      <BlocksLoader
        dayIds={dayIds}
        onBlocksLoaded={handleBlocksLoaded}
      />
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
    </>
  )
}
