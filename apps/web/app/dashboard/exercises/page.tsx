'use client'

import ExerciseLibrary from '@/components/features/planifications/exercises/exercise-library'

export default function EjerciciosPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ejercicios</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona la biblioteca de ejercicios de tu organización
        </p>
      </div>

      <ExerciseLibrary showActions />
    </div>
  )
}
