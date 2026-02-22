'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Calendar, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { formatDate } from 'date-fns'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import DuplicatePlanificationDialog from '../dialogs/duplicate-planification-dialog'
import DeletePlanificationDialog from '../dialogs/delete-planification-dialog'

export interface PlanificationData {
  _id: string
  name: string
  description?: string
  isTemplate: boolean
  hasEverBeenAssigned?: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
}

interface PlanificationListProps {
  planifications: PlanificationData[]
  isLoading: boolean
}

function PlanificationCard({
  planification,
}: {
  planification: PlanificationData
}) {
  const router = useRouter()
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <>
      <div
        className="group border rounded-lg p-4 hover:border-primary cursor-pointer transition-colors"
        onClick={() =>
          router.push(`/dashboard/planifications/${planification._id}`)
        }
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <h3 className="font-semibold truncate">{planification.name}</h3>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(
                    `/dashboard/planifications/${planification._id}/edit`
                  )
                }}
              >
                Editar
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
        </div>

        {planification.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {planification.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(planification.createdAt, 'dd/MM/yyyy')}
          </div>
          {planification.isTemplate && (
            <Badge variant="secondary" className="text-xs">
              Plantilla
            </Badge>
          )}
        </div>
      </div>

      {/* Duplicate confirmation dialog */}
      <DuplicatePlanificationDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        planification={planification}
      />

      {/* Delete confirmation dialog */}
      <DeletePlanificationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        planification={planification}
      />
    </>
  )
}

function PlanificationSkeleton() {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-3" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

export default function PlanificationList({
  planifications,
  isLoading,
}: PlanificationListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <PlanificationSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (planifications.length === 0) {
    return (
      <Empty className="h-full w-full">
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {planifications.map((planification) => (
        <PlanificationCard
          key={planification._id}
          planification={planification}
        />
      ))}
    </div>
  )
}
