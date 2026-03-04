'use client'

import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import StatsCard from './StatsCard'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCircle } from 'lucide-react'

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
        <Badge variant="dark" className="gap-2">
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          Activos
        </Badge>
      }
    />
  )
}