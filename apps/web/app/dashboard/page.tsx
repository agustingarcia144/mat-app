'use client'

import ActiveMembers from '@/components/features/dashboard/ActiveMembers'
import PlanificationStatus from '@/components/features/dashboard/PlanificationStatus'

export default function Page() {
  return (
    <div className="p-6 space-y-6">
      
      <div>
        <h1 className="text-3xl font-bold text-white-500">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen general de la organización
        </p>
      </div>

      <div className="flex flex-wrap gap-6">
        <ActiveMembers />
        <PlanificationStatus />
      </div>
    </div>
  )
}