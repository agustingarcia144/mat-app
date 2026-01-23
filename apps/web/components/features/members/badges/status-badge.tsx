import { Badge } from '@/components/ui/badge'
import React from 'react'
import { CheckCircle, CircleX } from 'lucide-react'

function StatusBadge({ status }: { status: string }) {
  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Activo'
      case 'inactive':
        return 'Inactivo'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'inactive':
        return <CircleX className="w-4 h-4 text-red-500" />
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

export default StatusBadge
