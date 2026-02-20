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
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

export default function MembersPage() {
  const isMobile = useIsMobile()
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const members = mapMembershipsToMembers(memberships || [])

  const onlyMembers = members.filter(
    (m) => normalize(m.role) === 'member' || normalize(m.role) === 'miembro'
  )

  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const columns = useMemo(() => getColumns(), [])

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
      <DashboardPageContainer className='py-6 md:py-10'>
        <DataTableSkeleton columns={6} rows={10} />
      </DashboardPageContainer>
    )
  }

  return (
    <DashboardPageContainer className='space-y-4 py-6 md:py-10'>
      <div className='relative w-full md:max-w-xs'>
        <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />

        <Input
          placeholder='Buscar por nombre o email...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='h-10 pl-10'
        />
      </div>

      {isMobile ? (
        <div className='space-y-2'>
          {filteredMembers.length === 0 ? (
            <div className='rounded-md border px-4 py-8 text-center text-sm text-muted-foreground'>
              No se encontraron miembros.
            </div>
          ) : (
            filteredMembers.map((member) => {
              const initials =
                member.fullName
                  ?.split(' ')
                  .map((name) => name[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || member.email?.[0]?.toUpperCase() || '?'

              const isActive = normalize(member.status) === 'active'

              return (
                <button
                  key={member.id}
                  type='button'
                  onClick={() => setSelectedMember(member)}
                  className='w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/40'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex min-w-0 items-center gap-3'>
                      <Avatar className='h-9 w-9'>
                        {member.imageUrl && <AvatarImage src={member.imageUrl} />}
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium'>{member.name}</p>
                        <p className='truncate text-xs text-muted-foreground'>
                          {member.email || 'Sin email'}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        isActive
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }
                    >
                      {isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </button>
              )
            })
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredMembers} />
      )}

      <MemberDetailDialog
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </DashboardPageContainer>
  )
}
