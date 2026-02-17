'use client'

import { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Check, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLibraryExerciseNames } from '@/contexts/library-exercise-names-context'
import LibraryExerciseCard from '@/components/features/planifications/exercises/library-exercise-card'

interface ExerciseSelectorProps {
  /** Optional: called when user clicks an exercise (e.g. add to day). Drag-and-drop is the primary way to add. */
  onSelect?: (exercise: { id: string; name: string }) => void
  className?: string
}

export default function ExerciseSelector({
  onSelect,
  className,
}: ExerciseSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(
    null
  )
  const libraryNames = useLibraryExerciseNames()

  const { categories, equipment } = useQuery(api.exercises.listFacets) ?? {
    categories: [] as string[],
    equipment: [] as string[],
  }

  const exercises = useQuery(api.exercises.search, {
    searchTerm,
    category: selectedCategory ?? undefined,
    equipment: selectedEquipment ?? undefined,
  })

  useEffect(() => {
    if (!libraryNames || !exercises?.length) return
    const names: Record<string, string> = {}
    for (const ex of exercises) {
      names[ex._id] = ex.name
    }
    libraryNames.setNames(names)
  }, [libraryNames, exercises])

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 overflow-hidden ${className ?? ''}`}
    >
      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar ejercicios..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2 mb-3 shrink-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Categoría
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat
              return (
                <Badge
                  key={cat}
                  variant={isActive ? 'default' : 'secondary'}
                  className="cursor-pointer text-xs rounded-full gap-1"
                  onClick={() =>
                    setSelectedCategory((prev) => (prev === cat ? null : cat))
                  }
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {cat}
                </Badge>
              )
            })}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Equipamiento
          </p>
          <div className="flex flex-wrap gap-1.5">
            {equipment.map((eq) => {
              const isActive = selectedEquipment === eq
              return (
                <Badge
                  key={eq}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer text-xs rounded-full gap-1"
                  onClick={() =>
                    setSelectedEquipment((prev) => (prev === eq ? null : eq))
                  }
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {eq}
                </Badge>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 shrink-0">
        Arrastra un ejercicio a un bloque o a &quot;Sin bloque&quot; para
        añadirlo al día.
      </p>

      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 pb-2">
          {exercises === undefined ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-5 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          ) : exercises.length === 0 ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              <p>No se encontraron ejercicios</p>
              <p className="text-sm mt-1">
                {searchTerm
                  ? 'Intenta con otro término'
                  : 'Crea ejercicios en la biblioteca'}
              </p>
            </div>
          ) : (
            exercises.map((exercise) => (
              <div
                key={exercise._id}
                onClick={() =>
                  onSelect?.({ id: exercise._id, name: exercise.name })
                }
                className={onSelect ? 'cursor-pointer min-w-0' : 'min-w-0'}
              >
                <LibraryExerciseCard exercise={exercise} />
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
