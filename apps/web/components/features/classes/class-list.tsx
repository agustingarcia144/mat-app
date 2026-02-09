'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, CheckCircle2, XCircle, CalendarPlus } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { type Id } from '@/convex/_generated/dataModel'
import GenerateSchedulesDialog from './dialogs/generate-schedules-dialog'

interface ClassListProps {
  onEditClass: (classId: Id<'classes'>) => void
}

type ClassRow = {
  _id: Id<'classes'>
  name: string
  capacity: number
  isRecurring: boolean
  isActive: boolean
  trainerId?: string
  bookingWindowDays: number
  cancellationWindowHours: number
}

export default function ClassList({ onEditClass }: ClassListProps) {
  const classes = useQuery(api.classes.getByOrganization, {})
  const removeClass = useMutation(api.classes.remove)
  const updateClass = useMutation(api.classes.update)
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const [deletingId, setDeletingId] = useState<Id<'classes'> | null>(null)
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

  const handleDelete = async (id: Id<'classes'>) => {
    if (!confirm('¿Estás seguro de eliminar esta clase? Se eliminarán todas las clases futuras programadas.')) {
      return
    }
    setDeletingId(id)
    try {
      await removeClass({ id })
    } catch (error) {
      console.error('Error deleting class:', error)
      alert(error instanceof Error ? error.message : 'Error al eliminar la clase')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (id: Id<'classes'>, currentActive: boolean) => {
    try {
      await updateClass({
        id,
        isActive: !currentActive,
      })
    } catch (error) {
      console.error('Error toggling active:', error)
      alert(error instanceof Error ? error.message : 'Error al actualizar la clase')
    }
  }

  const handleGenerateSchedules = (classItem: ClassRow) => {
    setSelectedClassForGenerate({
      id: classItem._id,
      name: classItem.name,
      isRecurring: classItem.isRecurring,
    })
    setGenerateDialogOpen(true)
  }

  const columns: ColumnDef<ClassRow>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.trainerId && (
            <div className="text-xs text-muted-foreground">
              {trainersMap.get(row.original.trainerId)}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'capacity',
      header: 'Capacidad',
      cell: ({ row }) => (
        <span className="font-mono">{row.original.capacity}</span>
      ),
    },
    {
      accessorKey: 'isRecurring',
      header: 'Recurrente',
      cell: ({ row }) =>
        row.original.isRecurring ? (
          <Badge variant="default">Sí</Badge>
        ) : (
          <Badge variant="secondary">No</Badge>
        ),
    },
    {
      accessorKey: 'bookingWindowDays',
      header: 'Ventana reserva',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.bookingWindowDays} {row.original.bookingWindowDays === 1 ? 'día' : 'días'}
        </span>
      ),
    },
    {
      accessorKey: 'cancellationWindowHours',
      header: 'Ventana cancelación',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.cancellationWindowHours} {row.original.cancellationWindowHours === 1 ? 'hora' : 'horas'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Activa
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            Inactiva
          </Badge>
        ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const classItem = row.original
        const isDeleting = deletingId === classItem._id

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                disabled={isDeleting}
              >
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleGenerateSchedules(classItem)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Generar Horarios
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditClass(classItem._id)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleToggleActive(classItem._id, classItem.isActive)
                }
              >
                {classItem.isActive ? (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Desactivar
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Activar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(classItem._id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  if (!classes) {
    return <div>Cargando...</div>
  }

  return (
    <div>
      <DataTable columns={columns} data={classes} />
      
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
