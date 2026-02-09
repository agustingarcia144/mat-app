import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import React from 'react'

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

  const getStatusIcon = (status: ClassStatus) => {
    switch (status) {
      case 'scheduled':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }
  return (
    <Badge
      variant="outline"
      className="flex items-center gap-2 px-2 rounded-full w-fit"
    >
      {getStatusIcon(status)}
      {getStatusText(status)}
    </Badge>
  )
}

export default ClassStatusBadge
