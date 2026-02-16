'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { PlanificationForm } from '@repo/core/schemas'

type RedirectAfterSave = 'view' | 'edit'

type PlanificationFormContextValue = {
  form: UseFormReturn<PlanificationForm> | null
  planificationId: string | null
  /** Original week IDs from API (for submit: delete these before creating from form) */
  originalWeekIds: string[]
  onSubmit: (data: PlanificationForm) => Promise<void>
  isSaving: boolean
  /** When 'view', redirect to planification view after save; when 'edit', redirect to edit page. Day page sets 'edit'. */
  setRedirectAfterSave: (to: RedirectAfterSave) => void
  /** Initial form values (set after reset in layout). Used for reliable unsaved-changes detection. */
  initialFormValues: PlanificationForm | null
  /** Set initial form values (call from layout after form.reset). */
  setInitialFormValues: (values: PlanificationForm) => void
  /** True when planification was just created (no weeks from server). Show unsaved toast always. */
  isNewPlanification: boolean
}

const PlanificationFormContext = createContext<PlanificationFormContextValue>({
  form: null,
  planificationId: null,
  originalWeekIds: [],
  onSubmit: async () => {},
  isSaving: false,
  setRedirectAfterSave: () => {},
  initialFormValues: null,
  setInitialFormValues: () => {},
  isNewPlanification: false,
})

export function usePlanificationForm(): {
  form: UseFormReturn<PlanificationForm>
  planificationId: string
  originalWeekIds: string[]
  onSubmit: (data: PlanificationForm) => Promise<void>
  isSaving: boolean
  setRedirectAfterSave: (to: RedirectAfterSave) => void
  initialFormValues: PlanificationForm | null
  setInitialFormValues: (values: PlanificationForm) => void
  isNewPlanification: boolean
} {
  const ctx = useContext(PlanificationFormContext)
  if (!ctx.form || ctx.planificationId == null) {
    throw new Error(
      'usePlanificationForm must be used within PlanificationFormProvider'
    )
  }
  return {
    form: ctx.form,
    planificationId: ctx.planificationId,
    originalWeekIds: ctx.originalWeekIds,
    onSubmit: ctx.onSubmit,
    isSaving: ctx.isSaving,
    setRedirectAfterSave: ctx.setRedirectAfterSave,
    initialFormValues: ctx.initialFormValues,
    setInitialFormValues: ctx.setInitialFormValues,
    isNewPlanification: ctx.isNewPlanification,
  }
}

export function usePlanificationFormOptional() {
  return useContext(PlanificationFormContext)
}

export function PlanificationFormProvider({
  form,
  planificationId,
  originalWeekIds,
  onSubmit,
  isSaving,
  setRedirectAfterSave,
  initialFormValues,
  setInitialFormValues,
  isNewPlanification,
  children,
}: {
  form: UseFormReturn<PlanificationForm>
  planificationId: string
  originalWeekIds: string[]
  onSubmit: (data: PlanificationForm) => Promise<void>
  isSaving: boolean
  setRedirectAfterSave: (to: RedirectAfterSave) => void
  initialFormValues: PlanificationForm | null
  setInitialFormValues: (values: PlanificationForm) => void
  isNewPlanification: boolean
  children: ReactNode
}) {
  return (
    <PlanificationFormContext.Provider
      value={{
        form,
        planificationId,
        originalWeekIds,
        onSubmit,
        isSaving,
        setRedirectAfterSave,
        initialFormValues,
        setInitialFormValues,
        isNewPlanification,
      }}
    >
      {children}
    </PlanificationFormContext.Provider>
  )
}
