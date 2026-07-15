"use client";
"use no memo";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
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
  CategorySuggestions,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/components/features/finance/finance-form-fields";
import {
  financeTransactionSchema,
  type FinanceTransactionForm,
} from "@repo/core/schemas";

type TransactionForEdit = {
  _id: Id<"financeTransactions">;
  type: "income" | "expense";
  title: string;
  category: string;
  amountArs: number;
  occurredOn: string;
  paymentMethod?: "cash" | "bank_transfer" | "card" | "other";
  notes?: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceTransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: TransactionForEdit | null;
}) {
  const createTransaction = useMutation(api.finance.createTransaction);
  const updateTransaction = useMutation(api.finance.updateTransaction);
  const isEditing = Boolean(transaction);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FinanceTransactionForm>({
    resolver: zodResolver(financeTransactionSchema as any) as any,
    defaultValues: {
      type: "income",
      title: "",
      category: "",
      amountArs: 0,
      occurredOn: todayIsoDate(),
      paymentMethod: undefined,
      notes: "",
    },
  });

  const selectedType = useWatch({ control, name: "type" }) ?? "income";
  const selectedCategory = useWatch({ control, name: "category" }) ?? "";
  const amount = useWatch({ control, name: "amountArs" }) ?? 0;
  const selectedPaymentMethod =
    useWatch({ control, name: "paymentMethod" }) ?? "none";
  const categoryOptions =
    selectedType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const isIncome = selectedType === "income";

  const setType = (nextType: FinanceTransactionForm["type"]) => {
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

  const setPaymentMethod = (
    value: FinanceTransactionForm["paymentMethod"] | "none",
  ) => {
    setValue("paymentMethod", value === "none" ? undefined : value, {
      shouldValidate: true,
    });
  };

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      reset({
        type: transaction.type,
        title: transaction.title,
        category: transaction.category,
        amountArs: transaction.amountArs,
        occurredOn: transaction.occurredOn,
        paymentMethod: transaction.paymentMethod,
        notes: transaction.notes ?? "",
      });
      return;
    }

    reset({
      type: "income",
      title: "",
      category: "",
      amountArs: 0,
      occurredOn: todayIsoDate(),
      paymentMethod: undefined,
      notes: "",
    });
  }, [open, reset, transaction]);

  const onSubmit = async (data: FinanceTransactionForm) => {
    try {
      const payload = {
        type: data.type,
        title: data.title,
        category: data.category,
        amountArs: data.amountArs,
        occurredOn: data.occurredOn,
        paymentMethod: data.paymentMethod,
        notes: data.notes || undefined,
      };

      if (transaction) {
        await updateTransaction({
          transactionId: transaction._id,
          ...payload,
        });
        toast.success("Movimiento actualizado");
      } else {
        await createTransaction(payload);
        toast.success("Movimiento registrado");
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
            {isEditing ? "Editar movimiento" : "Nuevo movimiento"}
          </SheetTitle>
          <SheetDescription>
            Registra ingresos y egresos externos a los pagos de membresía.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <div
              role="radiogroup"
              aria-label="Tipo de movimiento"
              className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-1"
            >
              {(
                [
                  {
                    value: "income",
                    label: "Ingreso",
                    icon: ArrowDownLeft,
                    active:
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
                  },
                  {
                    value: "expense",
                    label: "Egreso",
                    icon: ArrowUpRight,
                    active: "border-rose-500/40 bg-rose-500/10 text-rose-500",
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const isSelected = selectedType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setType(option.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
                      isSelected
                        ? option.active
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {errors.type && <FieldError>{errors.type.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Título</FieldLabel>
            <Input
              {...register("title")}
              placeholder={isIncome ? "Ej: Remeras MAT" : "Ej: Alquiler junio"}
            />
            {errors.title && <FieldError>{errors.title.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Categoría</FieldLabel>
            <Input
              {...register("category")}
              placeholder={isIncome ? "Ej: Indumentaria" : "Ej: Alquiler"}
            />
            <CategorySuggestions
              options={categoryOptions}
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
            <FieldLabel>Fecha</FieldLabel>
            <Input type="date" {...register("occurredOn")} />
            {errors.occurredOn && (
              <FieldError>{errors.occurredOn.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>Método de pago</FieldLabel>
            <Select
              value={selectedPaymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(
                  value as FinanceTransactionForm["paymentMethod"] | "none",
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
