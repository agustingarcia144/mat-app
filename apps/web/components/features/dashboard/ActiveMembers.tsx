'use client'

import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import StatsCard from './StatsCard'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { Badge } from '@/components/ui/badge'

export default function ActiveMembers() {
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const activeCount = useMemo(() => {
    if (!memberships) return 0

    const members = mapMembershipsToMembers(memberships)

    return members.filter((m: any) => {
      const status = m.status?.toLowerCase()
      const role = m.role?.toLowerCase()

      return (
        (status === 'active' || status === 'activo') &&
        role === 'member'
      )
    }).length
  }, [memberships])

  if (!memberships) return null

  return (
    <StatsCard
      title="Miembros activos"
      value={activeCount}
      footer={
        <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
          Activos
        </Badge>
      }
    />
  )
}