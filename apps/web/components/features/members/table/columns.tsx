'use client'

import { ColumnDef } from '@tanstack/react-table'
import {
  Eye,
  MoreVertical,
  UserCheck,
  UserRoundPlus,
  Users,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { api } from '@/convex/_generated/api'
import type { Member } from '@repo/core'
import AssociateFamilyGroupDialog from '@/components/features/members/table/associate-family-group-dialog'
import { cn } from '@/lib/utils'

export type PlanPaymentStatus =
  | 'pago'
  | 'pendiente'
  | 'en_revision'
  | 'vencido'
  | 'none'

export type MemberTableRow = Member & {
  assignedPlanName: string
  planBillingMode: 'calendar' | 'join_date'
  planDueDayLabel: string
  planPaymentStatus: PlanPaymentStatus
  // What this member's group is charged per period; null for family
  // dependents, whose fee is billed to the head of the group.
  planAmountArs: number | null
  familyMemberCount: number
  familyPayerName: string | null
  paymentDueAt: number | null
  lastPaidAt: number | null
  suspendedAt: number | null
  responsibleName?: string | null
  joinedAtTimestamp: number
  // undefined while attendance is loading or not part of the plan;
  // null when the member has never been seen.
  daysSinceLastActivity?: number | null
  activeDaysLast30?: number
}

export const AT_RISK_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export function isMemberInactive(status?: string) {
  const normalized = status?.toLowerCase() ?? ''
  return normalized === 'inactive' || normalized === 'inactivo'
}

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp))
}

function formatMonthYear(timestamp: number) {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))
}

function formatArs(value: number) {
  return `$${Math.round(value).toLocaleString('es-AR')}`
}

function daysFromToday(timestamp: number) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const target = new Date(timestamp)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - startOfToday.getTime()) / DAY_MS)
}

function formatTenure(timestamp: number) {
  const months = Math.floor((Date.now() - timestamp) / (30.44 * DAY_MS))
  if (months < 1) return 'Nuevo'
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  const years = Math.floor(months / 12)
  return `${years} ${years === 1 ? 'año' : 'años'}`
}

export function isBirthdayToday(birthday?: string): boolean {
  if (!birthday) return false
  const parts = birthday.split('-')
  if (parts.length < 3) return false
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!month || !day) return false
  const today = new Date()
  return today.getMonth() + 1 === month && today.getDate() === day
}

