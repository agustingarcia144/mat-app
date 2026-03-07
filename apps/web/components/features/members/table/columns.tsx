'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Eye, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import StatusBadge from '@/components/shared/badges/status-badge'
import { useState } from 'react'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Member } from '@repo/core'

function MemberNameCell({ member }: { member: Member }) {
  const initials =
    member.fullName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    '?'

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        {member.imageUrl && <AvatarImage src={member.imageUrl} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{member.name}</span>
    </div>
  )
}

function MemberActionsCell({ member }: { member: Member }) {
  const [open, setOpen] = useState(false)

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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <MemberDetailDialog
        member={member}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const nameColumn: ColumnDef<Member> = {
  accessorKey: 'name',
  header: () => <div className="pl-1">Nombre</div>,
  cell: ({ row }) => <MemberNameCell member={row.original} />,
}


export const getColumns = (): ColumnDef<Member>[] => [
  nameColumn,

  {
    accessorKey: 'email',
    header: 'Email',
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
  },
]
