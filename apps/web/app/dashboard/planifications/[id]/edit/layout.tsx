'use client'

import { use, useMemo, useEffect, useRef, useState, useCallback } from 'react'
import type { Doc } from '@/convex/_generated/dataModel'
import { useQuery, useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { useForm, useFormState } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  planificationFormSchema,
  PlanificationForm as PlanificationFormType,
} from '@repo/core/schemas'
import { PlanificationFormProvider } from '@/contexts/planification-form-context'
import { useUnsavedChanges } from '@/contexts/unsaved-changes-context'
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

  const saveFull = useMutation(api.planifications.saveFull)

  const fullWeeksData = useMemo(() => {
    if (!workoutWeeks || !workoutDays || !allExercises) return null
    const exercisesByDay: Record<string, any[]> = {}
    allExercises.forEach((ex: Doc<'dayExercises'> & { exercise?: { name: string } | null }) => {
      const dayId = ex.workoutDayId
      if (!exercisesByDay[dayId]) exercisesByDay[dayId] = []
      exercisesByDay[dayId].push(ex)
    })
    const weeks = workoutWeeks.map((week: Doc<'workoutWeeks'>) => {
      const daysForWeek = workoutDays.filter((day: Doc<'workoutDays'>) => day.weekId === week._id)
      const daysWithExercises = daysForWeek.map((day: Doc<'workoutDays'>) => {
        const dayExercises = exercisesByDay[day._id] || []
        return {
          id: day._id,
          name: day.name,
          order: day.order,
          dayOfWeek: day.dayOfWeek ?? 1,
          blocks: [] as any[],
          exercises: dayExercises.map((ex: Doc<'dayExercises'> & { exercise?: { name: string } | null }) => ({
            id: ex._id,
            exerciseId: ex.exerciseId,
            exerciseName: ex.exercise?.name || 'Unknown',
            blockId: ex.blockId,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight || '',
            prPercentage: ex.prPercentage,
            timeSeconds: ex.timeSeconds,
            notes: ex.notes || '',
          })),
        }
      })
      return {
        id: week._id,
        name: week.name,
        order: week.order,
        workoutDays: daysWithExercises.sort((a: { order: number }, b: { order: number }) => a.order - b.order),
      }
    })
    return weeks.sort((a: { order: number }, b: { order: number }) => a.order - b.order)
  }, [workoutWeeks, workoutDays, allExercises])

  const [blocksByDay, setBlocksByDay] = useState<Map<string, any[]>>(new Map())
  const blocksLoadedRef = useRef(false)
  const hasInitialized = useRef(false)

  const dayIds = useMemo(
    () =>
      (fullWeeksData || [])
        .flatMap((week: any) =>
          (week.workoutDays || []).map((day: any) => day.id)
        )
        .filter(
          (id: string) => typeof id === 'string' && !id.startsWith('temp-')
        ),
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

  // Minimal defaultValues so the form baseline is set only via reset() in the effect.
  // This ensures isDirty is correct after create+redirect (single source of truth).
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
  const { isDirty } = useFormState({ control: form.control })
  const editFlowBasePath = useMemo(
    () => `/dashboard/planifications/${planificationId}/edit`,
    [planificationId]
  )
  const shouldBlockNavigationOutsideEditFlow = useCallback(
    (targetPath: string) => {
      return !(
        targetPath === editFlowBasePath ||
        targetPath.startsWith(`${editFlowBasePath}/`) ||
        targetPath.startsWith(`${editFlowBasePath}?`)
      )
    },
    [editFlowBasePath]
  )
  const { setSaveHandler: setUnsavedSaveHandler, allowNextNavigation } =
    useUnsavedChanges({
      dirty: isDirty,
      isSaving,
      shouldBlockNavigation: shouldBlockNavigationOutsideEditFlow,
    })

  useEffect(() => {
    if (!planification || hasInitialized.current) return
    // fullWeeksDataWithBlocks is null while loading; [] for new planification (no weeks). Both are "data ready" when not null.
    if (fullWeeksDataWithBlocks === null) return
    // When there are no days, we don't wait for BlocksLoader (it never fires when dayIds is empty)
    if (dayIds.length > 0 && !blocksLoadedRef.current) return
    hasInitialized.current = true
    const serverValues = {
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
    }
    form.reset(serverValues, { keepDefaultValues: false })
  }, [planification, fullWeeksDataWithBlocks, form, dayIds.length])

  const onSubmit = useCallback(
    async (data: PlanificationFormType) => {
      setIsSaving(true)
      try {
        // Flatten form data into the shape expected by saveFull.
        // Exercises must be pre-ordered: block exercises first (in block
        // order), then unblocked exercises — matching the previous
        // sequential-save behaviour.
        const workoutWeeks = data.workoutWeeks.map((week) => ({
          name: week.name,
          workoutDays: ((week as any).workoutDays || []).map((day: any) => {
            const realBlocks = (day.blocks || []).filter(
              (b: any) => b.id !== SIN_BLOQUE_ID
            )

            // Build ordered exercises list: block exercises in block order, then unblocked
            const orderedExercises: any[] = []
            const exerciseList: any[] = day.exercises || []

            for (const block of realBlocks) {
              for (const ex of exerciseList) {
                if (ex.blockId === block.id) {
                  orderedExercises.push({ ...ex, blockClientId: block.id })
                }
              }
            }
            for (const ex of exerciseList) {
              if (!ex.blockId || ex.blockId === SIN_BLOQUE_ID) {
                orderedExercises.push({ ...ex, blockClientId: undefined })
              } else if (!realBlocks.some((b: any) => b.id === ex.blockId)) {
                orderedExercises.push({ ...ex, blockClientId: undefined })
              }
            }

            return {
              name: day.name,
              dayOfWeek: day.dayOfWeek,
              blocks: realBlocks.map((b: any) => ({
                clientId: b.id,
                name: b.name,
                notes: b.notes,
              })),
              exercises: orderedExercises.map((ex: any) => ({
                exerciseId: ex.exerciseId,
                blockClientId: ex.blockClientId,
                sets: ex.sets,
                reps: ex.reps,
                weight: ex.weight,
                prPercentage: ex.prPercentage,
                timeSeconds: ex.timeSeconds,
                notes: ex.notes,
              })),
            }
          }),
        }))

        await saveFull({
          id: planificationId as any,
          name: data.name,
          description: data.description || undefined,
          folderId: data.folderId as any,
          isTemplate: data.isTemplate,
          workoutWeeks,
        })

        setIsSaving(false)
        form.reset(data, { keepDefaultValues: false })
        const nextPath =
          redirectAfterSave === 'edit'
            ? `/dashboard/planifications/${planificationId}/edit`
            : `/dashboard/planifications/${planificationId}`
        allowNextNavigation(nextPath)
        router.push(nextPath)
      } catch (error) {
        console.error('Failed to update planification:', error)
        setIsSaving(false)
        toast.error('Error al actualizar la planificación')
      }
    },
    [
      planificationId,
      form,
      redirectAfterSave,
      saveFull,
      allowNextNavigation,
      router,
    ]
  )

  const handleSaveFromToast = useCallback(
    () => form.handleSubmit(onSubmit)(),
    [form, onSubmit]
  )

  useEffect(() => {
    setUnsavedSaveHandler(handleSaveFromToast)
    return () => {
      setUnsavedSaveHandler(null)
    }
  }, [handleSaveFromToast, setUnsavedSaveHandler])

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
  return (
    <EditFormShell key={id} planificationId={id}>
      {children}
    </EditFormShell>
  )
}
