'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MailPlus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import RoleBadge from '@/components/shared/badges/role-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StaffInvitation } from '@/lib/security/organization-invitations'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

type Props = {
  refreshKey: number
}

export function PendingInvitationsCard({ refreshKey }: Props) {
  const invitationList = useQuery(api.organizations.listPendingInvitations)
  const revokeInvitation = useMutation(api.organizations.revokeInvitation)
  const [selectedInvitation, setSelectedInvitation] =
    useState<StaffInvitation | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const invitations = useMemo(
    () => (invitationList ?? []) as StaffInvitation[],
    [invitationList, refreshKey]
  )

  const handleRevoke = async () => {
    if (!selectedInvitation) {
      return
    }

    setIsRevoking(true)
    try {
      await revokeInvitation({
        invitationId:
          selectedInvitation.id as Id<'organizationInvitations'>,
      })
      setSelectedInvitation(null)
      toast.success('Invitación revocada')
    } catch (revokeError) {
      toast.error(
        revokeError instanceof Error
          ? revokeError.message
          : 'No se pudo revocar la invitación'
      )
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MailPlus className="size-4" />
              Invitaciones pendientes ({invitations.length})
            </CardTitle>
            <CardDescription>
              Administra las invitaciones abiertas para administradores y
              entrenadores.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              // Keep manual refresh affordance by triggering a soft reload.
              window.location.reload()
            }}
            disabled={invitationList === undefined}
          >
            <RefreshCw className={`size-4 ${invitationList === undefined ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {invitationList === undefined ? (
            <p className="text-sm text-muted-foreground">
              Cargando invitaciones...
            </p>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay invitaciones pendientes por ahora.
            </p>
          ) : (
            <ul className="space-y-2">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {invitation.email}
                      </p>
                      <Badge variant="outline">Pendiente</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge role={String(invitation.role)} />
                      <span className="text-xs text-muted-foreground">
                        Enviada el{' '}
                        {format(new Date(invitation.createdAt), 'd MMM yyyy, HH:mm', {
                          locale: es,
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 self-start text-destructive hover:text-destructive"
                    onClick={() => setSelectedInvitation(invitation)}
                  >
                    <Trash2 className="size-4" />
                    Revocar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedInvitation}
        onOpenChange={(open) => !open && setSelectedInvitation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revocar invitación</DialogTitle>
            <DialogDescription>
              {selectedInvitation?.email} dejará de poder unirse a la organización
              con este enlace. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedInvitation(null)}
              disabled={isRevoking}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRevoke()}
              disabled={isRevoking}
            >
              {isRevoking ? 'Revocando…' : 'Revocar invitación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
