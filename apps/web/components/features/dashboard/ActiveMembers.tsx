'use client'

import { useQuery } from 'convex/react'
import { CheckCircle, TrendingUp } from 'lucide-react'

import { api } from '@/convex/_generated/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

export default function ActiveMembers() {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : 'skip'
  )

  const activeCount = memberships?.filter((member: any) => {
    const status = member.status?.toLowerCase()
    const role = member.role?.toLowerCase()

    return (status === 'active' || status === 'activo') && role === 'member'
  }).length ?? 0

  const totalMembers = activeCount
  const newMembersLast30Days = activeCount
  const previous30DaysNewMembers = 0

  const growthDelta = newMembersLast30Days - previous30DaysNewMembers
  const growthLabel =
    growthDelta > 0
      ? `+${growthDelta} vs 30 días previos`
      : growthDelta < 0
        ? `${growthDelta} vs 30 días previos`
        : 'Sin cambios vs 30 días previos'
  const activePercentage = 100
  const progressAngle = 360

  if (!memberships) return null

  return (
    <Card className="flex h-[220px] w-full max-w-none flex-col rounded-2xl border bg-background/60 p-5">
      <div className="text-sm text-muted-foreground">Miembros activos</div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-[460px] items-center justify-center gap-12">
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative flex h-28 w-28 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(rgb(34 197 94) ${progressAngle}deg, rgba(34, 197, 94, 0.12) ${progressAngle}deg)`,
              }}
            >
              <div className="absolute inset-[10px] rounded-full bg-background/95" />
              <div className="relative z-10 flex flex-col items-center gap-1 text-green-500">
                <TrendingUp className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">{activePercentage}%</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-center">
            <p className="text-5xl font-semibold leading-none">{activeCount}</p>
            <div className="flex justify-center">
              <Badge variant="outline" className="gap-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                Activos
              </Badge>
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{totalMembers} miembros totales</p>
              <p>{newMembersLast30Days} nuevos en 30 días</p>
              <p>{growthLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}