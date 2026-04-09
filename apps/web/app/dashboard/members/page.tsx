'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import {
  getColumns,
  type MemberTableRow,
} from '@/components/features/members/table/columns'
import { mapMembershipsToMembers } from '@repo/core/utils'
import type { Member } from '@repo/core'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'
import { Input } from '@/components/ui/input'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import { JoinRequestsCard } from '@/components/features/members/join-requests-card'
import { MemberInviteQrDialog } from '@/components/features/members/member-invite-qr-dialog'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import StatusBadge from '@/components/shared/badges/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

export default function MembersPage() {
  const isMobile = useIsMobile()
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    canQueryCurrentOrganization ? {} : 'skip'
  )
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    canQueryCurrentOrganization ? {} : 'skip'
  )
  const payments = useQuery(
    api.planPayments.getByOrganization,
    canQueryCurrentOrganization ? {} : 'skip'
  )

  const members = mapMembershipsToMembers(memberships || [])

  const onlyMembers = members.filter(
    (m) => normalize(m.role) === 'member' || normalize(m.role) === 'miembro'
  )

  const [search, setSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  const columns = useMemo(() => getColumns(), [])

  const currentBillingPeriod = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const membersWithPlanData = useMemo<MemberTableRow[]>(() => {
    const latestSubscriptionByUser = new Map<string, any>()

    for (const subscription of subscriptions ?? []) {
      if (subscription.status === 'cancelled') continue

      const previous = latestSubscriptionByUser.get(subscription.userId)
      const previousUpdatedAt = previous?.updatedAt ?? previous?.createdAt ?? 0
      const currentUpdatedAt = subscription.updatedAt ?? subscription.createdAt ?? 0

      if (!previous || currentUpdatedAt > previousUpdatedAt) {
        latestSubscriptionByUser.set(subscription.userId, subscription)
      }
    }

    const currentPaymentBySubscription = new Map<string, any>()

    for (const payment of payments ?? []) {
      if (payment.billingPeriod !== currentBillingPeriod) continue

      const key = String(payment.subscriptionId)
      const previous = currentPaymentBySubscription.get(key)
      const previousUpdatedAt = previous?.updatedAt ?? previous?.createdAt ?? 0
      const currentUpdatedAt = payment.updatedAt ?? payment.createdAt ?? 0

      if (!previous || currentUpdatedAt > previousUpdatedAt) {
        currentPaymentBySubscription.set(key, payment)
      }
    }

    return onlyMembers.map((member): MemberTableRow => {
      const subscription = latestSubscriptionByUser.get(member.id)
      const currentPayment = subscription
        ? currentPaymentBySubscription.get(String(subscription._id))
        : null

      const assignedPlanName = subscription?.plan?.name ?? 'Sin Plan'

      let planPaymentStatus: MemberTableRow['planPaymentStatus'] = 'none'

      if (!subscription) {
        planPaymentStatus = 'none'
      } else if (subscription?.status === 'suspended') {
        planPaymentStatus = 'vencido'
      } else if (currentPayment?.status === 'approved') {
        planPaymentStatus = 'pago'
      } else {
        planPaymentStatus = 'pendiente'
      }

      return {
        ...member,
        assignedPlanName,
        planPaymentStatus,
      }
    })
  }, [currentBillingPeriod, onlyMembers, payments, subscriptions])

  const filteredMembers = useMemo(() => {
    const searchValue = normalize(search)

    return membersWithPlanData.filter((m: Member): boolean => {
      return (
        !searchValue ||
        normalize(m.name).includes(searchValue) ||
        normalize(m.email).includes(searchValue)
      )
    })
  }, [membersWithPlanData, search])

  if (
    memberships === undefined ||
    subscriptions === undefined ||
    payments === undefined
  ) {
    return (
      <DashboardPageContainer className='py-6 md:py-10'>
        <DataTableSkeleton columns={8} rows={10} />
      </DashboardPageContainer>
    )
  }

  return (
    <DashboardPageContainer className='space-y-4 py-6 md:py-10'>
      <JoinRequestsCard />
      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='relative w-full md:max-w-xs'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />

          <Input
            placeholder='Buscar por nombre o email...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='h-10 pl-10'
          />
        </div>
        <MemberInviteQrDialog />
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
                    <StatusBadge status={isActive ? 'active' : 'inactive'} />
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
