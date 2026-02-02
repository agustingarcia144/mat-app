'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface DayExercise {
  id: string
  exerciseId: string
  exerciseName: string
  sets: number
  reps: string
  weight?: string
  notes?: string
}

interface ExerciseFormRowProps {
  exercise: DayExercise
  onUpdate: (updates: Partial<DayExercise>) => void
  onRemove: () => void
}

export default function ExerciseFormRow({
  exercise,
  onUpdate,
  onRemove,
}: ExerciseFormRowProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{exercise.exerciseName}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-16">
          <Input
            type="number"
            min="1"
            value={exercise.sets}
            onChange={(e) => onUpdate({ sets: parseInt(e.target.value) || 1 })}
            placeholder="Sets"
            className="h-8 text-center"
          />
          <span className="text-xs text-muted-foreground text-center block mt-0.5">
            series
          </span>
        </div>

        <span className="text-muted-foreground">×</span>

        <div className="w-20">
          <Input
            value={exercise.reps}
            onChange={(e) => onUpdate({ reps: e.target.value })}
            placeholder="Reps"
            className="h-8 text-center"
          />
          <span className="text-xs text-muted-foreground text-center block mt-0.5">
            reps
          </span>
        </div>

        <div className="w-24">
          <Input
            value={exercise.weight || ''}
            onChange={(e) => onUpdate({ weight: e.target.value || undefined })}
            placeholder="Peso"
            className="h-8"
          />
          <span className="text-xs text-muted-foreground text-center block mt-0.5">
            peso
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
