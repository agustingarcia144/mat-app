'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { ResponsiveActionButton } from '@/components/ui/responsive-action-button'
import { Input } from '@/components/ui/input'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { Plus, Search, MoreHorizontal, Pencil, Trash2, SlidersHorizontal } from 'lucide-react'

import CreateExerciseDialog from './create-exercise-dialog'
import VideoPlayer from './videoplayer'

import Image from 'next/image'
import wolfImg from '@/assets/mat-wolf-looking.png'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { CATEGORIES, EQUIPMENT_OPTIONS, MUSCLE_GROUPS } from '@repo/core'

const normalize = (v?: string) => (v ?? '').toString().trim().toLowerCase()

export interface ExerciseLibraryProps {
  showActions?: boolean
}

export default function ExerciseLibrary({
  showActions = true,
}: ExerciseLibraryProps) {
  const [search, setSearch] = useState('')
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [filterMuscles, setFilterMuscles] = useState<string[]>([])
  const [filterEquipment, setFilterEquipment] = useState<string[]>([])
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false)
  const [sheetFilterCategories, setSheetFilterCategories] = useState<string[]>([])
  const [sheetFilterMuscles, setSheetFilterMuscles] = useState<string[]>([])
  const [sheetFilterEquipment, setSheetFilterEquipment] = useState<string[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const toggleInArray = (
    arr: string[],
    value: string,
    setter: (next: string[]) => void
  ) => {
    setter(
      arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
    )
  }

  const [exerciseToEdit, setExerciseToEdit] = useState<Doc<'exercises'> | null>(
    null
  )

  const [exerciseToDelete, setExerciseToDelete] =
    useState<Doc<'exercises'> | null>(null)

  const exercises = useQuery(api.exercises.getByOrganization)
  const removeExercise = useMutation(api.exercises.remove)

  const filtered = useMemo(() => {
    const list = exercises ?? []
    const term = normalize(search)
    const cats = filterCategories.map(normalize)
    const muscles = filterMuscles.map(normalize)
    const equip = filterEquipment.map(normalize)

    return list.filter((e) => {
      const matchesSearch =
        !term ||
        normalize(e.name).includes(term) ||
        normalize(e.description).includes(term) ||
        (Array.isArray(e.muscleGroups) &&
          e.muscleGroups.some((m) => normalize(m).includes(term))) ||
        normalize(e.category).includes(term) ||
        normalize(e.equipment).includes(term)

      const matchesCategory =
        cats.length === 0 || cats.includes(normalize(e.category))
      const matchesMuscle =
        muscles.length === 0 ||
        (Array.isArray(e.muscleGroups) &&
          e.muscleGroups.some((m) => muscles.includes(normalize(m))))
      const matchesEquipment =
        equip.length === 0 || equip.includes(normalize(e.equipment))

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMuscle &&
        matchesEquipment
      )
    })
  }, [exercises, search, filterCategories, filterMuscles, filterEquipment])

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

        <div className="flex flex-wrap items-center gap-2">
          <ResponsiveActionButton
            variant="outline"
            mobileSize='sm'
            onClick={() => {
              setSheetFilterCategories([...filterCategories])
              setSheetFilterMuscles([...filterMuscles])
              setSheetFilterEquipment([...filterEquipment])
              setFiltersSheetOpen(true)
            }}
            icon={<SlidersHorizontal className='h-4 w-4' aria-hidden />}
            label='Filtros'
            tooltip='Filtros'
          />

          {(() => {
            const allBadges = [
              ...filterCategories.map((v) => ({ key: `cat-${v}`, label: 'Categoría', value: v })),
              ...filterMuscles.map((v) => ({ key: `muscle-${v}`, label: 'Músculo', value: v })),
              ...filterEquipment.map((v) => ({ key: `equip-${v}`, label: 'Equipo', value: v })),
            ]
            const visible = allBadges.slice(0, 3)
            const remaining = allBadges.length - 3
            return (
              <>
                {visible.map(({ key, label, value }) => (
                  <Badge key={key} variant="secondary" className="rounded-full">
                    {label}: {value}
                  </Badge>
                ))}
                {remaining > 0 && (
                  <Badge variant="secondary" className="rounded-full">
                    +{remaining} más
                  </Badge>
                )}
              </>
            )
          })()}
        </div>

        {showActions && (
          <ResponsiveActionButton
            className="md:ml-auto"
            onClick={() => {
              setExerciseToEdit(null)
              setShowCreateDialog(true)
            }}
            icon={<Plus className='h-4 w-4' aria-hidden />}
            label='Nuevo ejercicio'
            tooltip='Nuevo ejercicio'
          />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {exercises === undefined ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-3">
              <Skeleton className="aspect-video rounded mb-3" />
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <Empty className="col-span-full py-12 border rounded-lg border-dashed">
            <EmptyHeader>
              <EmptyMedia>
                <Image
                  src={wolfImg}
                  alt=""
                  className="h-20 w-20 object-contain"
                />
              </EmptyMedia>
              <EmptyTitle>No se encontraron ejercicios</EmptyTitle>
              <EmptyDescription>
                Prueba con otros filtros o crea un nuevo ejercicio.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          filtered.map((e) => (
            <div
              key={e._id}
              className="border rounded-lg overflow-hidden hover:border-primary transition-colors group relative"
            >
              {e.videoUrl ? (
                <VideoPlayer videoUrl={e.videoUrl} title={e.name} />
              ) : (
                <div className="aspect-video w-full relative bg-muted flex items-center justify-center min-h-0">
                  <div className="relative w-[90%] h-[90%]">
                    <Image
                      src={wolfImg}
                      alt="Sin video"
                      fill
                      className="object-contain opacity-80"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-xs text-white opacity-80 text-center px-1">
                      Sin video
                    </span>
                  </div>
                </div>
              )}

              <div
                className="p-3 cursor-pointer min-w-0"
                onClick={() => !e.isStandard && setExerciseToEdit(e)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-semibold">{e.name}</h3>
                      {e.isStandard && (
                        <Badge variant="secondary" className="text-xs">
                          Estándar
                        </Badge>
                      )}
                    </div>
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
                  {showActions && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!e.isStandard && (
                          <>
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
                          </>
                        )}
                        {e.isStandard && (
                          <DropdownMenuItem disabled>
                            Ejercicio estándar (no editable)
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
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

      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Categoría
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    sheetFilterCategories.length === 0 ? 'default' : 'outline'
                  }
                  className="rounded-full cursor-pointer"
                  onClick={() => setSheetFilterCategories([])}
                >
                  Todos
                </Badge>
                {CATEGORIES.map((v) => (
                  <Badge
                    key={v}
                    variant={
                      sheetFilterCategories.includes(v) ? 'default' : 'outline'
                    }
                    className="rounded-full cursor-pointer"
                    onClick={() =>
                      toggleInArray(
                        sheetFilterCategories,
                        v,
                        setSheetFilterCategories
                      )
                    }
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Músculo
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    sheetFilterMuscles.length === 0 ? 'default' : 'outline'
                  }
                  className="rounded-full cursor-pointer"
                  onClick={() => setSheetFilterMuscles([])}
                >
                  Todos
                </Badge>
                {MUSCLE_GROUPS.map((v) => (
                  <Badge
                    key={v}
                    variant={
                      sheetFilterMuscles.includes(v) ? 'default' : 'outline'
                    }
                    className="rounded-full cursor-pointer"
                    onClick={() =>
                      toggleInArray(sheetFilterMuscles, v, setSheetFilterMuscles)
                    }
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Equipo
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    sheetFilterEquipment.length === 0 ? 'default' : 'outline'
                  }
                  className="rounded-full cursor-pointer"
                  onClick={() => setSheetFilterEquipment([])}
                >
                  Todos
                </Badge>
                {EQUIPMENT_OPTIONS.map((v) => (
                  <Badge
                    key={v}
                    variant={
                      sheetFilterEquipment.includes(v) ? 'default' : 'outline'
                    }
                    className="rounded-full cursor-pointer"
                    onClick={() =>
                      toggleInArray(
                        sheetFilterEquipment,
                        v,
                        setSheetFilterEquipment
                      )
                    }
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter className="mt-8 gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setFiltersSheetOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSheetFilterCategories([])
                setSheetFilterMuscles([])
                setSheetFilterEquipment([])
                setFilterCategories([])
                setFilterMuscles([])
                setFilterEquipment([])
                setFiltersSheetOpen(false)
              }}
            >
              Limpiar filtros
            </Button>
            <Button
              onClick={() => {
                setFilterCategories([...sheetFilterCategories])
                setFilterMuscles([...sheetFilterMuscles])
                setFilterEquipment([...sheetFilterEquipment])
                setFiltersSheetOpen(false)
              }}
            >
              Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!exerciseToDelete}
        onOpenChange={(open) => !open && setExerciseToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar ejercicio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar &quot;
              {exerciseToDelete?.name}&quot;?
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
                if (exerciseToDelete.isStandard) return
                await removeExercise({
                  id: exerciseToDelete._id,
                })
                setExerciseToDelete(null)
              }}
              disabled={exerciseToDelete?.isStandard}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
