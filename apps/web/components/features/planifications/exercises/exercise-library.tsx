'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import CreateExerciseDialog from '@/components/features/planifications/exercises/create-exercise-dialog'

export default function ExerciseLibrary() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const exercises = useQuery(api.exercises.search, {
    searchTerm,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar ejercicios..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo ejercicio
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exercises === undefined ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4">
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))
        ) : exercises.length === 0 ? (
          <div className="col-span-full text-center py-12 border rounded-lg border-dashed">
            <p className="text-muted-foreground">
              No se encontraron ejercicios
            </p>
          </div>
        ) : (
          exercises.map((exercise) => (
            <div
              key={exercise._id}
              className="border rounded-lg p-4 hover:border-primary transition-colors"
            >
              <h3 className="font-semibold mb-2">{exercise.name}</h3>
              {exercise.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {exercise.description}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {exercise.category}
                </Badge>
                {exercise.equipment && (
                  <Badge variant="outline" className="text-xs">
                    {exercise.equipment}
                  </Badge>
                )}
                {exercise.muscleGroups.map((muscle) => (
                  <Badge
                    key={muscle}
                    variant="outline"
                    className="text-xs capitalize"
                  >
                    {muscle}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <CreateExerciseDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  )
}
