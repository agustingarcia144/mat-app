'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'
import { mapMembershipsToMembers } from '@repo/core/utils'

export default function MembersTable() {
  const memberships = useQuery(api.organizationMemberships.getOrganizationMemberships)
  const members = mapMembershipsToMembers(memberships || [])

  if (memberships === undefined) {
    return (
      <div className="container mx-auto py-10">
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={members} />
    </div>
  )
}
