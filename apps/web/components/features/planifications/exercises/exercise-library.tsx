"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveActionButton } from "@/components/ui/responsive-action-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  VideoOff,
  X,
} from "lucide-react";

import { getVideoThumbnailUrl } from "@repo/core/utils";
import CreateExerciseDialog from "./create-exercise-dialog";
import ExerciseVideoDialog from "./exercise-video-dialog";

import Image from "next/image";
import wolfImg from "@/assets/mat-wolf-looking.png";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

import { CATEGORIES, EQUIPMENT_OPTIONS, MUSCLE_GROUPS } from "@repo/core";

const normalize = (v?: string) => (v ?? "").toString().trim().toLowerCase();

/** Muscle chips shown on a card before collapsing the rest into "+N". */
const VISIBLE_MUSCLES = 2;

export interface ExerciseLibraryProps {
  showActions?: boolean;
  /** Title block rendered on the left of the header row, beside "Nuevo ejercicio". */
  header?: ReactNode;
}

function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
  capitalize,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  capitalize?: boolean;
}) {
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={chip(selected.length === 0)}
          onClick={onClear}
        >
          Todos
        </button>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected.includes(value)}
            className={cn(
              chip(selected.includes(value)),
              capitalize && "capitalize",
            )}
            onClick={() => onToggle(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  showActions,
  onEdit,
  onDelete,
  onPlay,
}: {
  exercise: Doc<"exercises">;
  showActions: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) {
  const thumbnailUrl = exercise.videoUrl
    ? getVideoThumbnailUrl(exercise.videoUrl)
    : null;
  const muscles = Array.isArray(exercise.muscleGroups)
    ? exercise.muscleGroups
    : [];
  const editable = !exercise.isStandard;

  return (
    <div className="group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20">
      <button
        type="button"
        onClick={exercise.videoUrl ? onPlay : undefined}
        disabled={!exercise.videoUrl}
        aria-label={
          exercise.videoUrl ? `Ver video de ${exercise.name}` : undefined
        }
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-muted",
          exercise.videoUrl ? "cursor-pointer" : "cursor-default",
        )}
      >
        {thumbnailUrl ? (
          <>
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
              unoptimized
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
              <span className="flex size-9 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <Play className="size-4 fill-white text-white" aria-hidden />
              </span>
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <VideoOff className="size-5" aria-hidden />
            <span className="text-[11px]">Sin video</span>
          </span>
        )}
        {exercise.isStandard && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Lock className="size-2.5" aria-hidden />
            Estándar
          </span>
        )}
      </button>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 p-3",
          editable && showActions && "cursor-pointer",
        )}
        onClick={editable && showActions ? onEdit : undefined}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">
              {exercise.name}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {[exercise.category, exercise.equipment]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {showActions && editable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1.5 -mt-1 size-7 shrink-0"
                  aria-label={`Acciones para ${exercise.name}`}
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(ev) => ev.stopPropagation()}
              >
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 size-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {muscles.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1">
            {muscles.slice(0, VISIBLE_MUSCLES).map((m: string) => (
              <span
                key={m}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground"
              >
                {m}
              </span>
            ))}
            {muscles.length > VISIBLE_MUSCLES && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                +{muscles.length - VISIBLE_MUSCLES}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExerciseLibrary({
  showActions = true,
  header,
}: ExerciseLibraryProps) {
  const [search, setSearch] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterMuscles, setFilterMuscles] = useState<string[]>([]);
  const [filterEquipment, setFilterEquipment] = useState<string[]>([]);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [sheetFilterCategories, setSheetFilterCategories] = useState<string[]>(
    [],
  );
  const [sheetFilterMuscles, setSheetFilterMuscles] = useState<string[]>([]);
  const [sheetFilterEquipment, setSheetFilterEquipment] = useState<string[]>(
    [],
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [exerciseToEdit, setExerciseToEdit] = useState<Doc<"exercises"> | null>(
    null,
  );
  const [exerciseToDelete, setExerciseToDelete] =
    useState<Doc<"exercises"> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [videoExercise, setVideoExercise] = useState<Doc<"exercises"> | null>(
    null,
  );

  const toggleInArray = (
    arr: string[],
    value: string,
    setter: (next: string[]) => void,
  ) => {
    setter(
      arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value],
    );
  };

  const exercises = useQuery(api.exercises.getByOrganization);
  const removeExercise = useMutation(api.exercises.remove);

  /** Exercises per category, ignoring the category filter so chips stay stable. */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of exercises ?? []) {
      const key = normalize(e.category);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [exercises]);

  const filtered = useMemo(() => {
    const list = exercises ?? [];
    const term = normalize(search);
    const cats = filterCategories.map(normalize);
    const muscles = filterMuscles.map(normalize);
    const equip = filterEquipment.map(normalize);

    return list
      .filter((e: Doc<"exercises">) => {
        const matchesSearch =
          !term ||
          normalize(e.name).includes(term) ||
          normalize(e.description).includes(term) ||
          (Array.isArray(e.muscleGroups) &&
            e.muscleGroups.some((m: string) => normalize(m).includes(term))) ||
          normalize(e.category).includes(term) ||
          normalize(e.equipment).includes(term);

        const matchesCategory =
          cats.length === 0 || cats.includes(normalize(e.category));
        const matchesMuscle =
          muscles.length === 0 ||
          (Array.isArray(e.muscleGroups) &&
            e.muscleGroups.some((m: string) => muscles.includes(normalize(m))));
        const matchesEquipment =
          equip.length === 0 || equip.includes(normalize(e.equipment));

        return (
          matchesSearch && matchesCategory && matchesMuscle && matchesEquipment
        );
      })
      .sort((a: Doc<"exercises">, b: Doc<"exercises">) =>
        a.name.localeCompare(b.name, "es"),
      );
  }, [exercises, search, filterCategories, filterMuscles, filterEquipment]);

  const activeFilters = [
    ...filterMuscles.map((value) => ({
      key: `muscle-${value}`,
      label: value,
      remove: () => setFilterMuscles(filterMuscles.filter((v) => v !== value)),
    })),
    ...filterEquipment.map((value) => ({
      key: `equip-${value}`,
      label: value,
      remove: () =>
        setFilterEquipment(filterEquipment.filter((v) => v !== value)),
    })),
  ];
  const sheetFilterCount = filterMuscles.length + filterEquipment.length;
  const hasAnyFilter =
    search.trim() !== "" ||
    filterCategories.length > 0 ||
    activeFilters.length > 0;

  const clearAll = () => {
    setSearch("");
    setFilterCategories([]);
    setFilterMuscles([]);
    setFilterEquipment([]);
  };

  const openCreate = () => {
    setExerciseToEdit(null);
    setShowCreateDialog(true);
  };

  const handleDelete = async () => {
    if (!exerciseToDelete || exerciseToDelete.isStandard) return;
    setDeleting(true);
    try {
      await removeExercise({ id: exerciseToDelete._id });
      toast.success("Ejercicio eliminado");
      setExerciseToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // The server guards exercises still referenced by a planification.
      toast.error(
        message.includes("being used")
          ? "Está en uso en una planificación. Quitalo de ahí antes de eliminarlo."
          : "No se pudo eliminar el ejercicio",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Only categories that actually have exercises, in the canonical order.
  const categoryChips = CATEGORIES.filter(
    (c) => (categoryCounts.get(normalize(c)) ?? 0) > 0,
  );
  const singleCategory =
    filterCategories.length === 1 ? normalize(filterCategories[0]) : null;

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">{header}</div>
        {showActions && (
          <ResponsiveActionButton
            className="shrink-0"
            onClick={openCreate}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            label="Nuevo ejercicio"
            tooltip="Nuevo ejercicio"
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, músculo o equipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
            aria-label="Buscar ejercicios"
          />
        </div>
        <Button
          variant="outline"
          className="h-9 shrink-0 gap-2"
          onClick={() => {
            setSheetFilterCategories([...filterCategories]);
            setSheetFilterMuscles([...filterMuscles]);
            setSheetFilterEquipment([...filterEquipment]);
            setFiltersSheetOpen(true);
          }}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filtros</span>
          {sheetFilterCount > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[11px] tabular-nums text-background">
              {sheetFilterCount}
            </span>
          )}
        </Button>
        {exercises !== undefined && (
          <span className="ml-auto hidden shrink-0 text-sm tabular-nums text-muted-foreground md:inline">
            {filtered.length === exercises.length
              ? `${exercises.length} ejercicios`
              : `${filtered.length} de ${exercises.length}`}
          </span>
        )}
      </div>

      {categoryChips.length > 0 && (
        // Phones scroll the categories sideways instead of wrapping them.
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className={chipClass(filterCategories.length === 0)}
            onClick={() => setFilterCategories([])}
          >
            Todas
            <span className="tabular-nums opacity-60">
              {exercises?.length ?? 0}
            </span>
          </button>
          {categoryChips.map((category) => {
            const active =
              singleCategory === normalize(category) ||
              (filterCategories.length > 1 &&
                filterCategories.includes(category));
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                className={chipClass(active)}
                onClick={() =>
                  setFilterCategories(
                    singleCategory === normalize(category) ? [] : [category],
                  )
                }
              >
                {category}
                <span className="tabular-nums opacity-60">
                  {categoryCounts.get(normalize(category))}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="secondary"
              className="gap-1 rounded-full pr-1 capitalize"
            >
              {filter.label}
              <button
                type="button"
                onClick={filter.remove}
                className="rounded-full p-0.5 hover:bg-background/60"
                aria-label={`Quitar filtro ${filter.label}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilterMuscles([]);
              setFilterEquipment([]);
            }}
            className="px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
        </div>
      )}

      {exercises === undefined ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia>
              <Image
                src={wolfImg}
                alt=""
                className="h-16 w-16 object-contain"
              />
            </EmptyMedia>
            <EmptyTitle>
              {hasAnyFilter ? "Sin resultados" : "Todavía no hay ejercicios"}
            </EmptyTitle>
            <EmptyDescription>
              {hasAnyFilter
                ? "Probá con otra búsqueda o quitá algún filtro."
                : "Creá tu primer ejercicio para usarlo en las planificaciones."}
            </EmptyDescription>
          </EmptyHeader>
          {hasAnyFilter ? (
            <Button size="sm" variant="outline" onClick={clearAll}>
              Limpiar filtros
            </Button>
          ) : showActions ? (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              Nuevo ejercicio
            </Button>
          ) : null}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((e: Doc<"exercises">) => (
            <ExerciseCard
              key={e._id}
              exercise={e}
              showActions={showActions}
              onEdit={() => setExerciseToEdit(e)}
              onDelete={() => setExerciseToDelete(e)}
              onPlay={() => setVideoExercise(e)}
            />
          ))}
        </div>
      )}

      <CreateExerciseDialog
        open={showCreateDialog || !!exerciseToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setExerciseToEdit(null);
          }
        }}
        exercise={exerciseToEdit}
      />

      <ExerciseVideoDialog
        open={videoExercise !== null}
        onOpenChange={(open) => !open && setVideoExercise(null)}
        videoUrl={videoExercise?.videoUrl ?? null}
        exerciseName={videoExercise?.name ?? ""}
      />

      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>

          <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6 py-2">
            <FilterChipGroup
              label="Categoría"
              options={CATEGORIES}
              selected={sheetFilterCategories}
              onToggle={(v) =>
                toggleInArray(
                  sheetFilterCategories,
                  v,
                  setSheetFilterCategories,
                )
              }
              onClear={() => setSheetFilterCategories([])}
            />
            <FilterChipGroup
              label="Músculo"
              options={MUSCLE_GROUPS}
              selected={sheetFilterMuscles}
              onToggle={(v) =>
                toggleInArray(sheetFilterMuscles, v, setSheetFilterMuscles)
              }
              onClear={() => setSheetFilterMuscles([])}
              capitalize
            />
            <FilterChipGroup
              label="Equipo"
              options={EQUIPMENT_OPTIONS}
              selected={sheetFilterEquipment}
              onToggle={(v) =>
                toggleInArray(sheetFilterEquipment, v, setSheetFilterEquipment)
              }
              onClear={() => setSheetFilterEquipment([])}
            />
          </div>

          <SheetFooter className="gap-2 border-t pt-4 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSheetFilterCategories([]);
                setSheetFilterMuscles([]);
                setSheetFilterEquipment([]);
              }}
            >
              Limpiar
            </Button>
            <Button
              onClick={() => {
                setFilterCategories([...sheetFilterCategories]);
                setFilterMuscles([...sheetFilterMuscles]);
                setFilterEquipment([...sheetFilterEquipment]);
                setFiltersSheetOpen(false);
              }}
            >
              Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!exerciseToDelete}
        onOpenChange={(open) => !open && !deleting && setExerciseToDelete(null)}
      >
        <AlertDialogContent className="w-[calc(100%-1.5rem)] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar &quot;{exerciseToDelete?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deja de estar disponible en la biblioteca. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(ev) => {
                ev.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
