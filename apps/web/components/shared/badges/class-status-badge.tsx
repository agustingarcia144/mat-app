import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, XCircle } from 'lucide-react'

type ClassStatus = 'scheduled' | 'cancelled' | 'completed'

function ClassStatusBadge({ status }: { status: ClassStatus }) {
  const getStatusText = (status: ClassStatus): string => {
    switch (status) {
      case 'scheduled':
        return 'Programada'
      case 'cancelled':
        return 'Cancelada'
      case 'completed':
        return 'Completada'
      default:
        return 'Desconocido'
    }
  }

  const getVariant = (status: ClassStatus): 'success' | 'destructive' | 'warning' | 'outline' => {
    switch (status) {
      case 'scheduled':
        return 'warning'
      case 'cancelled':
        return 'destructive'
      case 'completed':
        return 'success'
      default:
        return 'outline'
    }
  }

  const Icon = status === 'scheduled' ? Clock : status === 'cancelled' ? XCircle : CheckCircle

  return (
    <Badge
      variant={getVariant(status)}
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      <Icon className="w-4 h-4 shrink-0" />
      {getStatusText(status)}
    </Badge>
  )
}

export default ClassStatusBadge
