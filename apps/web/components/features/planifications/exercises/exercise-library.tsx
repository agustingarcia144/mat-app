'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Image from 'next/image'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import CreateExerciseDialog from '@/components/features/planifications/exercises/create-exercise-dialog'
import { toast } from 'sonner'

interface ExerciseLibraryProps {
  /** When true, shows edit and delete actions on each exercise card */
  showActions?: boolean
}

export default function ExerciseLibrary({
  showActions = false,
}: ExerciseLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [exerciseToEdit, setExerciseToEdit] = useState<Doc<'exercises'> | null>(
    null
  )
  const [exerciseToDelete, setExerciseToDelete] =
    useState<Doc<'exercises'> | null>(null)

  const exercises = useQuery(api.exercises.search, {
    searchTerm,
  })
  const removeExercise = useMutation(api.exercises.remove)

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
        <Button
          onClick={() => {
            setExerciseToEdit(null)
            setShowCreateDialog(true)
          }}
        >
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
          exercises.map((exercise) => {
            const thumbnailUrl = exercise.videoUrl
              ? getVideoThumbnailUrl(exercise.videoUrl)
              : null
            return (
              <div
                key={exercise._id}
                className="border rounded-lg overflow-hidden hover:border-primary transition-colors group relative"
              >
                {thumbnailUrl && (
                  <a
                    href={exercise.videoUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-video w-full bg-muted relative"
                  >
                    <Image
                      src={thumbnailUrl}
                      alt={`Miniatura de ${exercise.name}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </a>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
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
                    {showActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setExerciseToEdit(exercise)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setExerciseToDelete(exercise)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <CreateExerciseDialog
        open={showCreateDialog || !!exerciseToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false)
            setExerciseToEdit(null)
          }
        }}
        exercise={exerciseToEdit}
      />

      <Dialog
        open={!!exerciseToDelete}
        onOpenChange={(open) => !open && setExerciseToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar ejercicio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar &quot;
              {exerciseToDelete?.name}&quot;? Esta acción no se puede deshacer.
              No podrás eliminarlo si está siendo usado en alguna planificación.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExerciseToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!exerciseToDelete) return
                try {
                  await removeExercise({ id: exerciseToDelete._id })
                  setExerciseToDelete(null)
                } catch (error) {
                  console.error('Failed to delete exercise:', error)
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Error al eliminar el ejercicio'
                  )
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
