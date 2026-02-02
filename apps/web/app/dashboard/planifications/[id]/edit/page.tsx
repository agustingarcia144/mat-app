'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import PlanificationEditForm from '@/components/features/planifications/form/planification-edit-form'

export default function EditPlanificationPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()

  const planification = useQuery(api.planifications.getById, {
    id: params.id as any,
  })

  if (planification === undefined) {
    return (
      <div className="container mx-auto py-6 max-w-5xl">
        <Skeleton className="h-10 w-40 mb-6" />
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!planification) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p>Planificación no encontrada</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/planifications/${params.id}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>

        <h1 className="text-3xl font-bold">Editar planificación</h1>
        <p className="text-muted-foreground mt-1">{planification.name}</p>
      </div>

      <PlanificationEditForm
        planificationId={params.id}
        initialData={planification}
      />
    </div>
  )
}
