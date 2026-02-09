'use client'

import { ColumnDef } from '@tanstack/react-table'
import type { Member } from '@repo/core/types'
import RoleBadge from '../../../shared/badges/role-badge'
import StatusBadge from '../../../shared/badges/status-badge'
import AvatarColumn from './avatar-column'
import { formatDate } from 'date-fns'

export const columns: ColumnDef<Member>[] = [
  {
    accessorKey: 'imageUrl',
    header: '',
    cell: ({ row }) => {
      const member = row.original
      return <AvatarColumn member={member} />
    },
  },
  {
    accessorKey: 'name',
    header: 'Nombre',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Rol',
    cell: ({ row }) => {
      const member = row.original
      return <RoleBadge role={member.role} />
    },
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => {
      const member = row.original
      return <StatusBadge status={member.status} />
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Creado el',
    cell: ({ row }) => {
      const member = row.original
      return (
        <span className="text-sm text-muted-foreground">
          {formatDate(member.createdAt, 'dd/MM/yyyy')}
        </span>
      )
    },
  },
]