function MemberNameCell({ member }: { member: MemberTableRow }) {
  const initials =
    member.fullName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    '?'

  const isToday = isBirthdayToday(member.birthday)
  const isInactive = isMemberInactive(member.status)

  return (
    <div className={cn('flex items-center gap-3', isInactive && 'opacity-60')}>
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          {member.imageUrl && <AvatarImage src={member.imageUrl} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {isToday && (
          <span className="absolute -top-1 -right-1 text-sm leading-none animate-bounce">🎂</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium leading-tight">{member.name}</span>
          {isInactive && (
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
            >
              Inactivo
            </Badge>
          )}
        </div>
        {isToday ? (
          <span className="text-xs font-semibold leading-tight text-pink-400">
            ¡Feliz cumpleaños!
          </span>
        ) : (
          <span className="truncate text-xs leading-tight text-muted-foreground">
            {member.email || 'Sin email'}
          </span>
        )}
      </div>
    </div>
  )
}

function MemberActionsCell({ member }: { member: MemberTableRow }) {
  const [open, setOpen] = useState(false)
  const [associateFamilyOpen, setAssociateFamilyOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const setMemberInactive = useMutation(
    api.organizationMemberships.setMemberInactive
  )
  const setMemberActive = useMutation(api.organizationMemberships.setMemberActive)
  const isInactive = isMemberInactive(member.status)
  const hasPlan = member.assignedPlanName !== 'Sin Plan'

  const handleUpdateStatus = async () => {
    const shouldContinue = window.confirm(
      isInactive
        ? 'Este miembro pasará a estado activo. ¿Deseas continuar?'
        : 'Este miembro pasará a estado inactivo. ¿Deseas continuar?'
    )
    if (!shouldContinue) return

    setIsUpdatingStatus(true)
    try {
      if (isInactive) {
        await setMemberActive({ userId: member.id })
        toast.success('Miembro activado')
      } else {
        await setMemberInactive({ userId: member.id })
        toast.success('Miembro marcado como inactivo')
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el estado del miembro'
      )
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    // Row clicks open the detail dialog; keep menu and dialog clicks from
    // bubbling into that handler (React bubbles through portals too).
    <div onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Abrir menú de acciones"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Ver
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setAssociateFamilyOpen(true)}
              disabled={isInactive || hasPlan}
            >
              <UserRoundPlus className="mr-2 h-4 w-4" />
              Asociar a Grupo Familiar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void handleUpdateStatus()
              }}
              disabled={isUpdatingStatus}
            >
              {isInactive ? (
                <UserCheck className="mr-2 h-4 w-4" />
              ) : (
                <UserX className="mr-2 h-4 w-4" />
              )}
              {isInactive ? 'Activar usuario' : 'Marcar como inactivo'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open ? (
        <MemberDetailDialog
          member={member}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {associateFamilyOpen ? (
        <AssociateFamilyGroupDialog
          memberId={member.id}
          memberName={member.name}
          open={associateFamilyOpen}
          onOpenChange={setAssociateFamilyOpen}
        />
      ) : null}
    </div>
  )
}

export const PLAN_PAYMENT_STATUS_LABEL: Record<PlanPaymentStatus, string> = {
  pago: 'Al día',
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  vencido: 'Vencido',
  none: 'Sin plan',
}

export const PLAN_PAYMENT_STATUS_DOT: Record<PlanPaymentStatus, string> = {
  pago: 'bg-emerald-500',
  pendiente: 'bg-amber-500',
  en_revision: 'bg-sky-500',
  vencido: 'bg-red-500',
  none: 'bg-muted-foreground/40',
}

const PLAN_PAYMENT_STATUS_BADGE: Record<PlanPaymentStatus, string> = {
  pago: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pendiente: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  en_revision: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  vencido: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  none: 'border-border bg-transparent text-muted-foreground',
}

function PlanPaymentStatusBadge({ status }: { status: PlanPaymentStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'gap-1.5 rounded-full px-2 py-0.5 font-medium',
        PLAN_PAYMENT_STATUS_BADGE[status]
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', PLAN_PAYMENT_STATUS_DOT[status])}
        aria-hidden
      />
      {PLAN_PAYMENT_STATUS_LABEL[status]}
    </Badge>
  )
}

/** One line of context under the status: when it is due, paid or overdue. */
function getPaymentDetail(member: MemberTableRow): {
  text: string
  tone?: 'danger' | 'warning'
} | null {
  switch (member.planPaymentStatus) {
    case 'vencido':
      if (member.suspendedAt) {
        const days = -daysFromToday(member.suspendedAt)
        return {
          text: days <= 0 ? 'Desde hoy' : `Hace ${days} ${days === 1 ? 'día' : 'días'}`,
          tone: 'danger',
        }
      }
      return null
    case 'pendiente': {
      if (!member.paymentDueAt) {
        return member.planDueDayLabel !== '-'
          ? { text: `Vence el ${member.planDueDayLabel.toLowerCase()}` }
          : null
      }
      const days = daysFromToday(member.paymentDueAt)
      if (days < 0) {
        const late = -days
        return {
          text: `Atrasado ${late} ${late === 1 ? 'día' : 'días'}`,
          tone: 'danger',
        }
      }
      if (days === 0) return { text: 'Vence hoy', tone: 'warning' }
      return {
        text: `Vence ${formatShortDate(member.paymentDueAt)}`,
        tone: days <= 3 ? 'warning' : undefined,
      }
    }
    case 'en_revision':
      return { text: 'Comprobante a revisar' }
    case 'pago':
      return member.lastPaidAt
        ? { text: `Pagó ${formatShortDate(member.lastPaidAt)}` }
        : null
    default:
      return null
  }
}

function PaymentCell({ member }: { member: MemberTableRow }) {
  const detail = getPaymentDetail(member)

  return (
    <div className='flex flex-col items-start gap-1'>
      <PlanPaymentStatusBadge status={member.planPaymentStatus} />
      {detail ? (
        <span
          className={cn(
            'text-xs',
            detail.tone === 'danger'
              ? 'text-red-600 dark:text-red-400'
              : detail.tone === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
          )}
        >
          {detail.text}
        </span>
      ) : null}
    </div>
  )
}

function PlanCell({ member }: { member: MemberTableRow }) {
  if (member.planPaymentStatus === 'none') {
    return <span className='text-sm text-muted-foreground'>Sin plan</span>
  }

  return (
    <div className='flex min-w-0 flex-col'>
      <span className='truncate font-medium leading-tight'>
        {member.assignedPlanName}
      </span>
      <span className='flex items-center gap-1 text-xs text-muted-foreground'>
        {member.familyPayerName ? (
          <>
            <Users className='h-3 w-3' aria-hidden />
            <span className='truncate'>Paga {member.familyPayerName}</span>
          </>
        ) : (
          <>
            {member.planAmountArs !== null
              ? `${formatArs(member.planAmountArs)}/mes`
              : null}
            {member.familyMemberCount > 1 ? (
              <span className='inline-flex items-center gap-1'>
                · <Users className='h-3 w-3' aria-hidden />
                {member.familyMemberCount}
              </span>
            ) : null}
          </>
        )}
      </span>
    </div>
  )
}

function LastVisitCell({ member }: { member: MemberTableRow }) {
  const days = member.daysSinceLastActivity

  if (days === undefined) {
    return <span className='text-sm text-muted-foreground'>…</span>
  }

  const label =
    days === null
      ? 'Sin visitas'
      : days === 0
        ? 'Hoy'
        : days === 1
          ? 'Ayer'
          : `Hace ${days} días`
  const tone =
    days === null || days > AT_RISK_DAYS
      ? 'bg-red-500'
      : days > 7
        ? 'bg-amber-500'
        : 'bg-emerald-500'
  const visits = member.activeDaysLast30 ?? 0

  return (
    <div className='flex flex-col'>
      <span className='flex items-center gap-1.5 text-sm leading-tight'>
        <span className={cn('h-1.5 w-1.5 rounded-full', tone)} aria-hidden />
        {label}
      </span>
      <span className='pl-3 text-xs text-muted-foreground'>
        {visits} {visits === 1 ? 'visita' : 'visitas'} en 30 días
      </span>
    </div>
  )
}

function MemberSinceCell({ member }: { member: MemberTableRow }) {
  if (!member.joinedAtTimestamp) {
    return <span className='text-sm text-muted-foreground'>—</span>
  }

  return (
    <div className='flex flex-col'>
      <span className='text-sm capitalize leading-tight'>
        {formatMonthYear(member.joinedAtTimestamp)}
      </span>
      <span className='text-xs text-muted-foreground'>
        {formatTenure(member.joinedAtTimestamp)}
      </span>
    </div>
  )
}

const nameColumn: ColumnDef<MemberTableRow> = {
  accessorKey: 'name',
  header: 'Miembro',
  cell: ({ row }) => <MemberNameCell member={row.original} />,
}

export const getColumns = (
  options: { showLastVisitColumn?: boolean; showResponsibleColumn?: boolean } = {}
): ColumnDef<MemberTableRow>[] => {
  const columns: ColumnDef<MemberTableRow>[] = [
    nameColumn,
    {
      accessorKey: 'assignedPlanName',
      header: 'Plan',
      cell: ({ row }) => <PlanCell member={row.original} />,
    },
    {
      accessorKey: 'planPaymentStatus',
      header: 'Pago',
      cell: ({ row }) => <PaymentCell member={row.original} />,
    },
  ]

  if (options.showLastVisitColumn) {
    columns.push({
      id: 'lastVisit',
      header: 'Última visita',
      cell: ({ row }) => <LastVisitCell member={row.original} />,
    })
  }

  if (options.showResponsibleColumn) {
    columns.push({
      id: 'responsible',
      header: 'Responsable',
      cell: ({ row }) =>
        row.original.responsibleName ? (
          <span className='text-sm'>{row.original.responsibleName}</span>
        ) : (
          <span className='text-sm text-muted-foreground'>—</span>
        ),
    })
  }

  columns.push(
    {
      id: 'memberSince',
      header: 'Miembro desde',
      cell: ({ row }) => <MemberSinceCell member={row.original} />,
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>Acciones</span>,
      cell: ({ row }) => <MemberActionsCell member={row.original} />,
    }
  )

  return columns
}
