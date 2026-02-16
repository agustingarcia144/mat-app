'use client'

import { useCallback, useEffect } from 'react'
import { useFormState } from 'react-hook-form'
import { toast } from 'sonner'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import BasicInfoSection from './basic-info-section'
import WorkoutWeeksSection from './workout-weeks-section'

export default function PlanificationEditForm() {
  const { form, onSubmit, isSaving } = usePlanificationForm()
  // useFormState subscribes to form state so we re-render when isDirty (or other state) changes.
  // Reading form.formState.isDirty in a context consumer doesn't always trigger re-renders when
  // nested fields are updated via setValue in child components; useFormState fixes that.
  const { isDirty } = useFormState({ control: form.control })

  const handleSave = useCallback(
    () => form.handleSubmit(onSubmit)(),
    [form, onSubmit]
  )

  const toastId = 'planification-unsaved-changes'
  useEffect(() => {
    if (isDirty) {
      toast.message('Tienes cambios sin guardar', {
        id: toastId,
        position: 'bottom-center',
        duration: Infinity,
        dismissible: false,
        action: {
          label: isSaving ? 'Guardando…' : 'Guardar cambios',
          onClick: () => {
            if (!isSaving) {
              toast.dismiss(toastId)
              handleSave()
            }
          },
        },
      })
    } else {
      toast.dismiss(toastId)
    }
  }, [isDirty, isSaving, handleSave])

  useEffect(() => {
    return () => {
      toast.dismiss(toastId)
    }
  }, [])

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <BasicInfoSection
        form={form as React.ComponentProps<typeof BasicInfoSection>['form']}
      />

      <WorkoutWeeksSection
        form={form as React.ComponentProps<typeof WorkoutWeeksSection>['form']}
      />
    </form>
  )
}
