'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import {
  planificationBasicInfoSchema,
  type PlanificationBasicInfo,
} from '@repo/core/schemas'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import BasicInfoSection from '@/components/features/planifications/form/basic-info-section'
import { toast } from 'sonner'

export default function CreatePlanificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const createPlanification = useMutation(api.planifications.create)

  const form = useForm<PlanificationBasicInfo>({
    resolver: zodResolver(planificationBasicInfoSchema),
    defaultValues: {
      name: '',
      description: '',
      folderId: undefined,
      isTemplate: false,
    },
  })

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const planificationId = await createPlanification({
        name: data.name,
        description: data.description || undefined,
        folderId: data.folderId as any,
        isTemplate: data.isTemplate,
      })
      onOpenChange(false)
      form.reset()
      router.push(`/dashboard/planifications/${planificationId}/edit`)
    } catch (error) {
      console.error('Failed to create planification:', error)
      toast.error('Error al crear la planificación')
    }
  })

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva planificación</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <BasicInfoSection form={form as any} showCollapsibleIcon={false} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid}
            >
              {isSubmitting ? 'Creando...' : 'Crear planificación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
