"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  membershipPlanSchema,
  type MembershipPlanForm,
} from "@repo/core/schemas";
import { type Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

const UNLIMITED_SENTINEL = 9999;

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId?: Id<"membershipPlans">;
  onSuccess?: () => void;
}

export default function PlanFormDialog({
  open,
  onOpenChange,
  planId,
  onSuccess,
}: PlanFormDialogProps) {
  const canQuery = useCanQueryCurrentOrganization();
  const isEditing = !!planId;

  const existingPlan = useQuery(
    api.membershipPlans.getById,
    isEditing && canQuery ? { planId } : "skip",
  );

  const createPlan = useMutation(api.membershipPlans.create);
  const updatePlan = useMutation(api.membershipPlans.update);

  const [priceDisplay, setPriceDisplay] = useState("0");
  const [isUnlimited, setIsUnlimited] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MembershipPlanForm>({
    resolver: zodResolver(membershipPlanSchema as any) as any,
    defaultValues: {
      name: "",
      description: "",
      isFamilyPlan: false,
      priceArs: 0,
      weeklyClassLimit: 2,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      interestTiers: [],
      advancePaymentDiscounts: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "interestTiers",
  });

  const {
    fields: discountFields,
    append: appendDiscount,
    remove: removeDiscount,
  } = useFieldArray({
    control,
    name: "advancePaymentDiscounts",
  });

  const watchedEndDay = watch("paymentWindowEndDay") ?? 10;
  const watchedTiers = watch("interestTiers");
  const isFamilyPlan = watch("isFamilyPlan");

  // Sorted absolute days for all tiers — used to compute per-tier date ranges
  const sortedTierDays = [...(watchedTiers ?? [])]
    .map((t) => watchedEndDay + (t?.daysAfterWindowEnd ?? 1))
    .sort((a, b) => a - b);

  const formatRangeDay = (d: number) =>
    d <= 28 ? `${d}` : `${d - 28} (mes sig.)`;

  useEffect(() => {
    if (!open) return;
    if (existingPlan) {
      const unlimited = existingPlan.weeklyClassLimit >= UNLIMITED_SENTINEL;
      setIsUnlimited(unlimited);
      setPriceDisplay(existingPlan.priceArs.toLocaleString("es-AR"));
      reset({
        name: existingPlan.name,
        description: existingPlan.description ?? "",
        isFamilyPlan: existingPlan.isFamilyPlan ?? false,
        priceArs: existingPlan.priceArs,
        weeklyClassLimit: existingPlan.weeklyClassLimit,
        paymentWindowStartDay: existingPlan.paymentWindowStartDay,
        paymentWindowEndDay: existingPlan.paymentWindowEndDay,
        interestTiers: (existingPlan.interestTiers ??
          []) as MembershipPlanForm["interestTiers"],
        advancePaymentDiscounts: (existingPlan.advancePaymentDiscounts ??
          []) as MembershipPlanForm["advancePaymentDiscounts"],
      });
    } else if (!isEditing) {
      setIsUnlimited(false);
      setPriceDisplay("0");
      reset({
        name: "",
        description: "",
        isFamilyPlan: false,
        priceArs: 0,
        weeklyClassLimit: 2,
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 10,
        interestTiers: [],
        advancePaymentDiscounts: [],
      });
    }
  }, [open, existingPlan, isEditing, reset]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) : 0;
    setPriceDisplay(num.toLocaleString("es-AR"));
    setValue("priceArs", num, { shouldValidate: true });
  };

  const handleUnlimitedToggle = (checked: boolean) => {
    setIsUnlimited(checked);
    setValue("weeklyClassLimit", checked ? UNLIMITED_SENTINEL : 2, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: MembershipPlanForm) => {
    try {
      const interestTiers = data.interestTiers?.length
        ? data.interestTiers
        : undefined;
      const advancePaymentDiscounts = data.advancePaymentDiscounts?.length
        ? data.advancePaymentDiscounts
        : undefined;
      if (isEditing && planId) {
        await updatePlan({
          planId,
          name: data.name,
          description: data.description || undefined,
          isFamilyPlan: data.isFamilyPlan,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
          advancePaymentDiscounts,
        });
        toast.success("Plan actualizado");
      } else {
        await createPlan({
          name: data.name,
          description: data.description || undefined,
          isFamilyPlan: data.isFamilyPlan,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
          advancePaymentDiscounts,
        });
        toast.success("Plan creado");
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar plan" : "Nuevo plan"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Modifica los datos del plan de membresía."
              : "Crea un nuevo plan de membresía para tus miembros."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <Field>
            <FieldLabel>Nombre</FieldLabel>
            <Input
              {...register("name")}
              placeholder="Ej: Plan Básico, 2 veces/semana"
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Descripción (opcional)</FieldLabel>
            <Textarea
              {...register("description")}
              rows={2}
              placeholder="Descripción del plan..."
            />
          </Field>

          <Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-4">
              <Checkbox
                checked={isFamilyPlan}
                onCheckedChange={(checked) =>
                  setValue("isFamilyPlan", Boolean(checked), {
                    shouldValidate: true,
                  })
                }
              />
              <div className="space-y-1">
                <FieldLabel className="cursor-pointer text-sm font-semibold">
                  Es familiar
                </FieldLabel>
                <FieldDescription>
                  Marca este plan para poder asignarlo con un titular y varios
                  miembros asociados.
                </FieldDescription>
                <p className="text-xs font-medium text-amber-700">
                  {isFamilyPlan ? "Plan familiar activado" : "Plan individual"}
                </p>
              </div>
            </label>
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
                {...register("weeklyClassLimit", { valueAsNumber: true })}
                placeholder="2"
                disabled={isUnlimited}
                className={isUnlimited ? "opacity-40" : ""}
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
                  {...register("paymentWindowStartDay", {
                    valueAsNumber: true,
                  })}
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
                  {...register("paymentWindowEndDay", { valueAsNumber: true })}
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
                ? "Con cargos por mora configurados, el plan no se suspende automáticamente."
                : "Sin cargos por mora, el plan se suspende automáticamente si no se aprobó el pago."}
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
                  append({
                    daysAfterWindowEnd: 5,
                    type: "percentage",
                    value: 0,
                  })
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
                  const days = watchedTiers?.[index]?.daysAfterWindowEnd ?? 1;
                  const absoluteDay = watchedEndDay + days;
                  const sortedIdx = sortedTierDays.indexOf(absoluteDay);
                  const nextTierDay = sortedTierDays[sortedIdx + 1];
                  const rangeLabel = nextTierDay
                    ? `Desde el ${formatRangeDay(absoluteDay)} hasta el ${formatRangeDay(nextTierDay - 1)}`
                    : `Desde el ${formatRangeDay(absoluteDay)} en adelante`;

                  return (
                    <div
                      key={field.id}
                      className="bg-muted/50 space-y-2 rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">
                            Tramo {index + 1}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {rangeLabel}
                          </span>
                        </div>
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
                            Día del mes
                          </FieldLabel>
                          <Input
                            type="number"
                            min={watchedEndDay + 1}
                            max={watchedEndDay + 28}
                            value={absoluteDay}
                            onChange={(e) => {
                              const dayOfMonth =
                                parseInt(e.target.value, 10) || 0;
                              const relative = Math.max(
                                1,
                                dayOfMonth - watchedEndDay,
                              );
                              setValue(
                                `interestTiers.${index}.daysAfterWindowEnd`,
                                relative,
                                { shouldValidate: true },
                              );
                            }}
                          />
                          {absoluteDay > 28 && (
                            <p className="text-muted-foreground text-xs">
                              Día {absoluteDay - 28} del mes siguiente
                            </p>
                          )}
                        </Field>

                        <Field>
                          <FieldLabel className="text-muted-foreground text-xs font-normal">
                            Tipo
                          </FieldLabel>
                          <div className="relative">
                            <select
                              {...register(`interestTiers.${index}.type`)}
                              className="border-input bg-background h-9 w-full appearance-none rounded-md border pl-2 pr-7 text-sm"
                            >
                              <option value="percentage">%</option>
                              <option value="fixed">$ fijo</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                          </div>
                        </Field>

                        <Field>
                          <FieldLabel className="text-muted-foreground text-xs font-normal">
                            Valor
                          </FieldLabel>
                          <Input
                            type="number"
                            min={0}
                            step={
                              watchedTiers?.[index]?.type === "fixed"
                                ? 100
                                : 0.5
                            }
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
                  );
                })}
                <FieldDescription>
                  Los tramos son acumulativos: si aplican varios, todos se
                  suman. El cargo se calcula sobre el precio base del plan.
                </FieldDescription>
              </div>
            )}
          </Field>

          {/* Advance payment discounts */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>Descuentos por pago adelantado</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  appendDiscount({ months: 3, discountPercentage: 10 })
                }
              >
                <Plus className="h-3 w-3" />
                Agregar descuento
              </Button>
            </div>

            {discountFields.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Sin descuentos por pago adelantado configurados.
              </p>
            ) : (
              <div className="space-y-3">
                {discountFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="bg-muted/50 flex items-end gap-2 rounded-lg border p-3"
                  >
                    <Field className="flex-1">
                      <FieldLabel className="text-muted-foreground text-xs font-normal">
                        Meses
                      </FieldLabel>
                      <div className="relative">
                        <select
                          {...register(
                            `advancePaymentDiscounts.${index}.months`,
                            {
                              valueAsNumber: true,
                            },
                          )}
                          className="border-input bg-background h-9 w-full appearance-none rounded-md border pl-2 pr-7 text-sm"
                        >
                          <option value={3}>3 meses (trimestral)</option>
                          <option value={6}>6 meses (semestral)</option>
                          <option value={12}>12 meses (anual)</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                      </div>
                    </Field>

                    <Field className="flex-1">
                      <FieldLabel className="text-muted-foreground text-xs font-normal">
                        Descuento %
                      </FieldLabel>
                      <Input
                        type="number"
                        min={0.1}
                        max={100}
                        step="any"
                        {...register(
                          `advancePaymentDiscounts.${index}.discountPercentage`,
                          { valueAsNumber: true },
                        )}
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => removeDiscount(index)}
                      className="text-muted-foreground hover:text-destructive mb-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {errors.advancePaymentDiscounts && (
                  <FieldError>Revisá los valores de los descuentos</FieldError>
                )}
                <FieldDescription>
                  El miembro podrá elegir pagar varios meses por adelantado con
                  descuento al activar el plan desde la app.
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
              {isEditing ? "Guardar cambios" : "Crear plan"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
