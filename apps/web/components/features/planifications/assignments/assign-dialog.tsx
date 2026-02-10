'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Check, ChevronsUpDown } from 'lucide-react'
import { type DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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
  const assignments = useQuery(
    api.planificationAssignments.getByPlanification,
    {
      planificationId: planificationId as any,
    }
  )

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 30),
  })
  const [memberSearchOpen, setMemberSearchOpen] = useState(false)

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
      toast.error(error.message || 'Error al asignar planificación')
    }
  }

  // Filter out members who are already assigned
  const assignedUserIds = useMemo(() => {
    if (!assignments) return new Set<string>()
    return new Set(
      assignments.filter((a) => a.status === 'active').map((a) => a.userId)
    )
  }, [assignments])

  const availableMembers = useMemo(() => {
    if (!memberships) return []
    return memberships.filter(
      (m) => m.role === 'member' && !assignedUserIds.has(m.userId)
    )
  }, [memberships, assignedUserIds])

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
            render={({ field, fieldState }) => {
              const selectedMember = availableMembers.find(
                (m) => m.userId === field.value
              )

              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Miembro *</FieldLabel>
                  <Popover
                    open={memberSearchOpen}
                    onOpenChange={setMemberSearchOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={memberSearchOpen}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground'
                        )}
                        disabled={form.formState.isSubmitting}
                      >
                        {selectedMember
                          ? selectedMember.fullName ||
                            selectedMember.email ||
                            'Usuario'
                          : 'Buscar miembro...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-full min-w-[460px] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Buscar miembro..." />
                        <CommandList>
                          <CommandEmpty>
                            No se encontraron miembros disponibles.
                          </CommandEmpty>
                          <CommandGroup>
                            {availableMembers.map((member) => (
                              <CommandItem
                                key={member.userId}
                                value={`${member.fullName} ${member.email}`}
                                onSelect={() => {
                                  field.onChange(member.userId)
                                  setMemberSearchOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === member.userId
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {member.fullName || 'Sin nombre'}
                                  </span>
                                  {member.email && (
                                    <span className="text-xs text-muted-foreground">
                                      {member.email}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FieldDescription>
                    Busca y selecciona un miembro disponible para asignar la
                    planificación.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )
            }}
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
