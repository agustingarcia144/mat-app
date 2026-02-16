'use client'

import { use, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePlanificationForm } from '@/contexts/planification-form-context'
import { useFieldArray } from 'react-hook-form'

export default function NewDayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: planificationId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { form } = usePlanificationForm()
  const weekIndex = Number(searchParams.get('weekIndex') ?? 0)
  const dayOfWeek = Number(searchParams.get('dayOfWeek') ?? 1)
  const didAppend = useRef(false)

  const { fields, append } = useFieldArray({
    control: form.control,
    name: `workoutWeeks.${weekIndex}.workoutDays`,
  })

  useEffect(() => {
    if (didAppend.current) return
    didAppend.current = true
    const newIndex = fields.length
    append({
      id: `temp-${Date.now()}`,
      name: `Día ${newIndex + 1}`,
      dayOfWeek,
      blocks: [],
      exercises: [],
    })
    router.replace(
      `/dashboard/planifications/${planificationId}/edit/day/${weekIndex}/${newIndex}?new=1`
    )
  }, [planificationId, weekIndex, dayOfWeek, fields.length, append, router])

  return (
    <div className="w-full py-6 flex items-center justify-center text-muted-foreground">
      Creando día...
    </div>
  )
}
