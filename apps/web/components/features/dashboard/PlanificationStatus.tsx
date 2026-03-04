'use client'

import { useMemo } from 'react'
import { useQueries, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import StatsCard from './StatsCard'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { Dumbbell, XCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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

function computePlanStatus(assignment: any) {
  if (!assignment) return { status: 'none' }

  const start = safeDate(assignment.startDate)
  const end = safeDate(assignment.endDate)
  const now = new Date()

  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))

  if (!start || !end) {
    return { status: 'not_started', daysLeft: null, daysExpired: null }
  }

  const daysLeftRaw = diffDays(now, end)
  const daysLeft = Math.max(daysLeftRaw, 0)

  const daysExpiredRaw = diffDays(end, now)
  const daysExpired = end <= now ? Math.max(daysExpiredRaw, 0) : null

  if (end <= now) {
    return { status: 'expired', daysLeft: 0, daysExpired }
  }

  if (start > now) {
    return { status: 'not_started', daysLeft, daysExpired: null }
  }

  if (daysLeft <= 5) {
    return { status: 'expiring_soon', daysLeft, daysExpired: null }
  }

  return { status: 'active', daysLeft, daysExpired: null }
}

const normalize = (v?: string) => v?.toLowerCase().trim() ?? ''

export default function PlanificationStatus() {
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const members = useMemo(() => {
    if (!memberships) return []
    const all = mapMembershipsToMembers(memberships)
    return all.filter((m: any) => normalize(m.role) === 'member')
  }, [memberships])

  const queries = useMemo(() => {
    if (!members.length) return {}
    return Object.fromEntries(
      members.map((m: any) => [
        m.id,
        {
          query: api.planificationAssignments.getByUser,
          args: { userId: m.id },
        },
      ])
    )
  }, [members])

  const assignmentsByUser = useQueries(queries)

  const membersWithIssues = useMemo(() => {
    if (!members.length) return []

    return members
      .map((m: any) => {
        const res = assignmentsByUser[m.id]
        const assignments = res instanceof Error ? undefined : res

        const activeAssignment = assignments?.find(
          (a: any) => a.status === 'active'
        )

        const planStatus = computePlanStatus(activeAssignment)

        return { ...m, planStatus }
      })
      .filter(
        (m: any) =>
          m.planStatus.status === 'none' ||
          m.planStatus.status === 'expired' ||
          m.planStatus.status === 'expiring_soon'
      )
  }, [members, assignmentsByUser])

  if (!memberships) return null

  return (
    <StatsCard
      title="Estado de Planificaciones"
      variant="list"
      compact
      actionLabel="Ver mas +"
      actionHref="/dashboard/planifications"
      actionIcon={Dumbbell}
    >
      {membersWithIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Todos tus miembros pueden entrenar. Bien hecho! 🎉
          </p>
        </div>
      ) : (
        membersWithIssues.map((m: any) => (
          <div key={m.id} className="flex flex-col border-b pb-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="font-medium">
                {m.fullName || m.name}
              </span>

              {m.planStatus.status === 'none' && (
                <span className="text-muted-foreground">
                  Sin planificación
                </span>
              )}

              {m.planStatus.status === 'expired' && (
                <Badge variant="dark" className="gap-2">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  Vencida
                  {m.planStatus.daysExpired !== null && (
                    <span className="font-normal text-zinc-400">
                      (hace {m.planStatus.daysExpired} día
                      {m.planStatus.daysExpired !== 1 && 's'})
                    </span>
                  )}
                </Badge>
              )}

              {m.planStatus.status === 'expiring_soon' && (
                <Badge variant="dark" className="gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  Por vencer
                  {m.planStatus.daysLeft !== null && (
                    <span className="font-normal text-zinc-400">
                      ({m.planStatus.daysLeft} día
                      {m.planStatus.daysLeft !== 1 && 's'})
                    </span>
                  )}
                </Badge>
              )}
            </div>
          </div>
        ))
      )}
    </StatsCard>
  )
}