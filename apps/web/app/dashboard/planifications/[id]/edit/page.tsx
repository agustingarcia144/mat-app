'use client'

import { use, useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import { deepEqual } from '@/lib/utils'
import PlanificationEditForm, {
  PLANIFICATION_UNSAVED_TOAST_ID,
} from '@/components/features/planifications/form/planification-edit-form'
import EditPlanificationDialog from '@/components/features/planifications/dialogs/edit-planification-dialog'

export default function EditPlanificationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  })

  // Get form context to check for unsaved changes
  const {
    form,
    initialFormValues,
    isNewPlanification,
  } = usePlanificationForm()
  
  // Subscribe to form values to detect changes
  form.watch()
  const hasChangesFromInitial =
    initialFormValues !== null &&
    !deepEqual(form.getValues(), initialFormValues)
  const hasUnsavedChanges = isNewPlanification || hasChangesFromInitial

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (hasUnsavedChanges) {
      setConfirmDialogOpen(true)
    } else {
      toast.dismiss(PLANIFICATION_UNSAVED_TOAST_ID)
      router.push(`/dashboard/planifications/${id}`)
    }
  }

  const handleConfirmNavigation = () => {
    toast.dismiss(PLANIFICATION_UNSAVED_TOAST_ID)
    setConfirmDialogOpen(false)
    router.push(`/dashboard/planifications/${id}`)
  }

  // Radix (e.g. DropdownMenu) can leave body with pointer-events: none when
  // closing during navigation, making the new page unclickable. Clear it on mount.
  useEffect(() => {
    const cleanup = () => {
      document.body.style.pointerEvents = ''
    }
    cleanup()
    return () => cleanup()
  }, [])

  if (planification === undefined) {
    return (
      <div className="w-full py-6">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="w-full py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={handleBackClick}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Descartar cambios?</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar. Si continúas, perderás todos los
              cambios realizados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmNavigation}>
              Descartar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="w-full p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">
              Editar planificación - {planification.name}
            </h1>
            <Button
              type="button"
              onClick={() => setEditDialogOpen(true)}
              aria-label="Editar información básica"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar información básica
            </Button>
          </div>
        </div>

        <EditPlanificationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
        <PlanificationEditForm />
      </div>
    </div>
  )
}
