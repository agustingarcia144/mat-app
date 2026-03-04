import { Badge } from '@/components/ui/badge'
import { UserRound } from 'lucide-react'

function RoleBadge({ role }: { role: string }) {
  const getRoleText = (role: string): string => {
    switch (role) {
      case 'admin':
        return 'Administrador'
      case 'trainer':
        return 'Entrenador'
      case 'member':
        return 'Miembro'
      default:
        return role.charAt(0).toUpperCase() + role.slice(1)
    }
  }

  const getVariant = (role: string): 'dark' | 'outline' => {
    switch (role) {
      case 'admin':
      case 'trainer':
      case 'member':
        return 'dark'
      default:
        return 'outline'
    }
  }

  const getIconColor = (role: string): string => {
    switch (role) {
      case 'admin':
        return 'text-green-500'
      case 'trainer':
        return 'text-blue-400'
      case 'member':
        return 'text-zinc-400'
      default:
        return 'text-zinc-400'
    }
  }

  return (
    <Badge
      variant={getVariant(role)}
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      <UserRound className={`h-4 w-4 shrink-0 ${getIconColor(role)}`} />
      {getRoleText(role)}
    </Badge>
  )
}

export default RoleBadge
