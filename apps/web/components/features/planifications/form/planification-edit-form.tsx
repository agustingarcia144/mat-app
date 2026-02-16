'use client'

import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import { deepEqual } from '@/lib/utils'
import BasicInfoSection from './basic-info-section'
import WorkoutWeeksSection from './workout-weeks-section'

const toastId = 'planification-unsaved-changes'
const dayToastId = 'day-unsaved-changes'

export default function PlanificationEditForm() {
  const {
    form,
    onSubmit,
    isSaving,
    initialFormValues,
    isNewPlanification,
    setRedirectAfterSave,
  } = usePlanificationForm()
  // Subscribe to all form values so we re-render when anything changes.
  form.watch()
  const hasChangesFromInitial =
    initialFormValues !== null &&
    !deepEqual(form.getValues(), initialFormValues)
  // New planification: always show toast. Existing: only when there are actual changes.
  const hasUnsavedChanges = isNewPlanification || hasChangesFromInitial

  const handleSave = useCallback(
    () =>
      form.handleSubmit(async (data) => {
        await onSubmit(data)
        toast.dismiss(toastId)
      })(),
    [form, onSubmit]
  )

  useEffect(() => {
    setRedirectAfterSave('view')
    return () => setRedirectAfterSave('view')
  }, [setRedirectAfterSave])

  useEffect(() => {
    if (hasUnsavedChanges) {
      toast.dismiss(dayToastId)
      toast.message('Tienes cambios sin guardar', {
        id: toastId,
        position: 'bottom-center',
        duration: Infinity,
        dismissible: false,
        action: {
          label: isSaving ? 'Guardando…' : 'Guardar cambios',
          onClick: () => {
            if (!isSaving) handleSave()
          },
        },
      })
    } else {
      toast.dismiss(toastId)
    }
  }, [hasUnsavedChanges, isSaving, handleSave])

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
