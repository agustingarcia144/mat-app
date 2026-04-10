"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useLibraryExerciseNames } from "@/contexts/library-exercise-names-context";
import LibraryExerciseCard from "@/components/features/planifications/exercises/library-exercise-card";
import CreateExerciseDialog from "@/components/features/planifications/exercises/create-exercise-dialog";
import matWolfLooking from "@/assets/mat-wolf-looking.png";

interface ExerciseSelectorProps {
  /** Optional: called when user clicks an exercise (e.g. add to day). Drag-and-drop is the primary way to add. */
  onSelect?: (exercise: { id: string; name: string }) => void;
  className?: string;
}

export default function ExerciseSelector({
  onSelect,
  className,
}: ExerciseSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const libraryNames = useLibraryExerciseNames();

  const { categories, equipment } = useQuery(api.exercises.listFacets) ?? {
    categories: [] as string[],
    equipment: [] as string[],
  };

  const exercises = useQuery(api.exercises.search, {
    searchTerm,
    category: selectedCategories.length > 0 ? selectedCategories : undefined,
    equipment: selectedEquipment.length > 0 ? selectedEquipment : undefined,
  });

  useEffect(() => {
    if (!libraryNames || !exercises?.length) return;
    const names: Record<string, string> = {};
    for (const ex of exercises) {
      names[ex._id] = ex.name;
    }
    libraryNames.setNames(names);
  }, [libraryNames, exercises]);

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 overflow-hidden ${className ?? ""}`}
    >
      <div className="flex flex-col gap-3 mb-4 shrink-0 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar ejercicios..."
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setCreateDialogOpen(true)}
          className="shrink-0"
          aria-label="Nuevo ejercicio"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3 shrink-0">
        Arrastra un ejercicio a un bloque o a &quot;Sin bloque&quot; para
        añadirlo al día.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 shrink-0">
        <MultiSelect
          options={categories.map((cat: string) => ({
            value: cat,
            label: cat,
          }))}
          value={selectedCategories}
          onChange={setSelectedCategories}
          placeholder="Todas las categorías"
          label="Categoría"
        />
        <MultiSelect
          options={equipment.map((eq: string) => ({ value: eq, label: eq }))}
          value={selectedEquipment}
          onChange={setSelectedEquipment}
          placeholder="Todo el equipamiento"
          label="Equipamiento"
        />
      </div>

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
            <Empty className="col-span-full py-8">
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=""
                    className="h-20 w-20 object-contain"
                  />
                </EmptyMedia>
                <EmptyTitle>No se encontraron ejercicios</EmptyTitle>
                <EmptyDescription>
                  {searchTerm
                    ? "Intenta con otro término"
                    : "Crea ejercicios en la biblioteca"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            exercises.map((exercise: { _id: string; name: string }) => (
              <div
                key={exercise._id}
                onClick={() =>
                  onSelect?.({ id: exercise._id, name: exercise.name })
                }
                className={onSelect ? "cursor-pointer min-w-0" : "min-w-0"}
              >
                <LibraryExerciseCard exercise={exercise} />
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <CreateExerciseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
