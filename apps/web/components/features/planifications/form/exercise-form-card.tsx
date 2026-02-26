'use client'

import { useState, useCallback } from 'react'
import { UseFormReturn } from 'react-hook-form'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { Field, FieldError } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlanificationForm } from '@repo/core/schemas'
import matWolfPlaceholder from '@/assets/mat-wolf-looking.png'

interface ExerciseFormCardProps {
  weekIndex: number
  dayIndex: number
  exerciseIndex: number
  form: UseFormReturn<PlanificationForm>
  onRemove: () => void
  /** Exercise ID to fetch thumbnail from Convex (optional) */
  exerciseId?: string | null
  /** Drag handle node to render at top of card (e.g. from SortableExerciseRow) */
  dragHandle?: React.ReactNode
}

function formatSetsRepsWeight(
  sets: number | undefined,
  reps: string | undefined,
  weight: string | undefined,
  timeSeconds: number | undefined
): string {
  const parts: string[] = []
  if (sets != null && !Number.isNaN(sets)) parts.push(`${sets} ×`)
  if (reps?.trim()) parts.push(reps.trim())
  const main = parts.join(' ')
  let suffix = ''
  if (weight?.trim()) suffix = ` · ${weight.trim()} kg`
  if (timeSeconds != null && timeSeconds > 0) {
    const mins = Math.floor(timeSeconds / 60)
    const secs = timeSeconds % 60
    const timeStr =
      mins > 0 && secs > 0
        ? `${mins} min ${secs} s`
        : mins > 0
          ? `${mins} min`
          : `${secs} s`
    suffix = suffix ? `${suffix} · ${timeStr}` : ` · ${timeStr}`
  }
  return (main || '—') + suffix
}

