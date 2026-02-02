'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from '@/components/features/planifications/form/basic-info-section'
import WorkoutDaysSection from '@/components/features/planifications/form/workout-days-section'

interface WorkoutDay {
  id: string
  name: string
  exercises: DayExercise[]
}

interface DayExercise {
  id: string
  exerciseId: string
  exerciseName: string
  sets: number
  reps: string
  weight?: string
  notes?: string
}

export default function PlanificationForm() {
  const router = useRouter()
  const createPlanification = useMutation(api.planifications.create)
  const createWorkoutDay = useMutation(api.workoutDays.create)
  const createDayExercise = useMutation(api.dayExercises.create)

  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderId, setFolderId] = useState<string | undefined>()
  const [isTemplate, setIsTemplate] = useState(false)
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([])

  const handleSubmit = async () => {
    if (!name.trim()) return

    setLoading(true)
    try {
      // Create planification
      const planificationId = await createPlanification({
        name: name.trim(),
        description: description.trim() || undefined,
        folderId: folderId as any,
        isTemplate,
      })

      // Create workout days and exercises
      for (let i = 0; i < workoutDays.length; i++) {
        const day = workoutDays[i]
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <BasicInfoSection
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        folderId={folderId}
        setFolderId={setFolderId}
        isTemplate={isTemplate}
        setIsTemplate={setIsTemplate}
      />

      <WorkoutDaysSection
        workoutDays={workoutDays}
        setWorkoutDays={setWorkoutDays}
      />

      <div className="flex gap-3 pt-6 border-t">
        <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
          {loading ? 'Creando...' : 'Crear planificación'}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
