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

  const membersWithStatuses = useMemo(() => {
    if (!members.length) return []

    return members.map((m: any) => {
      const res = assignmentsByUser[m.id]
      const assignments = res instanceof Error ? undefined : res

      const activeAssignment = assignments?.find(
        (a: any) => a.status === 'active'
      )

      const planStatus = computePlanStatus(activeAssignment)

      return { ...m, planStatus }
    })
  }, [members, assignmentsByUser])

  const membersWithIssues = useMemo(() => {
    return membersWithStatuses.filter(
      (m: any) =>
        m.planStatus.status === 'none' ||
        m.planStatus.status === 'expired' ||
        m.planStatus.status === 'expiring_soon'
    )
  }, [membersWithStatuses])

  const summary = useMemo(() => {
    const total = membersWithStatuses.length

    const assigned = membersWithStatuses.filter(
      (member: any) => member.planStatus.status === 'active'
    ).length
    const expiringSoon = membersWithStatuses.filter(
      (member: any) => member.planStatus.status === 'expiring_soon'
    ).length
    const expired = membersWithStatuses.filter(
      (member: any) => member.planStatus.status === 'expired'
    ).length
    const unassigned = membersWithStatuses.filter(
      (member: any) =>
        member.planStatus.status === 'none' ||
        member.planStatus.status === 'not_started'
    ).length

    const toPercent = (value: number) =>
      total > 0 ? Math.round((value / total) * 100) : 0

    return {
      total,
      assigned,
      expiringSoon,
      expired,
      unassigned,
      assignedPct: toPercent(assigned),
      expiringSoonPct: toPercent(expiringSoon),
      expiredPct: toPercent(expired),
      unassignedPct: toPercent(unassigned),
    }
  }, [membersWithStatuses])

  const planSegments = [
    {
      label: 'Asignadas',
      count: summary.assigned,
      pct: summary.assignedPct,
      color: 'rgb(34 197 94)',
      tone: 'bg-green-500',
    },
    {
      label: 'Por vencer',
      count: summary.expiringSoon,
      pct: summary.expiringSoonPct,
      color: 'rgb(234 179 8)',
      tone: 'bg-yellow-500',
    },
    {
      label: 'Vencidas',
      count: summary.expired,
      pct: summary.expiredPct,
      color: 'rgb(239 68 68)',
      tone: 'bg-red-500',
    },
    {
      label: 'Sin asignar',
      count: summary.unassigned,
      pct: summary.unassignedPct,
      color: 'rgb(107 114 128)',
      tone: 'bg-gray-500',
    },
  ]

  const donutBackground = (() => {
    const validSegments = planSegments.filter((segment) => segment.count > 0)
    if (validSegments.length === 0) {
      return 'conic-gradient(rgba(107, 114, 128, 0.18) 0deg 360deg)'
    }

    let currentDeg = 0
    const stops = validSegments.map((segment) => {
      const nextDeg = currentDeg + (segment.pct / 100) * 360
      const stop = `${segment.color} ${currentDeg}deg ${nextDeg}deg`
      currentDeg = nextDeg
      return stop
    })

    if (currentDeg < 360) {
      stops.push(`rgba(107, 114, 128, 0.18) ${currentDeg}deg 360deg`)
    }

    return `conic-gradient(${stops.join(', ')})`
  })()

  if (!memberships) return null

  return (
    <StatsCard
      title="Estado de Planificaciones"
      variant="list"
      compact
      className="min-h-[360px] w-full min-w-0 max-w-none flex-1 xl:min-h-0 xl:h-full"
      actionLabel="Ver mas +"
      actionHref="/dashboard/planifications"
      actionIcon={Dumbbell}
    >
      <div className="mb-4 rounded-xl border bg-background/30 p-3 md:p-4">
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between md:gap-6 md:pl-8">
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full md:h-24 md:w-24"
            style={{ background: donutBackground }}
          >
            <div className="absolute inset-[10px] rounded-full bg-background/95" />
            <div className="relative z-10 text-center">
              <p className="text-xl font-semibold leading-none">
                {summary.assignedPct}%
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Activas
              </p>
            </div>
          </div>

          <div className="flex w-full flex-1 justify-center md:justify-center">
            <div className="grid w-full gap-2 text-sm text-muted-foreground md:w-auto">
              {planSegments.map((segment) => (
                <div
                  key={segment.label}
                  className="flex items-center gap-2"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${segment.tone}`} />
                  <span>
                    {segment.label}: {segment.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {m.fullName || m.name}
              </span>

              {m.planStatus.status === 'none' && (
                <span className="shrink-0 text-sm text-muted-foreground">
                  Sin planificación
                </span>
              )}

              {m.planStatus.status === 'expired' && (
                <Badge
                  variant="outline"
                  className="max-w-full shrink-0 gap-2 rounded-2xl border border-red-300 bg-red-100 px-3 py-1 text-left whitespace-normal text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-400 md:rounded-full"
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
                  className="max-w-full shrink-0 gap-2 rounded-2xl border border-yellow-300 bg-yellow-100 px-3 py-1 text-left whitespace-normal text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-500/20 dark:text-yellow-400 md:rounded-full"
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
