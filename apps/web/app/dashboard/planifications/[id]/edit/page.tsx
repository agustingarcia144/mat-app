'use client'

import { use, useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import PlanificationEditForm from '@/components/features/planifications/form/planification-edit-form'
import EditPlanificationDialog from '@/components/features/planifications/dialogs/edit-planification-dialog'
import { useUnsavedNavigationGuard } from '@/contexts/unsaved-changes-context'

export default function EditPlanificationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { requestNavigation } = useUnsavedNavigationGuard()
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  })

  const handleBackClick = () => {
    const targetPath = `/dashboard/planifications/${id}`
    if (!requestNavigation(targetPath)) return
    router.push(targetPath)
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
