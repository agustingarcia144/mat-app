'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import CreateExerciseDialog from './create-exercise-dialog'
import VideoPlayer from './videoplayer'

import Image from 'next/image'
import wolfImg from '@/assets/mat-wolf-looking.png'

import {
  CATEGORIES,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUPS,
} from '@repo/core'


type FilterType = 'none' | 'category' | 'muscle' | 'equipment'

const normalize = (v?: string) =>
  (v ?? '').toString().trim().toLowerCase()

export default function ExerciseLibrary() {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] =
    useState<FilterType>('none')
  const [filterValue, setFilterValue] = useState('')
  const [showCreateDialog, setShowCreateDialog] =
    useState(false)

  const [exerciseToEdit, setExerciseToEdit] =
    useState<Doc<'exercises'> | null>(null)

  const [exerciseToDelete, setExerciseToDelete] =
    useState<Doc<'exercises'> | null>(null)

  const exercises = useQuery(
    api.exercises.getByOrganization
  )
  const removeExercise = useMutation(api.exercises.remove)

  const list = exercises ?? []

  const filtered = useMemo(() => {
    const term = normalize(search)
    const selected = normalize(filterValue)

    const isAll =
      !selected ||
      selected === 'all' ||
      selected === 'todos'

    return list.filter((e) => {
      const matchesSearch =
        !term ||
        normalize(e.name).includes(term) ||
        normalize(e.description).includes(term) ||
        (Array.isArray(e.muscleGroups) &&
          e.muscleGroups.some((m) =>
            normalize(m).includes(term)
          )) ||
        normalize(e.category).includes(term) ||
        normalize(e.equipment).includes(term)

      let matchesFilter = true

      if (filterType === 'category' && !isAll) {
        matchesFilter =
          normalize(e.category) === selected
      }

      if (filterType === 'equipment' && !isAll) {
        matchesFilter =
          normalize(e.equipment) === selected
      }

      if (filterType === 'muscle' && !isAll) {
        matchesFilter =
          Array.isArray(e.muscleGroups) &&
          e.muscleGroups.some(
            (m) => normalize(m) === selected
          )
      }

      return matchesSearch && matchesFilter
    })
  }, [list, search, filterType, filterValue])

  const getOptions = () => {
    if (filterType === 'category') return CATEGORIES
    if (filterType === 'muscle') return MUSCLE_GROUPS
    if (filterType === 'equipment')
      return EQUIPMENT_OPTIONS
    return []
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ejercicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Filtros
          </span>

          <Select
            value={filterType}
            onValueChange={(v) => {
              setFilterType(v as FilterType)
              setFilterValue('')
            }}
          >
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todos</SelectItem>
              <SelectItem value="category">
                Categoría
              </SelectItem>
              <SelectItem value="muscle">
                Músculo
              </SelectItem>
              <SelectItem value="equipment">
                Equipo
              </SelectItem>
            </SelectContent>
          </Select>

          {filterType !== 'none' && (
            <Select
              value={filterValue}
              onValueChange={setFilterValue}
            >
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>

                {getOptions().map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Button
          className="md:ml-auto"
          onClick={() => {
            setExerciseToEdit(null)
            setShowCreateDialog(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
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
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 border rounded-lg border-dashed">
            <p className="text-muted-foreground">
              No se encontraron ejercicios
            </p>
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e._id}
              className="border rounded-lg overflow-hidden hover:border-primary transition-colors group relative"
            >
              {e.videoUrl ? (
                <VideoPlayer
                  videoUrl={e.videoUrl}
                  title={e.name}
                />
              ) : (
                <div className="aspect-video w-full relative bg-muted flex items-center justify-center">
  <div className="relative w-[90%] h-[90%]">
    <Image
      src={wolfImg}
      alt="WOLFI NO ENCUENTRA TU VIDEO"
      fill
      className="object-contain opacity-80"
    />
  </div>

  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
    <span className="text-xs text-white opacity-80">
      WOLFI NO ENCUENTRA TU VIDEO
    </span>
  </div>
</div>

              )}

              <div
                className="p-4 cursor-pointer"
                onClick={() => setExerciseToEdit(e)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-2">
                      {e.name}
                    </h3>

                    {e.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {e.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {e.category && (
                        <Badge variant="secondary" className="text-xs">
                          {e.category}
                        </Badge>
                      )}

                      {e.equipment && (
                        <Badge variant="outline" className="text-xs">
                          {e.equipment}
                        </Badge>
                      )}

                      {Array.isArray(e.muscleGroups) &&
                        e.muscleGroups.map((m) => (
                          <Badge
                            key={m}
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {m}
                          </Badge>
                        ))}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(ev) =>
                          ev.stopPropagation()
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setExerciseToEdit(e)
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setExerciseToDelete(e)
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))
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
        onOpenChange={(open) =>
          !open && setExerciseToDelete(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Eliminar ejercicio
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar "
              {exerciseToDelete?.name}"?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setExerciseToDelete(null)
              }
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              onClick={async () => {
                if (!exerciseToDelete) return
                await removeExercise({
                  id: exerciseToDelete._id,
                })
                setExerciseToDelete(null)
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
