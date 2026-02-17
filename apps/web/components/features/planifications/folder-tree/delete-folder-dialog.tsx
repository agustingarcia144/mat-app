'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface DeleteFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId: string
  folderName: string
  onSuccess?: () => void
}

export default function DeleteFolderDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  onSuccess,
}: DeleteFolderDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const removeFolder = useMutation(api.folders.remove)

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      await removeFolder({ id: folderId as any })
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to delete folder:', error)
      toast.error('Error al eliminar la carpeta')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar carpeta</DialogTitle>
          <DialogDescription>
            ¿Eliminar &quot;{folderName}&quot;? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
