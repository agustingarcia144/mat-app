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
import GenerateSchedulesDialog from './dialogs/generate-schedules-dialog'
import {
  getClassListColumns,
  type ClassRow,
} from './class-list-columns'
import { toast } from 'sonner'

interface ClassListProps {
  onEditClass: (classId: Id<'classes'>) => void
}

export default function ClassList({ onEditClass }: ClassListProps) {
  const classes = useQuery(api.classes.getByOrganization, {})
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
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [selectedClassForGenerate, setSelectedClassForGenerate] = useState<{
    id: Id<'classes'>
    name: string
    isRecurring: boolean
  } | null>(null)

  const trainersMap = useMemo(() => {
    const map = new Map<string, string>()
    memberships?.forEach((m) => {
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

  const handleGenerateSchedules = useCallback((classItem: ClassRow) => {
    setSelectedClassForGenerate({
      id: classItem._id,
      name: classItem.name,
      isRecurring: classItem.isRecurring,
    })
    setGenerateDialogOpen(true)
  }, [])

  const columns = useMemo(
    () =>
      getClassListColumns({
        trainersMap,
        deletingId,
        onEditClass,
        onGenerateSchedules: handleGenerateSchedules,
        onToggleActive: handleToggleActive,
        onDeleteClick: handleDeleteClick,
      }),
    [
      trainersMap,
      deletingId,
      onEditClass,
      handleGenerateSchedules,
      handleToggleActive,
      handleDeleteClick,
    ]
  )

  if (!classes) {
    return <div>Cargando...</div>
  }

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
              Se eliminarán todas las clases futuras programadas.
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

      {selectedClassForGenerate && (
        <GenerateSchedulesDialog
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          classId={selectedClassForGenerate.id}
          classTitle={selectedClassForGenerate.name}
          isRecurring={selectedClassForGenerate.isRecurring}
          onSuccess={() => {
            setSelectedClassForGenerate(null)
          }}
        />
      )}
    </div>
  )
}
