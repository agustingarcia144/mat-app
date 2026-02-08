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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { assignmentSchema, Assignment } from '@repo/core/schemas'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { type DateRange } from 'react-day-picker'

interface AssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planificationId: string
}

export default function AssignDialog({
  open,
  onOpenChange,
  planificationId,
}: AssignDialogProps) {
  const assign = useMutation(api.planificationAssignments.assign)
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 30),
  })

  const form = useForm<Assignment>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      userId: '',
      startDate: '',
      endDate: '',
      notes: '',
    },
  })

  // Update form values when date range changes
  useEffect(() => {
    if (dateRange?.from) {
      form.setValue('startDate', format(dateRange.from, 'yyyy-MM-dd'))
    } else {
      form.setValue('startDate', '')
    }

    if (dateRange?.to) {
      form.setValue('endDate', format(dateRange.to, 'yyyy-MM-dd'))
    } else {
      form.setValue('endDate', '')
    }
  }, [dateRange, form])

  const onSubmit = async (data: Assignment) => {
    try {
      await assign({
        planificationId: planificationId as any,
        userId: data.userId,
        startDate: data.startDate
          ? new Date(data.startDate).getTime()
          : undefined,
        endDate: data.endDate ? new Date(data.endDate).getTime() : undefined,
        notes: data.notes?.trim() || undefined,
      })

      form.reset()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Failed to assign:', error)
      alert(error.message || 'Error al asignar planificación')
    }
  }

  const members = memberships?.filter((m) => m.role === 'member') || []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Asignar planificación</SheetTitle>
          <SheetDescription>
            Asigna esta planificación a un miembro
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Controller
            name="userId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Miembro *</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.isSubmitting}
                >
                  <SelectTrigger
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Seleccionar miembro" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((membership) => (
                      <SelectItem
                        key={membership.userId}
                        value={membership.userId}
                      >
                        {membership.fullName || membership.email || 'Usuario'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Selecciona el miembro al que asignar la planificación.
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Field>
            <FieldLabel>Rango de fechas</FieldLabel>
            <FieldDescription>
              Selecciona el período de duración de la planificación
            </FieldDescription>
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              locale={es}
              disabled={form.formState.isSubmitting}
              className="rounded-md border"
            />
          </Field>

          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Notas</FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  placeholder="Notas o instrucciones especiales..."
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

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isValid}
            >
              {form.formState.isSubmitting ? 'Asignando...' : 'Asignar'}
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
