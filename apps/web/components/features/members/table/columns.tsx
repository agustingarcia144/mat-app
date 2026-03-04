'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import StatusBadge from '@/components/shared/badges/status-badge'
import { useState } from 'react'
import MemberDetailDialog from '@/components/features/members/table/member-detail-dialog'
import type { Member } from '@repo/core'


const nameColumn: ColumnDef<Member> = {
  accessorKey: 'name',
  header: () => (
    <div className="pl-1">Nombre</div>
  ),
  cell: ({ row }) => {
    const member = row.original
    const [open, setOpen] = useState(false)

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
      <>
        <div className="flex items-center gap-3">

          
          <Avatar className="h-8 w-8">
            {member.imageUrl && (
              <AvatarImage src={member.imageUrl} />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

        
          <Button
            size="sm"
            variant="ghost"
            className="flex items-center gap-1 px-2"
            onClick={() => setOpen(true)}
          >
            <Eye className="h-4 w-4" />
            <span className="text-xs">Ver</span>
          </Button>

          
          <span className="font-medium">
            {member.name}
          </span>
        </div>

        <MemberDetailDialog
          member={member}
          open={open}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
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
]
