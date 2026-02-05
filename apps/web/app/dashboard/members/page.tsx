'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { columns } from '@/components/features/members/table/columns'
import { mapMembershipsToMembers } from '@repo/core/utils'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'
import { Input } from '@/components/ui/input'

export default function MembersPage() {
  const memberships = useQuery(api.organizationMemberships.getOrganizationMemberships)
  const members = mapMembershipsToMembers(memberships || [])

  const [search, setSearch] = useState('')

  const filteredMembers = useMemo(() => {
    if (!search) return members

    const value = search.toLowerCase()

    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(value) ||
        m.email?.toLowerCase().includes(value)
    )
  }, [members, search])

  if (memberships === undefined) {
    return (
      <div className="container mx-auto py-10">
        <DataTableSkeleton columns={columns.length || 0} rows={10} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-4">

      {/* 🔍 BUSCADOR */}
      <Input
       placeholder="Buscar por nombre o email..."
       value={search}
       onChange={(e) => setSearch(e.target.value)}
      />

      {/* 📋 TABLA */}
      <DataTable
        columns={columns}
        data={filteredMembers}
      />
    </div>
  )
}
