import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/convex/_generated/api'
import { useMutation } from 'convex/react'
import React, { useState } from 'react'
import { PlanificationData } from '../library/planification-list'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

function DuplicatePlanificationDialog({
  open,
  onOpenChange,
  planification,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planification: PlanificationData
}) {
  const router = useRouter()
  const [isDuplicating, setIsDuplicating] = useState(false)
  const duplicatePlanification = useMutation(api.planifications.duplicate)

  const handleDuplicateConfirm = async () => {
    setIsDuplicating(true)
    try {
      const newId = await duplicatePlanification({
        id: planification._id as any,
      })
      onOpenChange(false)
      router.push(`/dashboard/planifications/${newId}`)
    } catch (error) {
      console.error('Failed to duplicate planification:', error)
      toast.error('Error al duplicar la planificación')
    } finally {
      setIsDuplicating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar planificación</DialogTitle>
          <DialogDescription>
            ¿Crear una copia de &quot;{planification.name}&quot;? Se creará una
            nueva planificación con el mismo contenido.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDuplicating}
          >
            Cancelar
          </Button>
          <Button onClick={handleDuplicateConfirm} disabled={isDuplicating}>
            {isDuplicating ? 'Duplicando...' : 'Duplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DuplicatePlanificationDialog
