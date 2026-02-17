'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Edit,
  Users,
  Copy,
  Trash2,
  MoreVertical,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDate } from 'date-fns'
import Link from 'next/link'
import DuplicatePlanificationDialog from '@/components/features/planifications/dialogs/duplicate-planification-dialog'
import DeletePlanificationDialog from '@/components/features/planifications/dialogs/delete-planification-dialog'
import AssignDialog from '@/components/features/planifications/assignments/assign-dialog'
import AssignedMembersDialog from '@/components/features/planifications/assignments/assigned-members-dialog'
import WorkoutWeekCard from '@/components/features/planifications/cards/workout-week-card'

export default function PlanificationViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignedMembersDialogOpen, setAssignedMembersDialogOpen] =
    useState(false)

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  })
  const workoutWeeks = useQuery(api.workoutWeeks.getByPlanification, {
    planificationId: id as any,
  })
  const assignments = useQuery(
    api.planificationAssignments.getByPlanification,
    {
      planificationId: id as any,
    }
  )

  if (
    planification === undefined ||
    workoutWeeks === undefined ||
    assignments === undefined
  ) {
    return (
      <div className="container mx-auto py-6 max-w-5xl">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-6 w-96 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href="/dashboard/planifications">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a planificaciones
        </Link>
      </Button>
      <div className="container mx-auto py-6 max-w-5xl">
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{planification.name}</h1>
                {planification.isTemplate && (
                  <Badge variant="secondary">Plantilla</Badge>
                )}
              </div>
              {planification.description && (
                <p className="text-muted-foreground">
                  {planification.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Creado el {formatDate(planification.createdAt, 'dd/MM/yyyy')}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {!planification.isTemplate &&
                assignments &&
                assignments.length > 0 && (
                  <AvatarGroup>
                    {assignments.slice(0, 3).map((assignment) => {
                      const user = assignment.user
                      const initials = user?.fullName
                        ? user.fullName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                        : user?.email
                          ? user.email[0].toUpperCase()
                          : '?'

                      return (
                        <Tooltip key={assignment._id}>
                          <TooltipTrigger asChild>
                            <Avatar key={assignment._id} className="h-8 w-8">
                              {user?.imageUrl && (
                                <AvatarImage
                                  src={user.imageUrl}
                                  alt={user.fullName || user.email || 'User'}
                                />
                              )}
                              <AvatarFallback className="text-xs">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            {user?.fullName ||
                              user?.email ||
                              'Usuario no encontrado'}
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                    {assignments.length > 3 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AvatarGroupCount
                            className="h-8 w-8 text-xs cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => setAssignedMembersDialogOpen(true)}
                          >
                            +{assignments.length - 3}
                          </AvatarGroupCount>
                        </TooltipTrigger>
                        <TooltipContent>Ver Asignados</TooltipContent>
                      </Tooltip>
                    )}
                  </AvatarGroup>
                )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!planification.isTemplate && (
                    <>
                      <DropdownMenuItem
                        onClick={() => setAssignedMembersDialogOpen(true)}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Ver Asignados
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setAssignDialogOpen(true)}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Asignar
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/planifications/${id}/edit`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDuplicateDialogOpen(true)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <DuplicatePlanificationDialog
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
          planification={planification}
        />
        <DeletePlanificationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          planification={planification}
          onSuccess={() => router.push('/dashboard/planifications')}
        />
        {!planification.isTemplate && (
          <>
            <AssignDialog
              open={assignDialogOpen}
              onOpenChange={setAssignDialogOpen}
              planificationId={id}
            />
            <AssignedMembersDialog
              open={assignedMembersDialogOpen}
              onOpenChange={setAssignedMembersDialogOpen}
              assignments={assignments || []}
              planificationName={planification.name}
            />
          </>
        )}

        <div className="space-y-6">
          {workoutWeeks.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <p className="text-muted-foreground">
                Esta planificación no tiene semanas de entrenamiento
              </p>
            </div>
          ) : (
            workoutWeeks.map((week) => (
              <WorkoutWeekCard key={week._id} week={week} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
