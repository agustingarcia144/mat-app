'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Copy, Eye, Pencil, Trash2 } from 'lucide-react'
import { type Id } from '@/convex/_generated/dataModel'

export type BatchRow = {
  _id: Id<'scheduleBatches'>
  className: string
  sourceType: 'single' | 'timeWindow'
  createdAt: number
  firstStartTime: number
  lastEndTime: number
  totalSchedules: number
  scheduledCount: number
  cancelledCount: number
  completedCount: number
  confirmedReservations: number
  attendedReservations: number
  noShowReservations: number
  canEdit: boolean
  canDelete: boolean
}

type BatchListColumnsProps = {
  deletingId: Id<'scheduleBatches'> | null
  removingEditableId: Id<'scheduleBatches'> | null
  onView: (batchId: Id<'scheduleBatches'>) => void
  onEdit: (batchId: Id<'scheduleBatches'>) => void
  onDuplicate: (batchId: Id<'scheduleBatches'>) => void
  onRemoveEditable: (batchId: Id<'scheduleBatches'>) => void
  onDelete: (batchId: Id<'scheduleBatches'>) => void
}

function getSourceTypeLabel(sourceType: BatchRow['sourceType']) {
  return sourceType === 'timeWindow' ? 'Ventana horaria' : 'Generacion simple'
}

function getEligibilityBadge(batch: BatchRow) {
  if (batch.canEdit && batch.canDelete) {
    return (
      <Badge variant='outline' className='gap-1'>
        Editable
      </Badge>
    )
  }

  return <Badge variant='secondary'>Bloqueado</Badge>
}

export function getBatchListColumns({
  deletingId,
  removingEditableId,
  onView,
  onEdit,
  onDuplicate,
  onRemoveEditable,
  onDelete,
}: BatchListColumnsProps): ColumnDef<BatchRow>[] {
  return [
    {
      accessorKey: 'className',
      header: 'Clase',
      cell: ({ row }) => (
        <div>
          <div className='font-medium'>{row.original.className}</div>
          <div className='text-xs text-muted-foreground'>
            {getSourceTypeLabel(row.original.sourceType)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Creado',
      cell: ({ row }) => (
        <span className='text-sm'>
          {format(new Date(row.original.createdAt), "d MMM yyyy, HH:mm", {
            locale: es,
          })}
        </span>
      ),
    },
    {
      id: 'range',
      header: 'Rango',
      cell: ({ row }) => (
        <div className='text-sm'>
          <div>
            {format(new Date(row.original.firstStartTime), "d MMM yyyy", {
              locale: es,
            })}
          </div>
          <div className='text-muted-foreground'>
            hasta{' '}
            {format(new Date(row.original.lastEndTime), "d MMM yyyy", {
              locale: es,
            })}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'totalSchedules',
      header: 'Turnos',
      cell: ({ row }) => (
        <div className='text-sm'>
          <div className='font-medium'>{row.original.totalSchedules}</div>
          <div className='text-muted-foreground'>
            {row.original.scheduledCount} activos / {row.original.cancelledCount}{' '}
            cancelados
          </div>
        </div>
      ),
    },
    {
      id: 'reservations',
      header: 'Reservas',
      cell: ({ row }) => (
        <div className='text-sm'>
          <div>{row.original.confirmedReservations} confirmadas</div>
          <div className='text-muted-foreground'>
            {row.original.attendedReservations} asist. /{' '}
            {row.original.noShowReservations} aus.
          </div>
        </div>
      ),
    },
    {
      id: 'eligibility',
      header: 'Estado',
      cell: ({ row }) => getEligibilityBadge(row.original),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const batch = row.original
        const isMutating =
          deletingId === batch._id || removingEditableId === batch._id

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='h-8 w-8 p-0'
                disabled={isMutating}
              >
                <span className='sr-only'>Abrir menú</span>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => onView(batch._id)}>
                <Eye className='mr-2 h-4 w-4' />
                Ver turnos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEdit(batch._id)}
                disabled={!batch.canEdit}
              >
                <Pencil className='mr-2 h-4 w-4' />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(batch._id)}>
                <Copy className='mr-2 h-4 w-4' />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRemoveEditable(batch._id)}
                disabled={batch.canDelete}
                className='text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Eliminar editables
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(batch._id)}
                disabled={!batch.canDelete}
                className='text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
