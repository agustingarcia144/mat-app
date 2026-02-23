'use client'

import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Member } from '@repo/core'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  trainer: 'Entrenador',
  member: 'Miembro',
}

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role?.toLowerCase()] ?? role ?? '—'
}

function UserNameCell({ member }: { member: Member }) {
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

function UserActionsCell({ member }: { member: Member }) {
  const { user: currentUser } = useUser()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isSelf = currentUser?.id === member.id

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/secure/organization/members/${member.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Error al eliminar el usuario')
        return
      }
      toast.success('Usuario eliminado del equipo')
      setConfirmOpen(false)
    } catch {
      toast.error('Error al eliminar el usuario')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Abrir menú</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isSelf}
            onClick={() => !isSelf && setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {isSelf ? 'No puedes eliminarte' : 'Eliminar del equipo'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario del equipo</DialogTitle>
            <DialogDescription>
              {member.name} perderá el acceso a esta organización. Los datos
              históricos (asignaciones, reservas, etc.) se conservan. Esta
              acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const nameColumn: ColumnDef<Member> = {
  accessorKey: 'name',
  header: () => <div className="pl-1">Nombre</div>,
  cell: ({ row }) => <UserNameCell member={row.original} />,
}

export const getColumns = (): ColumnDef<Member>[] => [
  nameColumn,
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Rol',
    cell: ({ row }) => {
      const role = row.original.role?.toLowerCase()
      const label = getRoleLabel(row.original.role ?? '')
      const variant =
        role === 'admin'
          ? 'default'
          : role === 'trainer'
            ? 'secondary'
            : 'outline'
      return <Badge variant={variant}>{label}</Badge>
    },
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => {
      const status = row.original.status?.toLowerCase()
      const isActive = status === 'active'
      return (
        <Badge
          className={
            isActive
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }
        >
          {isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Creado el',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <UserActionsCell member={row.original} />,
  },
]
