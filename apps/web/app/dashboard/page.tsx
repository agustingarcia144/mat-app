'use client'

import { useState } from 'react'
import { type Id } from '@/convex/_generated/dataModel'

import ActiveMembers from '@/components/features/dashboard/ActiveMembers'
import PlanificationStatus from '@/components/features/dashboard/PlanificationStatus'
import NextClassCard from '@/components/features/dashboard/NextClassCard'
import ScheduleDetailDialog from '@/components/features/classes/dialogs/schedule-detail-dialog'

export default function Page() {
  
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] =
    useState<Id<'classSchedules'> | undefined>()

  const handleOpenScheduleDetail = (id: Id<'classSchedules'>) => {
    setSelectedScheduleId(id)
    setScheduleDetailOpen(true)
  }

  const handleClose = () => {
    setScheduleDetailOpen(false)
    setSelectedScheduleId(undefined)
  }

  return (
    <div className="p-6 space-y-6 w-full max-w-[1400px] mx-auto">
      
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen general de la organización
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(150px,240px)_minmax(300px,380px)_1.2fr] items-stretch">
        <ActiveMembers />
        <PlanificationStatus />
        <NextClassCard onOpenDetail={handleOpenScheduleDetail} />
      </div>

      {selectedScheduleId && (
        <ScheduleDetailDialog
          open={scheduleDetailOpen}
          onOpenChange={handleClose}
          scheduleId={selectedScheduleId}
        />
      )}
    </div>
  )
}