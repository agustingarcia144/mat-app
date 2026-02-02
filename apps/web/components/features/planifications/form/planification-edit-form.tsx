'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from './basic-info-section'
import WorkoutDaysSection from './workout-days-section'

interface PlanificationEditFormProps {
  planificationId: string
  initialData: any
}

export default function PlanificationEditForm({
  planificationId,
  initialData,
}: PlanificationEditFormProps) {
  const router = useRouter()
  const updatePlanification = useMutation(api.planifications.update)
  const workoutDaysData = useQuery(api.workoutDays.getByPlanification, {
    planificationId: planificationId as any,
  })

  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(initialData.name)
  const [description, setDescription] = useState(initialData.description || '')
  const [folderId, setFolderId] = useState<string | undefined>(
    initialData.folderId
  )
  const [isTemplate, setIsTemplate] = useState(initialData.isTemplate)

  const handleSubmit = async () => {
    if (!name.trim()) return

    setLoading(true)
    try {
      await updatePlanification({
        id: planificationId as any,
        name: name.trim(),
        description: description.trim() || undefined,
        folderId: folderId as any,
        isTemplate,
      })

      router.push(`/dashboard/planifications/${planificationId}`)
    } catch (error) {
      console.error('Failed to update planification:', error)
      alert('Error al actualizar la planificación')
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

      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          La edición de días de entrenamiento y ejercicios estará disponible
          próximamente. Por ahora, solo puedes editar la información básica.
        </p>
      </div>

      <div className="flex gap-3 pt-6 border-t">
        <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
          {loading ? 'Guardando...' : 'Guardar cambios'}
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
