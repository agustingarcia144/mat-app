'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, User } from 'lucide-react'
import StatusBadge from '../../members/badges/status-badge'

interface AssignedMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignments: any[]
  planificationName: string
}

export default function AssignedMembersDialog({
  open,
  onOpenChange,
  assignments,
  planificationName,
}: AssignedMembersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Miembros Asignados</DialogTitle>
          <DialogDescription>
            Planificación: {planificationName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {assignments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay miembros asignados a esta planificación</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => {
                const user = assignment.user
                const initials = user?.fullName
                  ? user.fullName
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : user?.email
                    ? user.email[0].toUpperCase()
                    : '?'

                return (
                  <div
                    key={assignment._id}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="h-12 w-12">
                      {user?.imageUrl && (
                        <AvatarImage
                          src={user.imageUrl}
                          alt={user.fullName || user.email || 'User'}
                        />
                      )}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">
                          {user?.fullName || 'Sin nombre'}
                        </p>
                        <StatusBadge status={assignment.status} />
                      </div>
                      {user?.email && (
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                      {(assignment.startDate || assignment.endDate) && (
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {assignment.startDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Inicio:{' '}
                                {format(
                                  new Date(assignment.startDate),
                                  'dd MMM yyyy',
                                  { locale: es }
                                )}
                              </span>
                            </div>
                          )}
                          {assignment.endDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Fin:{' '}
                                {format(
                                  new Date(assignment.endDate),
                                  'dd MMM yyyy',
                                  { locale: es }
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {assignment.notes && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {assignment.notes}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
