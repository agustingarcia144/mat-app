'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { getColumns } from '@/components/features/members/table/columns'
import { mapMembershipsToMembers } from '@repo/core/utils'
import type { Member } from '@repo/core'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'
import { Input } from '@/components/ui/input'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import { Search } from 'lucide-react'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

export default function MembersPage() {
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const members = mapMembershipsToMembers(memberships || [])


  const onlyMembers = members.filter(
    (m) =>
      normalize(m.role) === 'member' ||
      normalize(m.role) === 'miembro'
  )
console.log('JOINED AT RAW 👉', memberships?.[0]?.joinedAt)
console.log('JOINED AT MAPPED 👉', members?.[0]?.joinedAt)

  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const columns = useMemo(
    () => getColumns(),
    []
  )

  const filteredMembers = useMemo(() => {
    const searchValue = normalize(search)

    return onlyMembers.filter((m: Member): boolean => {
      return (
      !searchValue ||
      normalize(m.name).includes(searchValue) ||
      normalize(m.email).includes(searchValue)
      )
    })
  }, [onlyMembers, search])

  if (memberships === undefined) {
    return (
      <div className="container mx-auto py-10">
        <DataTableSkeleton columns={6} rows={10} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-4">
      <div className="relative w-full md:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        placeholder="Buscar por nombre o email..."
         value={search}
        onChange={(e) => setSearch(e.target.value)}
         className="pl-10 h-10"
       />
      </div>

      <DataTable columns={columns} data={filteredMembers} />

      <MemberDetailDialog
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  )
}
