'use client'

import { useState } from 'react'
import Image from 'next/image'
import { type Id } from '@/convex/_generated/dataModel'
import wolfiBg from '../../assets/mat-wolf-looking.png'

import ActiveMembers from '../../components/features/dashboard/ActiveMembers'
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
    <div className="relative mx-auto w-full max-w-[1400px] space-y-4 p-4 md:space-y-6 md:p-6">
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-0 hidden -translate-x-1/2 -translate-y-1/2 md:block">
        <Image
          src={wolfiBg}
          alt="Wolf de fondo"
          priority
          className="h-auto w-[900px] select-none object-contain opacity-[0.10] saturate-75 contrast-95 brightness-95"
        />
      </div>

      <div className="relative z-10">
        <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen general de la organización
        </p>
      </div>

      <div className="relative z-10 grid gap-4 md:gap-6 xl:grid-cols-[560px_minmax(520px,1fr)] xl:items-stretch">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 xl:h-full">
          <ActiveMembers />
          <PlanificationStatus />
        </div>

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
