'use client'

import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import PlanificationForm from '@/components/features/planifications/form/planification-form'

export default function NewPlanificationPage() {
  const router = useRouter()

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>

        <h1 className="text-3xl font-bold">Nueva planificación</h1>
        <p className="text-muted-foreground mt-1">
          Crea un nuevo programa de entrenamiento
        </p>
      </div>

      <PlanificationForm />
    </div>
  )
}
