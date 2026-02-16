'use client'

import { use, useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  planificationFormSchema,
  PlanificationForm as PlanificationFormType,
} from '@repo/core/schemas'
import { PlanificationFormProvider } from '@/contexts/planification-form-context'
import BlocksLoader from '@/components/features/planifications/form/blocks-loader'
import { SIN_BLOQUE_ID } from '@/components/features/planifications/form/day-blocks-content'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

function EditFormShell({
  planificationId,
  children,
}: {
  planificationId: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [redirectAfterSave, setRedirectAfterSave] = useState<'view' | 'edit'>(
    'view'
  )
  const planification = useQuery(api.planifications.getById, {
    id: planificationId as any,
  })
  const workoutWeeks = useQuery(api.workoutWeeks.getByPlanification, {
    planificationId: planificationId as any,
  })
  const workoutDays = useQuery(api.workoutDays.getByPlanification, {
    planificationId: planificationId as any,
  })
  const allExercises = useQuery(api.dayExercises.getByPlanification, {
    planificationId: planificationId as any,
  })

  const updatePlanification = useMutation(api.planifications.update)
  const createWorkoutWeek = useMutation(api.workoutWeeks.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createExerciseBlock = useMutation(api.exerciseBlocks.create)
  const createDayExercise = useMutation(api.dayExercises.create)
  const removeWorkoutWeek = useMutation(api.workoutWeeks.remove)

  const fullWeeksData = useMemo(() => {
    if (!workoutWeeks || !workoutDays || !allExercises) return null
    const exercisesByDay: Record<string, any[]> = {}
    allExercises.forEach((ex) => {
      const dayId = ex.workoutDayId
      if (!exercisesByDay[dayId]) exercisesByDay[dayId] = []
      exercisesByDay[dayId].push(ex)
    })
    const weeks = workoutWeeks.map((week) => {
      const daysForWeek = workoutDays.filter((day) => day.weekId === week._id)
      const daysWithExercises = daysForWeek.map((day) => {
        const dayExercises = exercisesByDay[day._id] || []
        return {
          id: day._id,
          name: day.name,
          order: day.order,
          dayOfWeek: day.dayOfWeek ?? 1,
          blocks: [] as any[],
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

  const [blocksByDay, setBlocksByDay] = useState<Map<string, any[]>>(new Map())
  const blocksLoadedRef = useRef(false)
  const hasInitialized = useRef(false)

  const dayIds = useMemo(
    () =>
      (fullWeeksData || []).flatMap((week: any) =>
        (week.workoutDays || []).map((day: any) => day.id)
      ).filter((id: string) => typeof id === 'string' && !id.startsWith('temp-')),
    [fullWeeksData]
  )

  const handleBlocksLoaded = useCallback((blocks: Map<string, any[]>) => {
    if (!blocksLoadedRef.current) {
      blocksLoadedRef.current = true
      setBlocksByDay(blocks)
    }
  }, [])

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
      name: planification?.name ?? '',
      description: planification?.description ?? '',
      folderId: planification?.folderId,
      isTemplate: planification?.isTemplate ?? false,
      workoutWeeks:
        fullWeeksData && fullWeeksData.length > 0
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

  useEffect(() => {
    if (
      !planification ||
      !fullWeeksDataWithBlocks ||
      !blocksLoadedRef.current ||
      hasInitialized.current
    )
      return
    hasInitialized.current = true
    form.reset({
      name: planification.name,
      description: planification.description ?? '',
      folderId: planification.folderId,
      isTemplate: planification.isTemplate,
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
  }, [planification, fullWeeksDataWithBlocks, form])

  const onSubmit = useCallback(
    async (data: PlanificationFormType) => {
      setIsSaving(true)
      try {
        await updatePlanification({
          id: planificationId as any,
          name: data.name,
          description: data.description || undefined,
          folderId: data.folderId as any,
          isTemplate: data.isTemplate,
        })

        const originalWeekIds = (fullWeeksData || []).map((w: any) => w.id)
        for (const weekId of originalWeekIds) {
          await removeWorkoutWeek({ id: weekId as any })
        }

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

            const blockIdMap = new Map<string, string>()
            if (day.blocks && day.blocks.length > 0) {
              let blockOrder = 0
              for (let b = 0; b < day.blocks.length; b++) {
                const block = day.blocks[b]
                if (block.id === SIN_BLOQUE_ID) continue
                const realBlockId = await createExerciseBlock({
                  workoutDayId: dayId,
                  name: block.name,
                  order: blockOrder++,
                  notes: block.notes,
                })
                blockIdMap.set(block.id, realBlockId)
              }
            }

            const exercisesByBlock = new Map<string | null, any[]>()
            const unblockedExercises: any[] = []

            ;(day.exercises || []).forEach((ex: any) => {
              if (ex.blockId === SIN_BLOQUE_ID || !ex.blockId) {
                unblockedExercises.push(ex)
              } else if (blockIdMap.has(ex.blockId)) {
                const blockExercises = exercisesByBlock.get(ex.blockId) || []
                blockExercises.push(ex)
                exercisesByBlock.set(ex.blockId, blockExercises)
              } else {
                unblockedExercises.push(ex)
              }
            })

            let globalOrder = 0

            if (day.blocks) {
              for (const block of day.blocks) {
                if (block.id === SIN_BLOQUE_ID) continue
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

        setIsSaving(false)
        if (redirectAfterSave === 'edit') {
          router.push(`/dashboard/planifications/${planificationId}/edit`)
        } else {
          router.push(`/dashboard/planifications/${planificationId}`)
        }
      } catch (error) {
        console.error('Failed to update planification:', error)
        setIsSaving(false)
        toast.error('Error al actualizar la planificación')
      }
    },
    [
      planificationId,
      fullWeeksData,
      redirectAfterSave,
      updatePlanification,
      removeWorkoutWeek,
      createWorkoutWeek,
      createWorkoutDay,
      createExerciseBlock,
      createDayExercise,
      router,
    ]
  )

  const isLoading =
    planification === undefined ||
    workoutWeeks === undefined ||
    workoutDays === undefined ||
    allExercises === undefined ||
    fullWeeksData === null

  if (isLoading) {
    return (
      <div className="w-full py-6">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="w-full py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <>
      <BlocksLoader dayIds={dayIds} onBlocksLoaded={handleBlocksLoaded} />
      <PlanificationFormProvider
        form={form}
        planificationId={planificationId}
        originalWeekIds={(fullWeeksData || []).map((w: any) => w.id)}
        onSubmit={onSubmit}
        isSaving={isSaving}
        setRedirectAfterSave={setRedirectAfterSave}
      >
        {children}
      </PlanificationFormProvider>
    </>
  )
}

export default function EditPlanificationLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: React.ReactNode
}) {
  const { id } = use(params)
  return <EditFormShell planificationId={id}>{children}</EditFormShell>
}
