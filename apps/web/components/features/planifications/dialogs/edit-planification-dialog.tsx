'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { useEffect } from 'react'
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
import { usePlanificationForm } from '@/contexts/planification-form-context'
import { toast } from 'sonner'

export default function EditPlanificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { form: contextForm, planificationId, setInitialFormValues } =
    usePlanificationForm()
  const updatePlanification = useMutation(api.planifications.update)

  const form = useForm<PlanificationBasicInfo>({
    resolver: zodResolver(planificationBasicInfoSchema),
    defaultValues: {
      name: '',
      description: '',
      folderId: undefined,
      isTemplate: false,
    },
  })

  // Sync dialog form from context when dialog opens
  useEffect(() => {
    if (open) {
      const values = contextForm.getValues()
      form.reset({
        name: values.name,
        description: values.description ?? '',
        folderId: values.folderId,
        isTemplate: values.isTemplate,
      })
    }
  }, [open, contextForm, form])

  // Radix Dialog can leave body with pointer-events: none when closed (controlled from outside). Reset so the page stays clickable.
  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        document.body.style.pointerEvents = ''
      }, 0)
      return () => clearTimeout(id)
    }
  }, [open])

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await updatePlanification({
        id: planificationId as any,
        name: data.name,
        description: data.description || undefined,
        folderId: data.folderId as any,
        isTemplate: data.isTemplate,
      })
      contextForm.setValue('name', data.name)
      contextForm.setValue('description', data.description ?? '')
      contextForm.setValue('folderId', data.folderId)
      contextForm.setValue('isTemplate', data.isTemplate)
      setInitialFormValues(contextForm.getValues())
      onOpenChange(false)
      toast.success('Información básica actualizada')
    } catch (error) {
      console.error('Failed to update planification:', error)
      toast.error('Error al actualizar la planificación')
    }
  })

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar información básica</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <BasicInfoSection
            form={form as any}
            showCollapsibleIcon={false}
            isEditMode
          />
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
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
