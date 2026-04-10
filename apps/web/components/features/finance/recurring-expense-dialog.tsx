"use client";
"use no memo";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
  financeRecurringExpenseSchema,
  type FinanceRecurringExpenseForm,
} from "@repo/core/schemas";

const EXPENSE_CATEGORIES = [
  "Alquiler",
  "Luz",
  "Gas",
  "Empleados",
  "Insumos",
  "Mantenimiento",
  "Impuestos",
  "Otros",
];

type RecurringRuleForEdit = {
  _id: Id<"financeRecurringRules">;
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

export default function RecurringExpenseDialog({
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
  } = useForm<FinanceRecurringExpenseForm>({
    resolver: zodResolver(financeRecurringExpenseSchema) as any,
    defaultValues: {
      title: "",
      category: "",
      amountArs: 0,
      dayOfMonth: 1,
      startPeriod: currentPeriod(),
      endPeriod: "",
      paymentMethod: undefined,
      notes: "",
    },
  });

  const selectedPaymentMethod =
    useWatch({ control, name: "paymentMethod" }) ?? "none";

  const setPaymentMethod = (
    value: FinanceRecurringExpenseForm["paymentMethod"] | "none",
  ) => {
    setValue("paymentMethod", value === "none" ? undefined : value, {
      shouldValidate: true,
    });
  };

  useEffect(() => {
    if (!open) return;
    if (rule) {
      reset({
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

    reset({
      title: "",
      category: "",
      amountArs: 0,
      dayOfMonth: 1,
      startPeriod: currentPeriod(),
      endPeriod: "",
      paymentMethod: undefined,
      notes: "",
    });
  }, [open, reset, rule]);

  const onSubmit = async (data: FinanceRecurringExpenseForm) => {
    try {
      const payload = {
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
            {isEditing ? "Editar egreso recurrente" : "Nuevo egreso recurrente"}
          </SheetTitle>
          <SheetDescription>
            Crea egresos mensuales como alquiler, servicios o sueldos.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <Field>
            <FieldLabel>Título</FieldLabel>
            <Input {...register("title")} placeholder="Ej: Alquiler" />
            {errors.title && <FieldError>{errors.title.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Categoría</FieldLabel>
            <Input
              {...register("category")}
              list="recurring-expense-categories"
              placeholder="Ej: Alquiler"
            />
            <datalist id="recurring-expense-categories">
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <FieldDescription>
              Podés escribir una categoría nueva o usar una sugerida.
            </FieldDescription>
            {errors.category && (
              <FieldError>{errors.category.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Monto (ARS)</FieldLabel>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              {...register("amountArs", { valueAsNumber: true })}
            />
            {errors.amountArs && (
              <FieldError>{errors.amountArs.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Día del mes</FieldLabel>
            <Input
              type="number"
              min={1}
              max={28}
              step={1}
              {...register("dayOfMonth", { valueAsNumber: true })}
            />
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
              {errors.endPeriod && (
                <FieldError>{errors.endPeriod.message}</FieldError>
              )}
            </Field>
          </div>

          <Field>
            <FieldLabel>Método de pago</FieldLabel>
            <Select
              value={selectedPaymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(
                  value as
                    | FinanceRecurringExpenseForm["paymentMethod"]
                    | "none",
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
