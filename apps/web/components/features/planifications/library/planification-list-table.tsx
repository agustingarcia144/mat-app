'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Calendar, MoreVertical } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from 'date-fns'
import DuplicatePlanificationDialog from '../dialogs/duplicate-planification-dialog'
import DeletePlanificationDialog from '../dialogs/delete-planification-dialog'
import type { PlanificationData } from './planification-list'

interface PlanificationListTableProps {
  planifications: PlanificationData[]
  isLoading: boolean
}

function PlanificationTableRow({
  planification,
}: {
  planification: PlanificationData
}) {
  const router = useRouter()
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() =>
          router.push(`/dashboard/planifications/${planification._id}`)
        }
      >
        <TableCell>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium truncate">{planification.name}</p>
              {planification.description && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {planification.description}
                </p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(planification.createdAt, 'dd/MM/yyyy')}
          </span>
        </TableCell>
        <TableCell>
          {planification.isTemplate ? (
            <Badge variant="secondary" className="text-xs">
              Plantilla
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>
        <TableCell className="w-[50px] pr-2" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/planifications/${planification._id}/edit`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setDuplicateDialogOpen(true)
                }}
              >
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteDialogOpen(true)
                }}
                className="text-destructive"
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <DuplicatePlanificationDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        planification={planification}
      />

      <DeletePlanificationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planification={planification}
      />
    </>
  )
}

function PlanificationTableSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-8" />
      </TableCell>
    </TableRow>
  )
}

export default function PlanificationListTable({
  planifications,
  isLoading,
}: PlanificationListTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha de creación</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <PlanificationTableSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (planifications.length === 0) {
    return (
      <Empty className="h-full w-full rounded-md border">
        <EmptyHeader>
          <EmptyMedia>
            <Image
              src={matWolfLooking}
              alt=""
              className="h-20 w-20 object-contain"
            />
          </EmptyMedia>
          <EmptyTitle>No hay planificaciones</EmptyTitle>
          <EmptyDescription>
            Crea tu primera planificación para comenzar
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Fecha de creación</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {planifications.map((planification) => (
            <PlanificationTableRow
              key={planification._id}
              planification={planification}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
