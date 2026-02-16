'use client'

import { use } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import PlanificationEditForm from '@/components/features/planifications/form/planification-edit-form'

export default function EditPlanificationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const planification = useQuery(api.planifications.getById, {
    id: id as any,
  })

  if (planification === undefined) {
    return (
      <div className="w-full py-6">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="w-full py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href={`/dashboard/planifications/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Link>
        </Button>

        <h1 className="text-3xl font-bold">Editar planificación</h1>
        <p className="text-muted-foreground mt-1">{planification.name}</p>
      </div>

      <PlanificationEditForm />
    </div>
  )
}
