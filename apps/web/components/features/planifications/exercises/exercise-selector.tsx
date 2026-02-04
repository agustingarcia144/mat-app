'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import Image from 'next/image'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface ExerciseSelectorProps {
  onSelect: (exercise: { id: string; name: string }) => void
}

export default function ExerciseSelector({ onSelect }: ExerciseSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const exercises = useQuery(api.exercises.search, {
    searchTerm,
  })

  const handleSelect = (exercise: { _id: string; name: string }) => {
    onSelect({ id: exercise._id, name: exercise.name })
    setOpen(false)
    setSearchTerm('')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Agregar ejercicio
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Seleccionar ejercicio</SheetTitle>
          <SheetDescription>
            Busca y selecciona un ejercicio de la biblioteca
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar ejercicios..."
              className="pl-9"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
            {exercises === undefined ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))
            ) : exercises.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No se encontraron ejercicios</p>
                <p className="text-sm mt-1">
                  {searchTerm
                    ? 'Intenta con otro término'
                    : 'Crea ejercicios en la biblioteca'}
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
                    className="border rounded-lg overflow-hidden hover:border-primary cursor-pointer transition-colors"
                    onClick={() => handleSelect(exercise)}
                  >
                    {thumbnailUrl && (
                      <div className="aspect-video w-full bg-muted relative">
                        <Image
                          src={thumbnailUrl}
                          alt={`Miniatura de ${exercise.name}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 512px) 100vw, 512px"
                        />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">
                            {exercise.name}
                          </h4>
                          {exercise.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                              {exercise.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {exercise.category}
                        </Badge>
                        {exercise.equipment && (
                          <span className="text-xs text-muted-foreground">
                            {exercise.equipment}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
