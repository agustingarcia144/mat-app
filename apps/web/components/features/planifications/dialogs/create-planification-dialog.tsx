'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, startTransition } from 'react'
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
import type { Id } from '@/convex/_generated/dataModel'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

type InitialTemplate = { name: string; description?: string }

export default function CreatePlanificationDialog({
  open,
  onOpenChange,
  folderId,
  templateId: templateIdProp,
  initialTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId?: string
  templateId?: string
  initialTemplate?: InitialTemplate
}) {
  const router = useRouter()
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const createPlanification = useMutation(api.planifications.create)
  const createFromTemplate = useMutation(api.planifications.createFromTemplate)
  const templateFromQuery = useQuery(
    api.planifications.getById,
    open && templateIdProp && canQueryCurrentOrganization
      ? { id: templateIdProp as Id<'planifications'> }
      : 'skip'
  )

  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | '__none__' | undefined
  >(undefined)

  const templateId =
    selectedTemplateId === '__none__'
      ? undefined
      : selectedTemplateId ?? templateIdProp
  const createFromTemplateMode = Boolean(templateId)
  const resolvedInitialTemplate =
    initialTemplate ??
    (templateIdProp && templateFromQuery
      ? { name: templateFromQuery.name, description: templateFromQuery.description }
      : undefined)

  const form = useForm<PlanificationBasicInfo>({
    resolver: zodResolver(planificationBasicInfoSchema),
    defaultValues: {
      name: '',
      description: '',
      folderId: undefined,
      isTemplate: false,
    },
  })

  // Reset form when dialog opens or props change
  useEffect(() => {
    if (open) {
      const name = resolvedInitialTemplate?.name ?? ''
      const description = resolvedInitialTemplate?.description ?? ''
      form.reset({
        name,
        description,
        folderId: (folderId as any) ?? undefined,
        isTemplate: false,
      })
      if (!templateIdProp) {
        startTransition(() => setSelectedTemplateId(undefined))
      }
    }
  }, [
    open,
    folderId,
    form,
    resolvedInitialTemplate?.name,
    resolvedInitialTemplate?.description,
    templateIdProp,
  ])

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      if (createFromTemplateMode && templateId) {
        const planificationId = await createFromTemplate({
          templateId: templateId as Id<'planifications'>,
          name: data.name,
          description: data.description || undefined,
          folderId: data.folderId as Id<'folders'> | undefined,
        })
        onOpenChange(false)
        form.reset()
        router.push(`/dashboard/planifications/${planificationId}/edit`)
      } else {
        const planificationId = await createPlanification({
          name: data.name,
          description: data.description || undefined,
          folderId: data.folderId as any,
          isTemplate: data.isTemplate,
        })
        onOpenChange(false)
        form.reset()
        router.push(`/dashboard/planifications/${planificationId}/edit`)
      }
    } catch (error) {
      console.error('Failed to create planification:', error)
      toast.error('Error al crear la planificación')
    }
  })

  const handleTemplateChange = (
    templateId: string,
    template?: { name: string; description?: string }
  ) => {
    setSelectedTemplateId(templateId === '__none__' ? '__none__' : templateId)
    form.setValue('name', template?.name ?? '')
    form.setValue('description', template?.description ?? '')
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelectedTemplateId(undefined)
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva planificación</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <BasicInfoSection
            form={form as any}
            showCollapsibleIcon={false}
            createFromTemplate={createFromTemplateMode}
            showTemplateSelector
            selectedTemplateId={templateId}
            onTemplateChange={handleTemplateChange}
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
              {isSubmitting ? 'Creando...' : 'Crear planificación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
