import { Badge } from '@/components/ui/badge'
import { UserRound } from 'lucide-react'
import { getOrgRoleLabel } from '@/lib/security/roles'

function RoleBadge({ role }: { role: string }) {
  const getRoleText = (role: string): string => {
    return getOrgRoleLabel(role)
  }

  const getVariant = (): 'dark' | 'outline' => 'outline'

  const getIconColor = (role: string): string => {
    const normalized = role.toLowerCase()
    if (normalized.includes('admin')) return 'text-green-500'
    if (
      normalized.includes('trainer') ||
      normalized.includes('teacher') ||
      normalized.includes('instructor')
    ) {
      return 'text-blue-400'
    }
    return 'text-zinc-400'
  }

  return (
    <Badge
      variant={getVariant()}
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      <UserRound className={`h-4 w-4 shrink-0 ${getIconColor(role)}`} />
      {getRoleText(role)}
    </Badge>
  )
}

export default RoleBadge
