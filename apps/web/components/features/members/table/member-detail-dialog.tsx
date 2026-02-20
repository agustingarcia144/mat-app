'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Member } from '@repo/core'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Eye, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Props = {
  member: Member | null
  open: boolean
  onClose: () => void
}

/* =========================
   HELPERS
========================= */

function safeDate(value: any): Date | null {
  if (!value) return null

  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.split('/')
    if (parts.length === 3) {
      const [day, month, year] = parts
      const parsed = new Date(`${year}-${month}-${day}`)
      return isNaN(parsed.getTime()) ? null : parsed
    }
  }

  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/* =========================
   COMPONENT
========================= */

export default function MemberDetailDialog({
  member,
  open,
  onClose,
}: Props) {
  const router = useRouter()

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    member ? { userId: member.id } : 'skip'
  )

  if (!member) return null

  const assignment = assignments?.find(
    (a) => a.status === 'active'
  )

  const initials =
    member.fullName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    '?'

  const handleViewPlan = () => {
    if (!assignment?.planification?._id) return
    router.push(
      `/dashboard/planifications/${assignment.planification._id}`
    )
  }

  const handleAssign = () => {
    router.push('/dashboard/planifications')
  }

  /* =========================
     PLAN STATUS
  ========================= */

  const planStatus = (() => {
    if (!assignment) return null

    const start = safeDate(assignment.startDate)
    const end = safeDate(assignment.endDate)
    const now = new Date()

    const diffDays = (from: Date, to: Date) =>
      Math.ceil(
        (to.getTime() - from.getTime()) /
          (1000 * 60 * 60 * 24)
      )

    if (!start || !end) {
      return {
        status: 'not_started',
        daysLeft: null,
        daysExpired: null,
      }
    }

    const daysLeftRaw = diffDays(now, end)
    const daysLeft = Math.max(daysLeftRaw, 0)

    const daysExpiredRaw = diffDays(end, now)
    const daysExpired =
      end <= now ? Math.max(daysExpiredRaw, 0) : null

    if (end <= now) {
      return {
        status: 'expired',
        daysLeft: 0,
        daysExpired,
      }
    }

    if (start > now) {
      return {
        status: 'not_started',
        daysLeft,
        daysExpired: null,
      }
    }

    if (daysLeft <= 5) {
      return {
        status: 'expiring_soon',
        daysLeft,
        daysExpired: null,
      }
    }

    return {
      status: 'active',
      daysLeft,
      daysExpired: null,
    }
  })()

  const showAssignButton =
    !assignment || planStatus?.status === 'expired'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del miembro</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          {/* PERFIL */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {member.imageUrl && (
                <AvatarImage src={member.imageUrl} />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <p className="text-xl font-semibold">
                {member.name}
              </p>

              {member.email && (
                <p className="text-sm text-muted-foreground">
                  {member.email}
                </p>
              )}

              {member.username && (
                <p className="text-xs text-muted-foreground">
                  @{member.username}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">

            <div>
              <p className="text-muted-foreground">
                Estado
              </p>

              {(() => {
                const status = member.status?.toLowerCase()
                const isActive =
                  status === 'active' || status === 'activo'

                return (
                  <Badge
                    className={
                      isActive
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }
                  >
                    {isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                )
              })()}
            </div>

            <div>
              <p className="text-muted-foreground">
                Miembro desde
              </p>
              <p>{member.createdAt || '-'}</p>
            </div>

            <div className="col-span-2">
              <p className="text-muted-foreground">
                Fecha de nacimiento
              </p>

              <p>
                {(() => {
                  const date = safeDate(member.birthDate)
                  if (!date) return '-'

                  const today = new Date()
                  let age =
                    today.getFullYear() - date.getFullYear()

                  const hasHadBirthdayThisYear =
                    today.getMonth() > date.getMonth() ||
                    (today.getMonth() === date.getMonth() &&
                      today.getDate() >= date.getDate())

                  if (!hasHadBirthdayThisYear) {
                    age--
                  }

                  return `${format(date, 'dd/MM/yyyy', {
                    locale: es,
                  })} (${age} años)`
                })()}
              </p>
            </div>

          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Planificación
            </p>

            <div className="space-y-3 border rounded-lg p-4">

              <div className="flex items-center justify-between">
                <div>
                  {assignment ? (
                    <p className="font-semibold">
                      {assignment.planification?.name}
                    </p>
                  ) : (
                    <Badge variant="secondary">
                      Sin planificación
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {assignment && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleViewPlan}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                  )}

                  {showAssignButton && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-2"
                      onClick={handleAssign}
                    >
                      <Users className="h-4 w-4" />
                      Asignar
                    </Button>
                  )}
                </div>
              </div>

              {assignment && planStatus && (
                <>
                  <div className="flex flex-wrap gap-2">

                    {planStatus.status === 'expired' && (
                      <>
                        <Badge variant="destructive">
                          Vencida
                        </Badge>

                        {planStatus.daysExpired !== null && (
                          <Badge variant="secondary">
                            Venció hace {planStatus.daysExpired} día
                            {planStatus.daysExpired !== 1 && 's'}
                          </Badge>
                        )}
                      </>
                    )}

                    {planStatus.status === 'active' && (
                      <>
                        <Badge className="bg-green-600">
                          Activa
                        </Badge>

                        {planStatus.daysLeft !== null && (
                          <Badge variant="secondary">
                            {planStatus.daysLeft} día
                            {planStatus.daysLeft !== 1 && 's'} restantes
                          </Badge>
                        )}
                      </>
                    )}

                    {planStatus.status === 'expiring_soon' && (
                      <Badge className="bg-yellow-500 text-black">
                        ⚠️ Próxima a vencer ({planStatus.daysLeft} día
                        {planStatus.daysLeft !== 1 && 's'})
                      </Badge>
                    )}

                    {planStatus.status === 'not_started' && (
                      <Badge variant="secondary">
                        No iniciada
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    {assignment.startDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Inicio:{' '}
                        {format(
                          safeDate(assignment.startDate)!,
                          'dd/MM/yyyy',
                          { locale: es }
                        )}
                      </div>
                    )}

                    {assignment.endDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Fin:{' '}
                        {format(
                          safeDate(assignment.endDate)!,
                          'dd/MM/yyyy',
                          { locale: es }
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}