'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import BasicInfoSection from './basic-info-section'
import { planificationBasicInfoSchema, PlanificationBasicInfo } from '@repo/core/schemas'

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

  const form = useForm<PlanificationBasicInfo>({
    resolver: zodResolver(planificationBasicInfoSchema),
    defaultValues: {
      name: initialData.name,
      description: initialData.description || '',
      folderId: initialData.folderId,
      isTemplate: initialData.isTemplate,
    },
  })

  useEffect(() => {
    form.reset({
      name: initialData.name,
      description: initialData.description || '',
      folderId: initialData.folderId,
      isTemplate: initialData.isTemplate,
    })
  }, [initialData, form])

  const onSubmit = async (data: PlanificationBasicInfo) => {
    try {
      await updatePlanification({
        id: planificationId as any,
        name: data.name,
        description: data.description || undefined,
        folderId: data.folderId as any,
        isTemplate: data.isTemplate,
      })

      router.push(`/dashboard/planifications/${planificationId}`)
    } catch (error) {
      console.error('Failed to update planification:', error)
      alert('Error al actualizar la planificación')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <BasicInfoSection form={form} />

      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          La edición de días de entrenamiento y ejercicios estará disponible
          próximamente. Por ahora, solo puedes editar la información básica.
        </p>
      </div>

      <div className="flex gap-3 pt-6 border-t">
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || !form.formState.isValid}
        >
          {form.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
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
