"use client";
"use no memo";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AmountArsInput,
  arsFormatter,
  categoriesForType,
  CategorySuggestions,
  FinanceTypeToggle,
} from "@/components/features/finance/finance-form-fields";
import {
  financeRecurringRuleSchema,
  type FinanceRecurringRuleForm,
} from "@repo/core/schemas";

const QUICK_DAYS = [1, 5, 10, 15, 20, 28];

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
});

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return null;
  return monthFormatter.format(new Date(year, month - 1, 1));
}

type RecurringRuleForEdit = {
  _id: Id<"financeRecurringRules">;
  type: "income" | "expense";
  title: string;
  category: string;
  amountArs: number;
  dayOfMonth: number;
  startPeriod: string;
  endPeriod?: string;
  paymentMethod?: "cash" | "bank_transfer" | "card" | "other";
  notes?: string;
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function emptyValues(): FinanceRecurringRuleForm {
  return {
    type: "expense",
    title: "",
    category: "",
    amountArs: 0,
    dayOfMonth: 1,
    startPeriod: currentPeriod(),
    endPeriod: "",
    paymentMethod: undefined,
    notes: "",
  };
}

export default function RecurringRuleDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: RecurringRuleForEdit | null;
}) {
  const createRecurringRule = useMutation(api.finance.createRecurringRule);
  const updateRecurringRule = useMutation(api.finance.updateRecurringRule);
  const isEditing = Boolean(rule);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FinanceRecurringRuleForm>({
    resolver: zodResolver(financeRecurringRuleSchema as any) as any,
    defaultValues: emptyValues(),
  });

  const selectedType = useWatch({ control, name: "type" }) ?? "expense";
  const selectedCategory = useWatch({ control, name: "category" }) ?? "";
  const amount = useWatch({ control, name: "amountArs" }) ?? 0;
  const dayOfMonth = useWatch({ control, name: "dayOfMonth" }) ?? 1;
  const startPeriod = useWatch({ control, name: "startPeriod" }) ?? "";
  const endPeriod = useWatch({ control, name: "endPeriod" }) ?? "";
  const selectedPaymentMethod =
    useWatch({ control, name: "paymentMethod" }) ?? "none";

  const isIncome = selectedType === "income";
  const startLabel = formatPeriod(startPeriod);
  const endLabel = endPeriod ? formatPeriod(endPeriod) : null;

  const setType = (nextType: FinanceRecurringRuleForm["type"]) => {
    if (nextType === selectedType) return;
    setValue("type", nextType, { shouldValidate: true });
    setValue("category", "", { shouldValidate: true });
  };

  const setCategory = (value: string) => {
    setValue("category", value, { shouldValidate: true });
  };

  const setAmount = (value: number) => {
    setValue("amountArs", value, { shouldValidate: true });
  };

  const setDayOfMonth = (value: number) => {
    setValue("dayOfMonth", value, { shouldValidate: true });
  };

  const setPaymentMethod = (
    value: FinanceRecurringRuleForm["paymentMethod"] | "none",
  ) => {
    setValue("paymentMethod", value === "none" ? undefined : value, {
      shouldValidate: true,
    });
  };

  useEffect(() => {
    if (!open) return;
    if (rule) {
      reset({
        type: rule.type,
        title: rule.title,
        category: rule.category,
        amountArs: rule.amountArs,
        dayOfMonth: rule.dayOfMonth,
        startPeriod: rule.startPeriod,
        endPeriod: rule.endPeriod ?? "",
        paymentMethod: rule.paymentMethod,
        notes: rule.notes ?? "",
      });
      return;
    }

    reset(emptyValues());
  }, [open, reset, rule]);

  const onSubmit = async (data: FinanceRecurringRuleForm) => {
    try {
      const payload = {
        type: data.type,
        title: data.title,
        category: data.category,
        amountArs: data.amountArs,
        dayOfMonth: data.dayOfMonth,
        startPeriod: data.startPeriod,
        endPeriod: data.endPeriod || undefined,
        paymentMethod: data.paymentMethod,
        notes: data.notes || undefined,
      };

      if (rule) {
        await updateRecurringRule({
          ruleId: rule._id,
          ...payload,
        });
        toast.success("Recurrente actualizado");
      } else {
        await createRecurringRule(payload);
        toast.success("Recurrente creado");
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar recurrente" : "Nuevo recurrente"}
          </SheetTitle>
          <SheetDescription>
            Creá ingresos o egresos que se repiten todos los meses, como
            alquiler, servicios, sueldos o un ingreso fijo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <FinanceTypeToggle value={selectedType} onChange={setType} />
            {errors.type && <FieldError>{errors.type.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Título</FieldLabel>
            <Input
              {...register("title")}
              placeholder={
                isIncome ? "Ej: Alquiler de sala" : "Ej: Alquiler del local"
              }
            />
            {errors.title && <FieldError>{errors.title.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Categoría</FieldLabel>
            <Input
              {...register("category")}
              placeholder={isIncome ? "Ej: Eventos" : "Ej: Alquiler"}
            />
            <CategorySuggestions
              options={categoriesForType(selectedType)}
              value={selectedCategory}
              onSelect={setCategory}
            />
            <FieldDescription>
              Elegí una sugerida o escribí una categoría nueva.
            </FieldDescription>
            {errors.category && (
              <FieldError>{errors.category.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Monto</FieldLabel>
            <AmountArsInput value={amount} onChange={setAmount} />
            {errors.amountArs && (
              <FieldError>{errors.amountArs.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Día del mes</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DAYS.map((day) => {
                const isSelected = dayOfMonth === day;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setDayOfMonth(day)}
                    className={cn(
                      "size-9 rounded-md border text-sm tabular-nums transition-colors",
                      isSelected
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
              <Input
                type="number"
                min={1}
                max={28}
                step={1}
                aria-label="Otro día del mes"
                className="h-9 w-20 tabular-nums"
                {...register("dayOfMonth", { valueAsNumber: true })}
              />
            </div>
            <FieldDescription>
              Usamos 1 a 28 para evitar meses sin ese día.
            </FieldDescription>
            {errors.dayOfMonth && (
              <FieldError>{errors.dayOfMonth.message}</FieldError>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Inicio</FieldLabel>
              <Input type="month" {...register("startPeriod")} />
              {errors.startPeriod && (
                <FieldError>{errors.startPeriod.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel>Fin opcional</FieldLabel>
              <Input type="month" {...register("endPeriod")} />
              <FieldDescription>Vacío = sin fecha de fin.</FieldDescription>
              {errors.endPeriod && (
                <FieldError>{errors.endPeriod.message}</FieldError>
              )}
            </Field>
          </div>

          <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
            {amount > 0 && startLabel ? (
              <>
                Se registrará un {isIncome ? "ingreso" : "egreso"} de{" "}
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    isIncome ? "text-emerald-500" : "text-rose-500",
                  )}
                >
                  ${arsFormatter.format(amount)}
                </span>{" "}
                el día{" "}
                <span className="font-medium text-foreground">
                  {dayOfMonth}
                </span>{" "}
                de cada mes, desde{" "}
                <span className="font-medium text-foreground">
                  {startLabel}
                </span>{" "}
                {endLabel ? (
                  <>
                    hasta{" "}
                    <span className="font-medium text-foreground">
                      {endLabel}
                    </span>
                    .
                  </>
                ) : (
                  "y sin fecha de fin."
                )}
              </>
            ) : (
              "Completá el monto y el inicio para ver cómo se va a repetir."
            )}
          </div>

          <Field>
            <FieldLabel>Método de pago</FieldLabel>
            <Select
              value={selectedPaymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(
                  value as FinanceRecurringRuleForm["paymentMethod"] | "none",
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin especificar</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="bank_transfer">Transferencia</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Notas</FieldLabel>
            <Textarea
              rows={3}
              {...register("notes")}
              placeholder="Detalle opcional"
            />
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
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
