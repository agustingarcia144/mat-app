import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import React from 'react'

function ClassStatusBadge({ status }: { status: string }) {
  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Programada'
      case 'cancelled':
        return 'Cancelada'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
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
