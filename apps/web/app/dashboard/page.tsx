'use client'

import { useState } from 'react'
import Image from 'next/image'
import { type Id } from '@/convex/_generated/dataModel'
import wolfiBg from '../../assets/mat-wolf-looking.png'

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
    <div className="relative p-6 space-y-6 w-full max-w-[1400px] mx-auto">
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
  <Image
    src={wolfiBg}
    alt="Wolf de fondo"
    priority
    className="w-[900px] h-auto object-contain opacity-[0.18] saturate-175 contrast-115 brightness-105 select-none"
  />
</div>

      <div className="relative z-10">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen general de la organización
        </p>
      </div>

      <div className="relative z-10 grid gap-3 md:grid-cols-[minmax(150px,240px)_minmax(300px,380px)_1.2fr] items-stretch">
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