'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { classSchema, type ClassForm } from '@repo/core/schemas'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'

type MembershipWithUser = {
  role: string
  userId: string
  fullName?: string
  email?: string
}

interface ClassFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId?: Id<'classes'>
  onSuccess?: () => void
}

export default function ClassFormDialog({
  open,
  onOpenChange,
  classId,
  onSuccess,
}: ClassFormDialogProps) {
  const createClass = useMutation(api.classes.create)
  const updateClass = useMutation(api.classes.update)
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )
  const existingClass = useQuery(
    api.classes.getById,
    classId ? { id: classId } : 'skip'
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [trainerComboOpen, setTrainerComboOpen] = useState(false)

  const form = useForm<ClassForm>({
    resolver: zodResolver(classSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      capacity: 30,
      trainerId: undefined,
      bookingWindowDays: 7,
      cancellationWindowHours: 2,
      isRecurring: false,
      recurrencePattern: undefined,
      isActive: true,
    },
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form

  // Load existing class data
  useEffect(() => {
    if (existingClass) {
      reset({
        name: existingClass.name,
        description: existingClass.description || '',
        capacity: existingClass.capacity,
        trainerId: existingClass.trainerId,
        bookingWindowDays: existingClass.bookingWindowDays,
        cancellationWindowHours: existingClass.cancellationWindowHours,
        isRecurring: existingClass.isRecurring,
        recurrencePattern: existingClass.recurrencePattern,
        isActive: existingClass.isActive,
      })
    }
  }, [existingClass, reset])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset({
        name: '',
        description: '',
        capacity: 30,
        trainerId: undefined,
        bookingWindowDays: 7,
        cancellationWindowHours: 2,
        isRecurring: false,
        recurrencePattern: undefined,
        isActive: true,
      })
    }
  }, [open, reset])

  const trainers = memberships?.filter((m: MembershipWithUser) => m.role === 'trainer') || []

  const onSubmit = async (data: ClassForm) => {
    setIsSubmitting(true)
    try {
      if (classId) {
        await updateClass({
          id: classId,
          ...data,
        })
      } else {
        await createClass(data)
      }
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Error saving class:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al guardar la clase'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{classId ? 'Editar Clase' : 'Nueva Clase'}</SheetTitle>
          <SheetDescription>
            {classId
              ? 'Actualiza la información de la clase'
              : 'Crea una nueva clase para tu gimnasio'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit as any)}
          className="space-y-6 mt-6"
        >
          {/* Name */}
          <Field>
            <FieldLabel>Nombre</FieldLabel>
            <Input {...register('name')} placeholder="Ej: Yoga Avanzado" />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          {/* Description */}
          <Field>
            <FieldLabel>Descripción (opcional)</FieldLabel>
            <Textarea
              {...register('description')}
              placeholder="Describe la clase..."
              rows={3}
            />
            {errors.description && (
              <FieldError>{errors.description.message}</FieldError>
            )}
          </Field>

          {/* Capacity */}
          <Field>
            <FieldLabel>Capacidad</FieldLabel>
            <Input
              type="number"
              {...register('capacity', { valueAsNumber: true })}
              min={1}
              max={1000}
            />
            <FieldDescription>
              Número máximo de personas que pueden reservar
            </FieldDescription>
            {errors.capacity && (
              <FieldError>{errors.capacity.message}</FieldError>
            )}
          </Field>

          {/* Trainer */}
          <Field>
            <FieldLabel>Entrenador (opcional)</FieldLabel>
            <Controller
              name="trainerId"
              control={control}
              render={({ field }) => (
                <Popover
                  open={trainerComboOpen}
                  onOpenChange={setTrainerComboOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {field.value
                        ? trainers.find((t: MembershipWithUser) => t.userId === field.value)
                            ?.fullName || 'Seleccionar...'
                        : 'Seleccionar...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar entrenador..." />
                      <CommandList>
                        <CommandEmpty>
                          No se encontraron entrenadores
                        </CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              field.onChange(undefined)
                              setTrainerComboOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                !field.value ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            Ninguno
                          </CommandItem>
                          {trainers.map((trainer: MembershipWithUser) => (
                            <CommandItem
                              key={trainer.userId}
                              value={trainer.userId}
                              onSelect={() => {
                                field.onChange(trainer.userId)
                                setTrainerComboOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === trainer.userId
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {trainer.fullName || trainer.email}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            />
          </Field>

          {/* Booking Window */}
          <Field>
            <FieldLabel>Ventana de reserva (días)</FieldLabel>
            <Input
              type="number"
              {...register('bookingWindowDays', { valueAsNumber: true })}
              min={0}
              max={365}
            />
            <FieldDescription>
              Días de anticipación con los que se puede reservar
            </FieldDescription>
            {errors.bookingWindowDays && (
              <FieldError>{errors.bookingWindowDays.message}</FieldError>
            )}
          </Field>

          {/* Cancellation Window */}
          <Field>
            <FieldLabel>Ventana de cancelación (horas)</FieldLabel>
            <Input
              type="number"
              {...register('cancellationWindowHours', { valueAsNumber: true })}
              min={0}
              max={168}
            />
            <FieldDescription>
              Horas mínimas de anticipación para cancelar
            </FieldDescription>
            {errors.cancellationWindowHours && (
              <FieldError>{errors.cancellationWindowHours.message}</FieldError>
            )}
          </Field>

          {/* Is Active */}
          <Field>
            <div className="flex items-center space-x-2">
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <FieldLabel className="mt-0!">Clase activa</FieldLabel>
            </div>
            <FieldDescription>
              Las clases inactivas no se mostrarán a los miembros
            </FieldDescription>
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Guardando...'
                : classId
                  ? 'Actualizar'
                  : 'Crear Clase'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
