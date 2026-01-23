import { Badge } from '@/components/ui/badge'
import { UserRound } from 'lucide-react'

function RoleBadge({ role }: { role: string }) {
  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador'
      case 'trainer':
        return 'Entrenador'
      case 'member':
        return 'Miembro'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <UserRound className="w-4 h-4 text-green-500" />
      case 'trainer':
        return <UserRound className="w-4 h-4 text-blue-500" />
      case 'member':
        return <UserRound className="w-4 h-4 text-gray-500" />
    }
  }
  return (
    <Badge
      variant="outline"
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      {getRoleIcon(role)}
      {getRoleText(role)}
    </Badge>
  )
}

export default RoleBadge
