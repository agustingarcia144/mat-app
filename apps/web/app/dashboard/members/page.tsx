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
import { Search, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import StatusBadge from '@/components/shared/badges/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'
import { ResponsiveActionButton } from '@/components/ui/responsive-action-button'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

type FilterableMemberTableRow = MemberTableRow & {
  createdAtTimestamp: number
}

const normalizeMemberStatus = (value?: string) => {
  const normalized = normalize(value)
  if (normalized === 'active' || normalized === 'activo') return 'active'
  if (normalized === 'inactive' || normalized === 'inactivo') return 'inactive'
  return normalized
}

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
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false)
  const [filterPlanStatus, setFilterPlanStatus] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPlan, setFilterPlan] = useState('all')
  const [sheetFilterPlan, setSheetFilterPlan] = useState('all')
  const [sheetFilterPlanStatus, setSheetFilterPlanStatus] = useState('all')
  const [sheetFilterStatus, setSheetFilterStatus] = useState('all')
  const [nameOrder, setNameOrder] = useState('default')
  const [sheetNameOrder, setSheetNameOrder] = useState('default')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sheetCreatedFrom, setSheetCreatedFrom] = useState('')
  const [sheetCreatedTo, setSheetCreatedTo] = useState('')

  const columns = useMemo(() => getColumns(), [])

  const currentBillingPeriod = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const membersWithPlanData = useMemo<FilterableMemberTableRow[]>(() => {
    const latestSubscriptionByUser = new Map<string, any>()
    const membershipCreatedAtByUser = new Map<string, number>()

    for (const membership of memberships ?? []) {
      membershipCreatedAtByUser.set(membership.userId, membership.createdAt ?? 0)
    }

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

    return onlyMembers.map((member): FilterableMemberTableRow => {
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
        createdAtTimestamp: membershipCreatedAtByUser.get(member.id) ?? 0,
      }
    })
  }, [currentBillingPeriod, memberships, onlyMembers, payments, subscriptions])

  const filteredMembers = useMemo(() => {
    const searchValue = normalize(search)
    const createdFromTime = createdFrom
      ? new Date(`${createdFrom}T00:00:00`).getTime()
      : null
    const createdToTime = createdTo
      ? new Date(`${createdTo}T23:59:59.999`).getTime()
      : null

    const filtered = membersWithPlanData.filter((m): boolean => {
      const normalizedPlan = normalize(m.assignedPlanName)
      const normalizedPlanStatus = normalize(m.planPaymentStatus)
      const normalizedStatus = normalizeMemberStatus(m.status)

      return (
        !searchValue ||
        normalize(m.name).includes(searchValue) ||
        normalize(m.email).includes(searchValue)
      ) &&
        (filterPlan === 'all' || normalizedPlan === normalize(filterPlan)) &&
        (filterPlanStatus === 'all' ||
          normalizedPlanStatus === normalize(filterPlanStatus)) &&
        (filterStatus === 'all' ||
          normalizedStatus === normalizeMemberStatus(filterStatus)) &&
        (createdFromTime === null || m.createdAtTimestamp >= createdFromTime) &&
        (createdToTime === null || m.createdAtTimestamp <= createdToTime)
    })

    if (nameOrder === 'asc') {
      return [...filtered].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
    }

    if (nameOrder === 'desc') {
      return [...filtered].sort((a, b) =>
        b.name.localeCompare(a.name, 'es', { sensitivity: 'base' })
      )
    }

    return filtered
  }, [
    createdFrom,
    createdTo,
    filterPlan,
    filterPlanStatus,
    filterStatus,
    membersWithPlanData,
    nameOrder,
    search,
  ])

  const availablePlans = useMemo(() => {
    const uniquePlans = Array.from(
      new Set(
        membersWithPlanData
          .map((member) => member.assignedPlanName)
          .filter((plan) => plan && plan !== 'Sin Plan')
      )
    )

    return uniquePlans.sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    )
  }, [membersWithPlanData])

  const activeFiltersCount = [
    filterPlan !== 'all' ? filterPlan : '',
    filterPlanStatus !== 'all' ? filterPlanStatus : '',
    filterStatus !== 'all' ? filterStatus : '',
    nameOrder !== 'default' ? nameOrder : '',
    createdFrom,
    createdTo,
  ].filter(Boolean).length

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
        <div className='flex w-full items-center gap-2 md:max-w-xl'>
          <div className='relative flex-1'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />

            <Input
              placeholder='Buscar por nombre o email...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-10 pl-10'
            />
          </div>
          <ResponsiveActionButton
            variant='outline'
            mobileSize='sm'
            onClick={() => {
              setSheetFilterPlan(filterPlan)
              setSheetFilterPlanStatus(filterPlanStatus)
              setSheetFilterStatus(filterStatus)
              setSheetNameOrder(nameOrder)
              setSheetCreatedFrom(createdFrom)
              setSheetCreatedTo(createdTo)
              setFiltersSheetOpen(true)
            }}
            icon={<SlidersHorizontal className='h-4 w-4' aria-hidden />}
            label='Filtros'
            tooltip='Filtros'
          />
          {activeFiltersCount > 0 ? (
            <Badge variant='secondary' className='rounded-full'>
              {activeFiltersCount}
            </Badge>
          ) : null}
        </div>
        <div className='flex items-center gap-2'>
          <MemberInviteQrDialog />
        </div>
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

              const isActive = normalizeMemberStatus(member.status) === 'active'

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

      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side='right' className='flex flex-col'>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>

          <div className='flex-1 space-y-4 overflow-y-auto py-4'>
            <div className='space-y-2'>
              <p className='text-sm font-medium'>Ordenar nombre</p>
              <Select value={sheetNameOrder} onValueChange={setSheetNameOrder}>
                <SelectTrigger>
                  <SelectValue placeholder='Sin orden' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='default'>Sin orden</SelectItem>
                  <SelectItem value='asc'>Nombre: A-Z</SelectItem>
                  <SelectItem value='desc'>Nombre: Z-A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>Fecha de creación</p>
              <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                <Input
                  type='date'
                  value={sheetCreatedFrom}
                  onChange={(e) => setSheetCreatedFrom(e.target.value)}
                />
                <Input
                  type='date'
                  value={sheetCreatedTo}
                  onChange={(e) => setSheetCreatedTo(e.target.value)}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>Plan</p>
              <Select value={sheetFilterPlan} onValueChange={setSheetFilterPlan}>
                <SelectTrigger>
                  <SelectValue placeholder='Todos' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Todos</SelectItem>
                  {availablePlans.map((plan) => (
                    <SelectItem key={plan} value={plan}>
                      {plan}
                    </SelectItem>
                  ))}
                  <SelectItem value='Sin Plan'>Sin Plan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>Estado del plan</p>
              <Select
                value={sheetFilterPlanStatus}
                onValueChange={setSheetFilterPlanStatus}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Todos' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Todos</SelectItem>
                  <SelectItem value='pago'>Pago</SelectItem>
                  <SelectItem value='pendiente'>Pendiente</SelectItem>
                  <SelectItem value='vencido'>Vencido</SelectItem>
                  <SelectItem value='none'>Sin plan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>Estado</p>
              <Select value={sheetFilterStatus} onValueChange={setSheetFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder='Todos' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Todos</SelectItem>
                  <SelectItem value='active'>Activo</SelectItem>
                  <SelectItem value='inactive'>Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <SheetFooter>
            <Button
              variant='outline'
              onClick={() => {
                setSheetFilterPlan('all')
                setSheetFilterPlanStatus('all')
                setSheetFilterStatus('all')
                setSheetNameOrder('default')
                setSheetCreatedFrom('')
                setSheetCreatedTo('')
                setFilterPlan('all')
                setFilterPlanStatus('all')
                setFilterStatus('all')
                setNameOrder('default')
                setCreatedFrom('')
                setCreatedTo('')
                setFiltersSheetOpen(false)
              }}
            >
              Limpiar filtros
            </Button>
            <Button
              onClick={() => {
                setFilterPlan(sheetFilterPlan)
                setFilterPlanStatus(sheetFilterPlanStatus)
                setFilterStatus(sheetFilterStatus)
                setNameOrder(sheetNameOrder)
                setCreatedFrom(sheetCreatedFrom)
                setCreatedTo(sheetCreatedTo)
                setFiltersSheetOpen(false)
              }}
            >
              Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DashboardPageContainer>
  )
}
