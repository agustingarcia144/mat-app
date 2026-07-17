'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Eye, MoreVertical, UserCheck, UserRoundPlus, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import StatusBadge from '@/components/shared/badges/status-badge'
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

export type MemberTableRow = Member & {
  assignedPlanName: string
  planBillingMode: 'calendar' | 'join_date'
  planDueDayLabel: string
  planPaymentStatus: 'pago' | 'pendiente' | 'vencido' | 'none'
  responsibleName?: string | null
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

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          {member.imageUrl && <AvatarImage src={member.imageUrl} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {isToday && (
          <span className="absolute -top-1 -right-1 text-sm leading-none animate-bounce">🎂</span>
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-medium leading-tight">{member.name}</span>
        {isToday && (
          <span className="text-[10px] font-semibold tracking-wide text-pink-400 leading-tight">
            ¡Feliz cumpleaños!
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
  const memberStatus = member.status?.toLowerCase() ?? ''
  const isInactive = memberStatus === 'inactive' || memberStatus === 'inactivo'
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
    <>
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
    </>
  )
}

function PlanPaymentStatusBadge({
  status,
}: {
  status: MemberTableRow['planPaymentStatus']
}) {
  const config = {
    pago:
      'border-green-500/30 bg-green-500/10 text-green-400',
    pendiente:
      'border-amber-500/30 bg-amber-500/10 text-amber-400',
    vencido:
      'border-red-500/30 bg-red-500/10 text-red-400',
    none:
      'border-border bg-background text-muted-foreground',
  } as const

  const label = {
    pago: 'PAGO',
    pendiente: 'PENDIENTE',
    vencido: 'VENCIDO',
    none: '-',
  } as const

  return (
    <Badge
      variant='outline'
      className={`rounded-full px-2.5 py-1 font-medium ${config[status]}`}
    >
      {label[status]}
    </Badge>
  )
}

const nameColumn: ColumnDef<MemberTableRow> = {
  accessorKey: 'name',
  header: () => <div className="pl-1">Nombre</div>,
  cell: ({ row }) => <MemberNameCell member={row.original} />,
}


export const getColumns = (
  options: { showPlanDueDayColumn?: boolean } = {}
): ColumnDef<MemberTableRow>[] => {
  const columns: ColumnDef<MemberTableRow>[] = [
    nameColumn,

    {
      accessorKey: 'email',
      header: 'Email',
    },

    {
      accessorKey: 'assignedPlanName',
      header: 'Plan',
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.assignedPlanName}</span>
      ),
    },
  ]

  if (options.showPlanDueDayColumn) {
    columns.push({
      accessorKey: 'planDueDayLabel',
      header: 'Vencimiento',
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.planDueDayLabel}</span>
      ),
    })
  }

  columns.push(
    {
      accessorKey: 'planPaymentStatus',
      header: 'Estado del plan',
      cell: ({ row }) => (
        <PlanPaymentStatusBadge status={row.original.planPaymentStatus} />
      ),
    },

    {
      id: 'responsible',
      header: 'Responsable',
      cell: ({ row }) =>
        row.original.responsibleName ? (
          <span className='text-sm'>{row.original.responsibleName}</span>
        ) : (
          <span className='text-sm text-muted-foreground'>—</span>
        ),
    },

    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => (
        <StatusBadge status={row.original.status?.toLowerCase() ?? 'inactive'} />
      ),
    },

    {
      accessorKey: 'createdAt',
      header: 'Creado el',
    },

    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => <MemberActionsCell member={row.original} />,
    }
  )

  return columns
}
