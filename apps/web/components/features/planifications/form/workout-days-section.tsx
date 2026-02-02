'use client'

import { useState } from 'react'
import { Plus, GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ExerciseSelector from '@/components/features/planifications/exercises/exercise-selector'
import ExerciseFormRow from '@/components/features/planifications/form/exercise-form-row'

interface DayExercise {
  id: string
  exerciseId: string
  exerciseName: string
  sets: number
  reps: string
  weight?: string
  notes?: string
}

interface WorkoutDay {
  id: string
  name: string
  exercises: DayExercise[]
}

interface WorkoutDaysSectionProps {
  workoutDays: WorkoutDay[]
  setWorkoutDays: (days: WorkoutDay[]) => void
}

export default function WorkoutDaysSection({
  workoutDays,
  setWorkoutDays,
}: WorkoutDaysSectionProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const addDay = () => {
    const newDay: WorkoutDay = {
      id: `temp-${Date.now()}`,
      name: `Día ${workoutDays.length + 1}`,
      exercises: [],
    }
    setWorkoutDays([...workoutDays, newDay])
    setExpandedDays(new Set([...Array.from(expandedDays), newDay.id]))
  }

  const removeDay = (dayId: string) => {
    setWorkoutDays(workoutDays.filter((d) => d.id !== dayId))
  }

  const updateDayName = (dayId: string, name: string) => {
    setWorkoutDays(
      workoutDays.map((d) => (d.id === dayId ? { ...d, name } : d))
    )
  }

  const addExerciseToDay = (
    dayId: string,
    exercise: { id: string; name: string }
  ) => {
    setWorkoutDays(
      workoutDays.map((d) => {
        if (d.id !== dayId) return d
        return {
          ...d,
          exercises: [
            ...d.exercises,
            {
              id: `temp-ex-${Date.now()}`,
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              sets: 3,
              reps: '10',
              weight: undefined,
              notes: undefined,
            },
          ],
        }
      })
    )
  }

  const updateExercise = (
    dayId: string,
    exerciseId: string,
    updates: Partial<DayExercise>
  ) => {
    setWorkoutDays(
      workoutDays.map((d) => {
        if (d.id !== dayId) return d
        return {
          ...d,
          exercises: d.exercises.map((ex) =>
            ex.id === exerciseId ? { ...ex, ...updates } : ex
          ),
        }
      })
    )
  }

  const removeExercise = (dayId: string, exerciseId: string) => {
    setWorkoutDays(
      workoutDays.map((d) => {
        if (d.id !== dayId) return d
        return {
          ...d,
          exercises: d.exercises.filter((ex) => ex.id !== exerciseId),
        }
      })
    )
  }

  const toggleDayExpanded = (dayId: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(dayId)) {
      newExpanded.delete(dayId)
    } else {
      newExpanded.add(dayId)
    }
    setExpandedDays(newExpanded)
  }

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Días de entrenamiento</h2>
        <Button onClick={addDay} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Agregar día
        </Button>
      </div>

      {workoutDays.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No hay días agregados</p>
          <p className="text-sm">
            Haz clic en &quot;Agregar día&quot; para comenzar
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workoutDays.map((day) => {
            const isExpanded = expandedDays.has(day.id)
            return (
              <div key={day.id} className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  <Input
                    value={day.name}
                    onChange={(e) => updateDayName(day.id, e.target.value)}
                    className="flex-1"
                    placeholder="Nombre del día"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleDayExpanded(day.id)}
                  >
                    <span className="text-sm">{isExpanded ? '−' : '+'}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDay(day.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="space-y-2 ml-7">
                    {day.exercises.map((exercise) => (
                      <ExerciseFormRow
                        key={exercise.id}
                        exercise={exercise}
                        onUpdate={(updates) =>
                          updateExercise(day.id, exercise.id, updates)
                        }
                        onRemove={() => removeExercise(day.id, exercise.id)}
                      />
                    ))}

                    <ExerciseSelector
                      onSelect={(ex) => addExerciseToDay(day.id, ex)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
