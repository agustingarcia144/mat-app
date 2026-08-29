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
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";

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

  const orgClasses = useQuery(
    api.classes.getByOrganization,
    canQuery ? { activeOnly: false } : "skip",
  );

  const createPlan = useMutation(api.membershipPlans.create);
  const updatePlan = useMutation(api.membershipPlans.update);

  const [priceDisplay, setPriceDisplay] = useState("0");
  const [isUnlimited, setIsUnlimited] = useState(false);
  // "all" stores an empty allowedClassIds; "custom" narrows it to a selection
  const [classSelectionMode, setClassSelectionMode] = useState<
    "all" | "custom"
  >("all");
  const [tierDayDrafts, setTierDayDrafts] = useState<Record<string, string>>(
    {},
  );

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
      billingMode: "calendar",
      priceArs: 0,
      weeklyClassLimit: 2,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      interestTiers: [],
      advancePaymentDiscounts: [],
      classesEnabled: true,
      allowedClassIds: [],
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
  const billingMode = watch("billingMode") ?? "calendar";
  const isCalendarBilling = billingMode === "calendar";

  // Why this plan can or cannot be paid by automatic debit. Mercado Pago
  // charges the agreed recurring amount, which cannot express MAT's cumulative
  // late-fee rules, and its subscriptions bill from a fixed anchor day.
  const recurringBlocker = isCalendarBilling
    ? "El débito automático sólo funciona con cobro por ingreso: Mercado Pago cobra en una fecha fija de cada mes, no en una ventana del calendario."
    : (watchedTiers?.length ?? 0) > 0
      ? "Los intereses por mora no son compatibles con el débito automático: Mercado Pago vuelve a intentar el mismo importe acordado y no puede sumar los recargos."
      : null;
  const allowedClassIds = watch("allowedClassIds") ?? [];
  const classesEnabled = watch("classesEnabled") ?? true;

  const toggleAllowedClass = (classId: string, checked: boolean) => {
    const next = checked
      ? [...allowedClassIds, classId]
      : allowedClassIds.filter((id) => id !== classId);
    setValue("allowedClassIds", next, { shouldValidate: true });
  };

  const handleClassSelectionMode = (mode: "all" | "custom") => {
    setClassSelectionMode(mode);
    if (mode === "all") {
      setValue("allowedClassIds", [], { shouldValidate: true });
    }
  };

  // Sorted absolute days for all tiers — used to compute per-tier date ranges
  const sortedTierDays = [...(watchedTiers ?? [])]
    .map(
      (t) =>
        (isCalendarBilling ? watchedEndDay : 0) + (t?.daysAfterWindowEnd ?? 1),
    )
    .sort((a, b) => a - b);

  const formatRangeDay = (d: number) =>
    isCalendarBilling
      ? d <= 28
        ? `${d}`
        : `${d - 28} (mes sig.)`
      : `${d} día${d === 1 ? "" : "s"} posterior${d === 1 ? "" : "es"}`;

  useEffect(() => {
    if (!open) return;
    setTierDayDrafts({});
    if (existingPlan) {
      const unlimited = existingPlan.weeklyClassLimit >= UNLIMITED_SENTINEL;
      setIsUnlimited(unlimited);
      setClassSelectionMode(
        existingPlan.allowedClassIds?.length ? "custom" : "all",
      );
      setPriceDisplay(existingPlan.priceArs.toLocaleString("es-AR"));
      reset({
        name: existingPlan.name,
        description: existingPlan.description ?? "",
        isFamilyPlan: existingPlan.isFamilyPlan ?? false,
        billingMode: existingPlan.billingMode ?? "calendar",
        priceArs: existingPlan.priceArs,
        weeklyClassLimit: existingPlan.weeklyClassLimit,
        paymentWindowStartDay: existingPlan.paymentWindowStartDay,
        paymentWindowEndDay: existingPlan.paymentWindowEndDay,
        interestTiers: (existingPlan.interestTiers ??
          []) as MembershipPlanForm["interestTiers"],
        advancePaymentDiscounts: (existingPlan.advancePaymentDiscounts ??
          []) as MembershipPlanForm["advancePaymentDiscounts"],
        classesEnabled: existingPlan.classesEnabled ?? true,
        allowedClassIds: existingPlan.allowedClassIds ?? [],
      });
    } else if (!isEditing) {
      setIsUnlimited(false);
      setClassSelectionMode("all");
      setPriceDisplay("0");
      reset({
        name: "",
        description: "",
        isFamilyPlan: false,
        billingMode: "calendar",
        priceArs: 0,
        weeklyClassLimit: 2,
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 10,
        interestTiers: [],
        advancePaymentDiscounts: [],
        classesEnabled: true,
        allowedClassIds: [],
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
    if (
      data.classesEnabled &&
      classSelectionMode === "custom" &&
      (data.allowedClassIds ?? []).length === 0
    ) {
      toast.error("Seleccioná al menos una clase o elegí 'Todas'");
      return;
    }

    try {
      const interestTiers = data.interestTiers?.length
        ? data.interestTiers
        : undefined;
      const advancePaymentDiscounts = data.advancePaymentDiscounts?.length
        ? data.advancePaymentDiscounts
        : undefined;
      // Empty selection means "every class"; the backend stores that as undefined.
      const classAccessArgs = {
        classesEnabled: data.classesEnabled,
        allowedClassIds: data.classesEnabled
          ? ((data.allowedClassIds ?? []) as Id<"classes">[])
          : [],
      };
      if (isEditing && planId) {
        await updatePlan({
          planId,
          name: data.name,
          description: data.description || undefined,
          isFamilyPlan: data.isFamilyPlan,
          billingMode: data.billingMode,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
          advancePaymentDiscounts,
          ...classAccessArgs,
        });
        toast.success("Plan actualizado");
      } else {
        await createPlan({
          name: data.name,
          description: data.description || undefined,
          isFamilyPlan: data.isFamilyPlan,
          billingMode: data.billingMode,
          priceArs: data.priceArs,
          weeklyClassLimit: data.weeklyClassLimit,
          paymentWindowStartDay: data.paymentWindowStartDay,
          paymentWindowEndDay: data.paymentWindowEndDay,
          interestTiers,
          advancePaymentDiscounts,
          ...classAccessArgs,
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
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-500/40 dark:bg-amber-950/30">
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

          {/* Class access: master switch, weekly limit, and class selection */}
          <div className="space-y-3 rounded-xl border p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={classesEnabled}
                onCheckedChange={(checked) =>
                  setValue("classesEnabled", Boolean(checked), {
                    shouldValidate: true,
                  })
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <FieldLabel className="cursor-pointer text-sm font-semibold">
                  Habilitar clases
                </FieldLabel>
                <FieldDescription>
                  {classesEnabled
                    ? "El miembro puede reservar clases con este plan."
                    : "El miembro no tendrá acceso a ninguna clase con este plan."}
                </FieldDescription>
              </div>
            </label>

            {classesEnabled ? (
              <div className="space-y-5 border-t pt-4">
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
                    Máximo de clases que puede reservar por semana (lunes a
                    domingo).
                  </FieldDescription>
                  {errors.weeklyClassLimit && (
                    <FieldError>{errors.weeklyClassLimit.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Clases habilitadas</FieldLabel>

                  {/* Segmented: all classes vs. a specific selection */}
                  <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                    {(
                      [
                        { mode: "all", label: "Todas" },
                        { mode: "custom", label: "Elegir clases" },
                      ] as const
                    ).map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleClassSelectionMode(mode)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          classSelectionMode === mode
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {classSelectionMode === "all" ? (
                    <FieldDescription>
                      El plan habilita cualquier clase del gimnasio, incluidas
                      las que se creen más adelante.
                    </FieldDescription>
                  ) : orgClasses === undefined ? (
                    <p className="text-muted-foreground text-xs">
                      Cargando clases...
                    </p>
                  ) : orgClasses.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Todavía no hay clases creadas en el gimnasio.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          {allowedClassIds.length} de {orgClasses.length}{" "}
                          seleccionadas
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setValue(
                              "allowedClassIds",
                              allowedClassIds.length === orgClasses.length
                                ? []
                                : orgClasses.map((c) => c._id as string),
                              { shouldValidate: true },
                            )
                          }
                        >
                          {allowedClassIds.length === orgClasses.length
                            ? "Limpiar"
                            : "Seleccionar todas"}
                        </Button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {orgClasses.map((classItem) => {
                          const isSelected = allowedClassIds.includes(
                            classItem._id,
                          );
                          return (
                            <button
                              key={classItem._id}
                              type="button"
                              onClick={() =>
                                toggleAllowedClass(classItem._id, !isSelected)
                              }
                              className={cn(
                                "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40",
                                )}
                              >
                                {isSelected ? (
                                  <Check className="size-3" />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {classItem.name}
                              </span>
                              {!classItem.isActive && (
                                <span className="text-muted-foreground shrink-0 text-[11px]">
                                  inactiva
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {allowedClassIds.length === 0 && (
                        <FieldError>
                          Seleccioná al menos una clase o elegí &quot;Todas&quot;
                        </FieldError>
                      )}
                    </>
                  )}
                </Field>
              </div>
            ) : null}
          </div>

          <Field>
            <FieldLabel>Tipo de cobro</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={billingMode === "calendar"}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setValue("billingMode", "calendar", {
                        shouldValidate: true,
                      });
                    }
                  }}
                />
                <div className="space-y-1">
                  <FieldLabel className="cursor-pointer text-sm font-semibold">
                    Calendario
                  </FieldLabel>
                  <FieldDescription>
                    Cobra con ventana fija del mes, como funciona actualmente.
                  </FieldDescription>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={billingMode === "join_date"}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setValue("billingMode", "join_date", {
                        shouldValidate: true,
                      });
                    }
                  }}
                />
                <div className="space-y-1">
                  <FieldLabel className="cursor-pointer text-sm font-semibold">
                    Por ingreso
                  </FieldLabel>
                  <FieldDescription>
                    Cobra cada mes según el día en que ingresó el miembro.
                  </FieldDescription>
                </div>
              </label>
            </div>
          </Field>

          <div
            className={`rounded-lg border p-3 text-sm ${
              recurringBlocker
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <p className="font-medium">
              {recurringBlocker
                ? "Este plan no admite débito automático"
                : "Este plan admite débito automático"}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {recurringBlocker ??
                "Tus socios van a poder activar el cobro mensual con Mercado Pago, si lo tenés habilitado en Configuración."}
            </p>
            {recurringBlocker ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Los pagos por transferencia y los pagos adelantados siguen
                funcionando con normalidad.
              </p>
            ) : null}
          </div>

          {isCalendarBilling ? (
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
                    {...register("paymentWindowEndDay", {
                      valueAsNumber: true,
                    })}
                    min={1}
                    max={28}
                  />
                  {errors.paymentWindowEndDay && (
                    <FieldError>
                      {errors.paymentWindowEndDay.message}
                    </FieldError>
                  )}
                </Field>
              </div>
              <FieldDescription>
                {fields.length > 0
                  ? "Con cargos por mora configurados, el plan no se suspende automáticamente."
                  : "Sin cargos por mora, el plan se suspende automáticamente si no se aprobó el pago."}
              </FieldDescription>
            </Field>
          ) : null}

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
                  const storedDays = watchedTiers?.[index]?.daysAfterWindowEnd;
                  const days =
                    typeof storedDays === "number" &&
                    Number.isFinite(storedDays)
                      ? storedDays
                      : 1;
                  const absoluteDay =
                    (isCalendarBilling ? watchedEndDay : 0) + days;
                  const draftKey = `${field.id}-${isCalendarBilling ? "calendar" : "join"}`;
                  const dayInputValue =
                    tierDayDrafts[draftKey] ??
                    String(isCalendarBilling ? absoluteDay : days);
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
                            {isCalendarBilling
                              ? "Día del mes"
                              : "Días posteriores"}
                          </FieldLabel>
                          <Input
                            type="number"
                            min={isCalendarBilling ? watchedEndDay + 1 : 1}
                            max={isCalendarBilling ? watchedEndDay + 28 : 365}
                            value={dayInputValue}
                            onChange={(e) => {
                              const rawValue = e.target.value;
                              setTierDayDrafts((current) => ({
                                ...current,
                                [draftKey]: rawValue,
                              }));
                              const inputValue = parseInt(rawValue, 10);
                              const relative = Number.isFinite(inputValue)
                                ? isCalendarBilling
                                  ? inputValue - watchedEndDay
                                  : inputValue
                                : undefined;
                              setValue(
                                `interestTiers.${index}.daysAfterWindowEnd`,
                                relative as number,
                                { shouldValidate: true },
                              );
                            }}
                          />
                          {isCalendarBilling && absoluteDay > 28 && (
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
