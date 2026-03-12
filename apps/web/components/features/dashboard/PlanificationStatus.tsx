'use client'

import { useMemo } from 'react'
import { useQueries, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import StatsCard from './StatsCard'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { Dumbbell, XCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

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
  if (!assignment) {
    return { status: 'none', daysLeft: null, daysExpired: null }
  }

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
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : 'skip'
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
        <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            Todos tus miembros pueden entrenar. Bien hecho! 🎉
          </p>
        </div>
      ) : (
        membersWithIssues.map((m: any) => (
          <div
            key={m.id}
            className="flex flex-col border-b pb-2 text-sm last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {m.fullName || m.name}
              </span>

              {m.planStatus.status === 'none' && (
                <span className="shrink-0 text-muted-foreground">
                  Sin planificación
                </span>
              )}

              {m.planStatus.status === 'expired' && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-2 rounded-full border border-red-300 bg-red-100 text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-400"
                >
                  <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  Vencida
                  {m.planStatus.daysExpired !== null && (
                    <span className="font-normal text-red-700/80 dark:text-red-300/80">
                      (hace {m.planStatus.daysExpired} día
                      {m.planStatus.daysExpired !== 1 && 's'})
                    </span>
                  )}
                </Badge>
              )}

              {m.planStatus.status === 'expiring_soon' && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-2 rounded-full border border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-500/20 dark:text-yellow-400"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                  Por vencer
                  {m.planStatus.daysLeft !== null && (
                    <span className="font-normal text-yellow-700/80 dark:text-yellow-300/80">
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