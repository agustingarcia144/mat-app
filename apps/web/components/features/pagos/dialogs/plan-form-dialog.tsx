'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import {
  membershipPlanSchema,
  type MembershipPlanForm,
} from '@repo/core/schemas'
import { type Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { Plus, Trash2 } from 'lucide-react'

const UNLIMITED_SENTINEL = 9999

interface PlanFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId?: Id<'membershipPlans'>
  onSuccess?: () => void
}

export default function PlanFormDialog({
  open,
  onOpenChange,
  planId,
  onSuccess,
}: PlanFormDialogProps) {
  const canQuery = useCanQueryCurrentOrganization()
  const isEditing = !!planId

  const existingPlan = useQuery(
    api.membershipPlans.getById,
    isEditing && canQuery ? { planId } : 'skip'
  )

  const createPlan = useMutation(api.membershipPlans.create)
  const updatePlan = useMutation(api.membershipPlans.update)

  const [priceDisplay, setPriceDisplay] = useState('0')
  const [isUnlimited, setIsUnlimited] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MembershipPlanForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(membershipPlanSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      priceArs: 0,
      weeklyClassLimit: 2,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      interestTiers: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'interestTiers',
  })

  const watchedEndDay = watch('paymentWindowEndDay')
  const watchedTiers = watch('interestTiers')

  useEffect(() => {
    if (!open) return
    if (existingPlan) {
      const unlimited = existingPlan.weeklyClassLimit >= UNLIMITED_SENTINEL
      setIsUnlimited(unlimited)
      setPriceDisplay(existingPlan.priceArs.toLocaleString('es-AR'))
      reset({
        name: existingPlan.name,
        description: existingPlan.description ?? '',
        priceArs: existingPlan.priceArs,
        weeklyClassLimit: existingPlan.weeklyClassLimit,
        paymentWindowStartDay: existingPlan.paymentWindowStartDay,
        paymentWindowEndDay: existingPlan.paymentWindowEndDay,
        interestTiers: (existingPlan.interestTiers ?? []) as MembershipPlanForm['interestTiers'],
      })
    } else if (!isEditing) {
      setIsUnlimited(false)
      setPriceDisplay('0')
      reset({
        name: '',
        description: '',
        priceArs: 0,
        weeklyClassLimit: 2,
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 10,
        interestTiers: [],
      })
    }
  }, [open, existingPlan, isEditing, reset])

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '')
    const num = digits ? parseInt(digits, 10) : 0
    setPriceDisplay(num.toLocaleString('es-AR'))
    setValue('priceArs', num, { shouldValidate: true })
  }

  const handleUnlimitedToggle = (checked: boolean) => {
    setIsUnlimited(checked)
    setValue('weeklyClassLimit', checked ? UNLIMITED_SENTINEL : 2, {
      shouldValidate: true,
    })
  }

  const onSubmit = async (data: MembershipPlanForm) => {
    try {
      const interestTiers = data.interestTiers?.length ? data.interestTiers : undefined
      if (isEditing && planId) {
        await updatePlan({
          planId,
          name: data.name,
          description: data.description || undefined,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
        })
        toast.success('Plan actualizado')
      } else {
        await createPlan({
          name: data.name,
          description: data.description || undefined,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
        })
        toast.success('Plan creado')
      }
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Editar plan' : 'Nuevo plan'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Modifica los datos del plan de membresía.'
              : 'Crea un nuevo plan de membresía para tus miembros.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <Field>
            <FieldLabel>Nombre</FieldLabel>
            <Input
              {...register('name')}
              placeholder="Ej: Plan Básico, 2 veces/semana"
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Descripción (opcional)</FieldLabel>
            <Textarea
              {...register('description')}
              rows={2}
              placeholder="Descripción del plan..."
            />
          </Field>

          <Field>
            <FieldLabel>Precio (ARS)</FieldLabel>
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="text"
                inputMode="numeric"
                className="pl-7"
                value={priceDisplay}
                onChange={handlePriceChange}
                placeholder="0"
              />
            </div>
            {errors.priceArs && (
              <FieldError>{errors.priceArs.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Límite semanal de clases</FieldLabel>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                {...register('weeklyClassLimit', { valueAsNumber: true })}
                placeholder="2"
                disabled={isUnlimited}
                className={isUnlimited ? 'opacity-40' : ''}
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={isUnlimited}
                  onCheckedChange={handleUnlimitedToggle}
                />
                Sin límite
              </label>
            </div>
            <FieldDescription>
              Cantidad máxima de clases que el miembro puede reservar por semana
              (lunes a domingo).
            </FieldDescription>
            {errors.weeklyClassLimit && (
              <FieldError>{errors.weeklyClassLimit.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Ventana de pago</FieldLabel>
            <div className="grid grid-cols-2 items-start gap-3">
              <Field>
                <FieldLabel className="text-muted-foreground font-normal">
                  Día inicio
                </FieldLabel>
                <Input
                  type="number"
                  {...register('paymentWindowStartDay', { valueAsNumber: true })}
                  min={1}
                  max={28}
                />
                {errors.paymentWindowStartDay && (
                  <FieldError>
                    {errors.paymentWindowStartDay.message}
                  </FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel className="text-muted-foreground font-normal">
                  Día fin
                </FieldLabel>
                <Input
                  type="number"
                  {...register('paymentWindowEndDay', { valueAsNumber: true })}
                  min={1}
                  max={28}
                />
                {errors.paymentWindowEndDay && (
                  <FieldError>{errors.paymentWindowEndDay.message}</FieldError>
                )}
              </Field>
            </div>
            <FieldDescription>
              {fields.length > 0
                ? 'Con cargos por mora configurados, el plan no se suspende automáticamente.'
                : 'Sin cargos por mora, el plan se suspende automáticamente si no se aprobó el pago.'}
            </FieldDescription>
          </Field>

          {/* Interest tiers */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>Cargos por mora</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  append({ daysAfterWindowEnd: 1, type: 'percentage', value: 0 })
                }
              >
                <Plus className="h-3 w-3" />
                Agregar tramo
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Sin cargos por mora configurados.
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const days = watchedTiers?.[index]?.daysAfterWindowEnd ?? 1
                  const endDay = watchedEndDay ?? 10
                  const absoluteDay = endDay + days
                  return (
                    <div
                      key={field.id}
                      className="bg-muted/50 space-y-2 rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Tramo {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Field>
                          <FieldLabel className="text-muted-foreground text-xs font-normal">
                            Desde día
                          </FieldLabel>
                          <Input
                            type="number"
                            min={1}
                            max={28}
                            {...register(
                              `interestTiers.${index}.daysAfterWindowEnd`,
                              { valueAsNumber: true }
                            )}
                          />
                          <p className="text-muted-foreground text-xs">
                            ≈ día {absoluteDay <= 28 ? absoluteDay : `${absoluteDay} (mes sig.)`}
                          </p>
                        </Field>

                        <Field>
                          <FieldLabel className="text-muted-foreground text-xs font-normal">
                            Tipo
                          </FieldLabel>
                          <select
                            {...register(`interestTiers.${index}.type`)}
                            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                          >
                            <option value="percentage">%</option>
                            <option value="fixed">$ fijo</option>
                          </select>
                        </Field>

                        <Field>
                          <FieldLabel className="text-muted-foreground text-xs font-normal">
                            Valor
                          </FieldLabel>
                          <Input
                            type="number"
                            min={0}
                            step={watchedTiers?.[index]?.type === 'fixed' ? 100 : 0.5}
                            {...register(`interestTiers.${index}.value`, {
                              valueAsNumber: true,
                            })}
                          />
                        </Field>
                      </div>

                      {errors.interestTiers?.[index] && (
                        <FieldError>
                          Revisá los valores de este tramo
                        </FieldError>
                      )}
                    </div>
                  )
                })}
                <FieldDescription>
                  Los tramos son acumulativos: si aplican varios, todos se suman.
                  El cargo se calcula sobre el precio base del plan.
                </FieldDescription>
              </div>
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEditing ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
