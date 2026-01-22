'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { columns } from '@/components/features/members/table/columns'
import { mapMembershipsToMembers } from '@repo/core/utils'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'

export default function MembersPage() {
  const memberships = useQuery(api.organizationMemberships.getOrganizationMemberships)
  const members = mapMembershipsToMembers(memberships || [])

  if (memberships === undefined) {
    return (
      <div className="container mx-auto py-10">
        <DataTableSkeleton columns={columns.length || 0} rows={10} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={members} />
    </div>
  )
}
