'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  CheckCircle2,
  X,
  XCircle,
  CalendarPlus,
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { type Id } from '@/convex/_generated/dataModel'

export type ClassRow = {
  _id: Id<'classes'>
  name: string
  capacity: number
  isRecurring: boolean
  isActive: boolean
  trainerId?: string
  bookingWindowDays: number
  cancellationWindowHours: number
}

export interface ClassListColumnsProps {
  trainersMap: Map<string, string>
  deletingId: Id<'classes'> | null
  onEditClass: (classId: Id<'classes'>) => void
  onGenerateSchedules: (classItem: ClassRow) => void
  onToggleActive: (id: Id<'classes'>, currentActive: boolean) => void
  onDeleteClick: (classItem: ClassRow) => void
}

export function getClassListColumns({
  trainersMap,
  deletingId,
  onEditClass,
  onGenerateSchedules,
  onToggleActive,
  onDeleteClick,
}: ClassListColumnsProps): ColumnDef<ClassRow>[] {
  return [
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
          <Badge variant="dark" className="gap-1">
            <Check className="h-3 w-3 shrink-0 text-green-500" />
          </Badge>
        ) : (
          <Badge variant="dark" className="gap-1">
            <X className="h-3 w-3 shrink-0 text-red-500" />
          </Badge>
        ),
    },
    {
      accessorKey: 'bookingWindowDays',
      header: 'Ventana reserva',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.bookingWindowDays}{' '}
          {row.original.bookingWindowDays === 1 ? 'día' : 'días'}
        </span>
      ),
    },
    {
      accessorKey: 'cancellationWindowHours',
      header: 'Ventana cancelación',
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.cancellationWindowHours}{' '}
          {row.original.cancellationWindowHours === 1 ? 'hora' : 'horas'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="dark" className="gap-1">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
            Activa
          </Badge>
        ) : (
          <Badge variant="dark" className="gap-1">
            <XCircle className="h-3 w-3 shrink-0 text-red-500" />
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
              <DropdownMenuItem onClick={() => onGenerateSchedules(classItem)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Generar turnos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditClass(classItem._id)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onToggleActive(classItem._id, classItem.isActive)
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
                onClick={() => onDeleteClick(classItem)}
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
}