export default function ExerciseFormCard({
  weekIndex,
  dayIndex,
  exerciseIndex,
  form,
  onRemove,
  exerciseId,
  dragHandle,
}: ExerciseFormCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [localSets, setLocalSets] = useState<string>('')
  const [localReps, setLocalReps] = useState<string>('')
  const [localWeight, setLocalWeight] = useState<string>('')
  const [localTimeMinutes, setLocalTimeMinutes] = useState<string>('')
  const [localTimeSeconds, setLocalTimeSeconds] = useState<string>('')
  const [saveError, setSaveError] = useState<{
    sets?: string
    reps?: string
  } | null>(null)

  const exercise = form.watch(
    `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}`
  )

  const exerciseData = useQuery(
    api.exercises.getById,
    exerciseId ? { id: exerciseId as Id<'exercises'> } : 'skip'
  )
  const thumbnailUrl = exerciseData?.videoUrl
    ? getVideoThumbnailUrl(exerciseData.videoUrl)
    : null

  const basePath = `workoutWeeks.${weekIndex}.workoutDays.${dayIndex}.exercises.${exerciseIndex}`

  const openDialog = useCallback(() => {
    const values = form.getValues()
    const ex =
      values.workoutWeeks?.[weekIndex]?.workoutDays?.[dayIndex]?.exercises?.[
        exerciseIndex
      ]
    setLocalSets(ex?.sets != null ? String(ex.sets) : '')
    setLocalReps(ex?.reps ?? '')
    setLocalWeight(ex?.weight ?? '')
    const ts = ex?.timeSeconds
    if (ts != null && ts > 0) {
      setLocalTimeMinutes(String(Math.floor(ts / 60)))
      setLocalTimeSeconds(String(ts % 60))
    } else {
      setLocalTimeMinutes('')
      setLocalTimeSeconds('')
    }
    setSaveError(null)
    setDialogOpen(true)
  }, [form, weekIndex, dayIndex, exerciseIndex])

  const handleSave = () => {
    setSaveError(null)
    const setsTrimmed = localSets?.trim() ?? ''
    const setsNum =
      setsTrimmed === '' ? NaN : parseInt(setsTrimmed, 10)
    const repsTrimmed = localReps?.trim() ?? ''
    const errors: { sets?: string; reps?: string } = {}
    if (setsTrimmed === '' || Number.isNaN(setsNum) || setsNum < 1) {
      errors.sets = 'Debe tener al menos 1 serie'
    }
    const mins = Math.max(0, Math.floor(Number(localTimeMinutes?.trim()) || 0))
    const secs = Math.max(
      0,
      Math.min(59, Math.floor(Number(localTimeSeconds?.trim()) || 0))
    )
    const hasTime = mins > 0 || secs > 0
    if (!repsTrimmed && !hasTime) {
      errors.reps = 'Las repeticiones son requeridas'
    }
    if (Object.keys(errors).length > 0) {
      setSaveError(errors)
      return
    }
    form.setValue(`${basePath}.sets` as any, setsNum, { shouldDirty: true })
    form.setValue(`${basePath}.reps` as any, repsTrimmed, { shouldDirty: true })
    form.setValue(`${basePath}.weight` as any, localWeight?.trim() ?? '', {
      shouldDirty: true,
    })
    const timeSecondsToSave =
      hasTime ? mins * 60 + secs : undefined
    form.setValue(`${basePath}.timeSeconds` as any, timeSecondsToSave, {
      shouldDirty: true,
    })
    form.trigger(`${basePath}` as any).catch(() => {})
    setDialogOpen(false)
  }

  const summaryText = formatSetsRepsWeight(
    exercise?.sets,
    exercise?.reps,
    exercise?.weight,
    exercise?.timeSeconds
  )

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openDialog}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openDialog()
          }
        }}
        className="w-full shrink-0 flex flex-col rounded-lg overflow-hidden border border-border bg-card transition-colors aspect-square relative cursor-pointer hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {dragHandle}
        {/* Remove button: top right of card */}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1 right-1 z-10 h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1 min-h-0 relative bg-muted backface-hidden transform-[translateZ(0)]">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={`Miniatura de ${exercise?.exerciseName ?? 'ejercicio'}`}
              fill
              className="object-cover"
              sizes="176px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 p-4">
              <Image
                src={matWolfPlaceholder}
                alt="Sin miniatura"
                fill
                className="object-contain"
                sizes="176px"
              />
            </div>
          )}
        </div>
        <div className="p-2 shrink-0 border-t">
          <h4 className="font-medium text-xs truncate mb-1">
            {exercise?.exerciseName}
          </h4>
          <p className="text-[11px] text-muted-foreground">{summaryText}</p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar ejercicio</DialogTitle>
            <DialogDescription>{exercise?.exerciseName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {thumbnailUrl && (
              <div className="relative h-64 w-full rounded-md overflow-hidden bg-muted">
                <Image
                  src={thumbnailUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 512px) 100vw, 28rem"
                />
              </div>
            )}

            <div className="grid gap-4">
              <Field data-invalid={!!saveError?.sets}>
                <label className="text-sm font-medium block mb-1.5">
                  Series
                </label>
                <Input
                  type="number"
                  value={localSets}
                  onChange={(e) => setLocalSets(e.target.value)}
                  placeholder="Series"
                  className="h-9"
                  min={1}
                />
                {saveError?.sets && (
                  <FieldError errors={[{ message: saveError.sets }]} />
                )}
              </Field>
              <Field data-invalid={!!saveError?.reps}>
                <label className="text-sm font-medium block mb-1.5">Reps</label>
                <Input
                  value={localReps}
                  onChange={(e) => setLocalReps(e.target.value)}
                  placeholder="Repeticiones"
                  className="h-9"
                />
                {saveError?.reps && (
                  <FieldError errors={[{ message: saveError.reps }]} />
                )}
              </Field>
              <Field>
                <label className="text-sm font-medium block mb-1.5">
                  Peso (kg)
                </label>
                <Input
                  value={localWeight}
                  onChange={(e) => setLocalWeight(e.target.value)}
                  placeholder="Opcional"
                  className="h-9"
                />
              </Field>
              <Field>
                <label className="text-sm font-medium block mb-1.5">
                  Tiempo
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      min={0}
                      value={localTimeMinutes}
                      onChange={(e) => setLocalTimeMinutes(e.target.value)}
                      placeholder="0"
                      className="h-9 w-20"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">
                      min
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={localTimeSeconds}
                      onChange={(e) => setLocalTimeSeconds(e.target.value)}
                      placeholder="0"
                      className="h-9 w-20"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">
                      seg
                    </span>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
