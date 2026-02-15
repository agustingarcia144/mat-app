'use client'

import { useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { exerciseSchema, Exercise } from '@repo/core/schemas'

import {
  CATEGORIES,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUPS,
} from '@repo/core'

import { toast } from 'sonner'

interface CreateExerciseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exercise?: Doc<'exercises'> | null
}

export default function CreateExerciseDialog({
  open,
  onOpenChange,
  exercise,
}: CreateExerciseDialogProps) {
  const createExercise = useMutation(api.exercises.create)
  const updateExercise = useMutation(api.exercises.update)

  const isEditing = !!exercise

  const form = useForm<Exercise>({
    resolver: zodResolver(exerciseSchema),
    defaultValues: {
      name: '',
      description: '',
      category: '',
      equipment: '',
      videoUrl: '',
      muscleGroups: [],
    },
  })

  useEffect(() => {
    if (open) {
      if (exercise) {
        form.reset({
          name: exercise.name,
          description: exercise.description ?? '',
          category: exercise.category,
          equipment: exercise.equipment ?? '',
          videoUrl: exercise.videoUrl ?? '',
          muscleGroups: exercise.muscleGroups ?? [],
        })
      } else {
        form.reset({
          name: '',
          description: '',
          category: '',
          equipment: '',
          videoUrl: '',
          muscleGroups: [],
        })
      }
    }
  }, [open, exercise, form])

  const onSubmit = async (data: Exercise) => {
    try {
      if (isEditing) {
        await updateExercise({
          id: exercise._id,
          name: data.name,
          description: data.description || undefined,
          category: data.category,
          muscleGroups: data.muscleGroups,
          equipment: data.equipment || undefined,
          videoUrl: data.videoUrl || undefined,
        })
      } else {
        await createExercise({
          name: data.name,
          description: data.description || undefined,
          category: data.category,
          muscleGroups: data.muscleGroups,
          equipment: data.equipment || undefined,
          videoUrl: data.videoUrl || undefined,
        })
      }

      form.reset()
      onOpenChange(false)
    } catch (error) {
      console.error(
        isEditing ? 'Failed to update exercise:' : 'Failed to create exercise:',
        error
      )
      toast.error(
        isEditing
          ? 'Error al actualizar el ejercicio'
          : 'Error al crear el ejercicio'
      )
    }
  }

  const selectedMuscles = useWatch({
    control: form.control,
    name: 'muscleGroups',
    defaultValue: [],
  })

  const toggleMuscle = (muscle: string) => {
    const current = form.getValues('muscleGroups')
    form.setValue(
      'muscleGroups',
      current.includes(muscle)
        ? current.filter((m) => m !== muscle)
        : [...current, muscle]
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

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Nombre *</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  placeholder="Ej: Press de banca"
                  disabled={form.formState.isSubmitting}
                  autoComplete="off"
                />
                <FieldDescription>
                  Nombre del ejercicio para identificarlo fácilmente.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="description"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Descripción</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  placeholder="Instrucciones y técnica..."
                  rows={3}
                  disabled={form.formState.isSubmitting}
                  autoComplete="off"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="category"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Categoría *</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.isSubmitting}
                >
                  <SelectTrigger
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                  >
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
                <FieldDescription>
                  Categoría del ejercicio según el tipo de entrenamiento.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="equipment"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Equipo</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.isSubmitting}
                >
                  <SelectTrigger
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                  >
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
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="videoUrl"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>URL del video</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="url"
                  aria-invalid={fieldState.invalid}
                  placeholder="Ej: https://www.youtube.com/watch?v=..."
                  disabled={form.formState.isSubmitting}
                  autoComplete="off"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <div className="space-y-2">
            <FieldLabel>Grupos musculares</FieldLabel>
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
                  disabled={form.formState.isSubmitting}
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
              disabled={form.formState.isSubmitting || !form.formState.isValid}
            >
              {form.formState.isSubmitting
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
              disabled={form.formState.isSubmitting}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
