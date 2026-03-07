'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { getColumns } from '@/components/features/usuarios/table/columns'
import { InviteUserDialog } from '@/components/features/usuarios/invite-user-dialog'
import { PendingInvitationsCard } from '@/components/features/usuarios/pending-invitations-card'
import { mapMembershipsToMembers } from '@repo/core/utils'
import type { Member } from '@repo/core'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'
import { Input } from '@/components/ui/input'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import StatusBadge from '@/components/shared/badges/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  trainer: 'Entrenador',
  member: 'Miembro',
}

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role?.toLowerCase()] ?? role ?? '—'
}

export default function UsuariosPage() {
  const isMobile = useIsMobile()
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : 'skip'
  )
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0)

  const users = useMemo(() => {
    const all = mapMembershipsToMembers(memberships ?? [])
    return all.filter(
      (m) => normalize(m.role) !== 'member' && normalize(m.role) !== 'miembro'
    )
  }, [memberships])

  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const columns = useMemo(() => getColumns(), [])

  const filteredUsers = useMemo(() => {
    const searchValue = normalize(search)
    return users.filter((m: Member): boolean => {
      return (
        !searchValue ||
        normalize(m.name).includes(searchValue) ||
        normalize(m.email).includes(searchValue) ||
        normalize(getRoleLabel(m.role)).includes(searchValue)
      )
    })
  }, [users, search])

  if (memberships === undefined) {
    return (
      <DashboardPageContainer className="py-6 md:py-10">
        <DataTableSkeleton columns={6} rows={10} />
      </DashboardPageContainer>
    )
  }

  return (
    <DashboardPageContainer className="space-y-4 py-6 md:py-10">
      <PendingInvitationsCard refreshKey={inviteRefreshKey} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o rol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-10"
          />
        </div>
        <Button type="button" onClick={() => setInviteDialogOpen(true)}>
          Invitar usuario
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {filteredUsers.length === 0 ? (
            <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
              No se encontraron usuarios.
            </div>
          ) : (
            filteredUsers.map((user) => {
              const initials =
                user.fullName
                  ?.split(' ')
                  .map((name) => name[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || user.email?.[0]?.toUpperCase() || '?'
              const isActive = normalize(user.status) === 'active'
              const roleLabel = getRoleLabel(user.role ?? '')

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedMember(user)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          {user.imageUrl && (
                            <AvatarImage src={user.imageUrl} />
                          )}
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email || 'Sin email'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-12">
                        <Badge variant="outline" className="text-xs">
                          {roleLabel}
                        </Badge>
                        <StatusBadge status={isActive ? 'active' : 'inactive'} />
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredUsers} />
      )}

      <MemberDetailDialog
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onInvited={() => setInviteRefreshKey((current) => current + 1)}
      />
    </DashboardPageContainer>
  )
}
