import React from 'react'
import { ClassesEmptyStateCard } from './classes-empty-state-card'

interface ClassesEmptyStateProps {
  paddingBottom: number
}

export function ClassesEmptyState({ paddingBottom }: ClassesEmptyStateProps) {
  return (
    <ClassesEmptyStateCard
      title="No tienes reservas"
      subtext="Reservá tu lugar en las próximas clases"
      paddingBottom={paddingBottom}
    />
  )
}
