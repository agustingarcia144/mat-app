import { Badge } from '@/components/ui/badge'
import { CheckCircle, CircleX } from 'lucide-react'

function StatusBadge({ status }: { status: string }) {
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'active':
        return 'Activo'
      case 'inactive':
        return 'Inactivo'
      default:
        return 'Desconocido'
    }
  }

  const getVariant = (status: string): 'dark' | 'outline' => {
    switch (status) {
      case 'active':
      case 'inactive':
        return 'outline'
      default:
        return 'outline'
    }
  }

  const Icon = status === 'inactive' ? CircleX : CheckCircle
  const iconColor =
    status === 'inactive' ? 'text-red-500' : 'text-green-500'

  return (
    <Badge
      variant={getVariant(status)}
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      {getStatusText(status)}
    </Badge>
  )
}

export default StatusBadge
