'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type Id } from '@/convex/_generated/dataModel'
import {
  getClassListColumns,
  type ClassRow,
} from './class-list-columns'
import { toast } from 'sonner'

interface ClassListProps {
  classes: ClassRow[]
  onEditClass: (classId: Id<'classes'>) => void
  onOpenGenerateTurnos?: (classItem: ClassRow) => void
}

export default function ClassList({ classes, onEditClass, onOpenGenerateTurnos }: ClassListProps) {
  const removeClass = useMutation(api.classes.remove)
  const updateClass = useMutation(api.classes.update)
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const [deletingId, setDeletingId] = useState<Id<'classes'> | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [classToDelete, setClassToDelete] = useState<{
    id: Id<'classes'>
    name: string
  } | null>(null)

  const trainersMap = useMemo(() => {
    const map = new Map<string, string>()
    memberships?.forEach((m: { role: string; userId: string; fullName?: string; email?: string }) => {
      if (m.role === 'trainer') {
        map.set(m.userId, m.fullName || m.email || 'Entrenador')
      }
    })
    return map
  }, [memberships])

  const handleDeleteClick = useCallback((classItem: ClassRow) => {
    setClassToDelete({ id: classItem._id, name: classItem.name })
    setDeleteConfirmOpen(true)
  }, [])

  const handleDeleteConfirm = async () => {
    if (!classToDelete) return
    setDeletingId(classToDelete.id)
    setDeleteConfirmOpen(false)
    try {
      await removeClass({ id: classToDelete.id })
      toast.success('Clase eliminada correctamente')
    } catch (error) {
      console.error('Error deleting class:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al eliminar la clase'
      )
    } finally {
      setDeletingId(null)
      setClassToDelete(null)
    }
  }

  const handleToggleActive = useCallback(
    async (id: Id<'classes'>, currentActive: boolean) => {
      try {
        await updateClass({
          id,
          isActive: !currentActive,
        })
      } catch (error) {
        console.error('Error toggling active:', error)
        toast.error(
          error instanceof Error ? error.message : 'Error al actualizar la clase'
        )
      }
    },
    [updateClass]
  )

  const handleGenerateTurnos = useCallback(
    (classItem: ClassRow) => {
      if (onOpenGenerateTurnos) {
        onOpenGenerateTurnos(classItem)
      }
    },
    [onOpenGenerateTurnos]
  )

  const columns = useMemo(
    () =>
      getClassListColumns({
        trainersMap,
        deletingId,
        onEditClass,
        onGenerateSchedules: handleGenerateTurnos,
        onToggleActive: handleToggleActive,
        onDeleteClick: handleDeleteClick,
      }),
    [
      trainersMap,
      deletingId,
      onEditClass,
      handleGenerateTurnos,
      handleToggleActive,
      handleDeleteClick,
    ]
  )

  return (
    <div>
      <DataTable columns={columns} data={classes} />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setClassToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar clase</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar la clase &quot;{classToDelete?.name ?? ''}&quot;?
              Se eliminarán todos los turnos programados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deletingId !== null}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
