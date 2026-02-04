'use client'

import { useState, useEffect } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CreateExerciseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exercise?: Doc<'exercises'> | null
}

const CATEGORIES = [
  'Tren superior',
  'Tren inferior',
  'Core',
  'Cardio',
  'Funcional',
  'Movilidad',
]

const EQUIPMENT_OPTIONS = [
  'Barra',
  'Mancuernas',
  'Máquina',
  'Peso corporal',
  'Bandas',
  'Kettlebell',
  'TRX',
  'Otro',
]

const MUSCLE_GROUPS = [
  'pecho',
  'espalda',
  'hombros',
  'bíceps',
  'tríceps',
  'cuádriceps',
  'isquiotibiales',
  'glúteos',
  'pantorrillas',
  'core',
  'abdominales',
]

export default function CreateExerciseDialog({
  open,
  onOpenChange,
  exercise,
}: CreateExerciseDialogProps) {
  const createExercise = useMutation(api.exercises.create)
  const updateExercise = useMutation(api.exercises.update)

  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('')
  const [equipment, setEquipment] = useState<string>('')
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')

  const isEditing = !!exercise

  useEffect(() => {
    if (open) {
      if (exercise) {
        setName(exercise.name)
        setDescription(exercise.description ?? '')
        setCategory(exercise.category)
        setEquipment(exercise.equipment ?? '')
        setSelectedMuscles(exercise.muscleGroups ?? [])
        setVideoUrl(exercise.videoUrl ?? '')
      } else {
        setName('')
        setDescription('')
        setCategory('')
        setEquipment('')
        setSelectedMuscles([])
        setVideoUrl('')
      }
    }
  }, [open, exercise])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !category) return

    setLoading(true)
    try {
      if (isEditing) {
        await updateExercise({
          id: exercise._id,
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          muscleGroups: selectedMuscles,
          equipment: equipment || undefined,
          videoUrl: videoUrl.trim() || undefined,
        })
      } else {
        await createExercise({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          muscleGroups: selectedMuscles,
          equipment: equipment || undefined,
          videoUrl: videoUrl.trim() || undefined,
        })
      }

      // Reset form
      setName('')
      setDescription('')
      setCategory('')
      setEquipment('')
      setSelectedMuscles([])
      setVideoUrl('')
      onOpenChange(false)
    } catch (error) {
      console.error(
        isEditing ? 'Failed to update exercise:' : 'Failed to create exercise:',
        error
      )
      alert(
        isEditing
          ? 'Error al actualizar el ejercicio'
          : 'Error al crear el ejercicio'
      )
    } finally {
      setLoading(false)
    }
  }

  const toggleMuscle = (muscle: string) => {
    setSelectedMuscles((prev) =>
      prev.includes(muscle)
        ? prev.filter((m) => m !== muscle)
        : [...prev, muscle]
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Modifica los datos del ejercicio'
              : 'Agrega un nuevo ejercicio a la biblioteca'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Press de banca"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instrucciones y técnica..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoría *</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipment">Equipo</Label>
            <Select
              value={equipment}
              onValueChange={setEquipment}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <SelectItem key={eq} value={eq}>
                    {eq}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="videoUrl">URL del video</Label>
            <Input
              id="videoUrl"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Ej: https://www.youtube.com/watch?v=..."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Grupos musculares</Label>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map((muscle) => (
                <Button
                  key={muscle}
                  type="button"
                  variant={
                    selectedMuscles.includes(muscle) ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => toggleMuscle(muscle)}
                  disabled={loading}
                  className="capitalize"
                >
                  {muscle}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={loading || !name.trim() || !category}
            >
              {loading
                ? isEditing
                  ? 'Guardando...'
                  : 'Creando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear ejercicio'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
