"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type FinanceType = "income" | "expense";

export const INCOME_CATEGORIES = [
  "Indumentaria",
  "Suplementos",
  "Eventos",
  "Otros",
];

export const EXPENSE_CATEGORIES = [
  "Alquiler",
  "Luz",
  "Gas",
  "Empleados",
  "Insumos",
  "Mantenimiento",
  "Impuestos",
  "Otros",
];

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

export const arsFormatter = new Intl.NumberFormat("es-AR");

const chipClassName =
  "rounded-full border px-2.5 py-1 text-xs transition-colors";

const inactiveChipClassName =
  "border-border text-muted-foreground hover:bg-muted hover:text-foreground";

const TYPE_OPTIONS = [
  {
    value: "income",
    label: "Ingreso",
    icon: ArrowDownLeft,
    activeClassName: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  },
  {
    value: "expense",
    label: "Egreso",
    icon: ArrowUpRight,
    activeClassName: "border-rose-500/40 bg-rose-500/10 text-rose-500",
  },
] as const;

export function categoriesForType(type: FinanceType) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function FinanceTypeToggle({
  value,
  onChange,
}: {
  value: FinanceType;
  onChange: (type: FinanceType) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de movimiento"
      className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-1"
    >
      {TYPE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
              isSelected
                ? option.activeClassName
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CategorySuggestions({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (category: string) => void;
}) {
  const normalized = value.trim().toLowerCase();

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {options.map((category) => {
        const isSelected = normalized === category.toLowerCase();
        return (
          <button
            key={category}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? "" : category)}
            className={cn(
              chipClassName,
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : inactiveChipClassName,
            )}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

export function AmountArsInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (amount: number) => void;
}) {
  return (
    <>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">
          $
        </span>
        <Input
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={value > 0 ? arsFormatter.format(value) : ""}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
            onChange(digits ? Number(digits) : 0);
          }}
          className="h-11 pl-7 pr-14 text-base font-semibold tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          ARS
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {QUICK_AMOUNTS.map((quickAmount) => (
          <button
            key={quickAmount}
            type="button"
            onClick={() => onChange(value + quickAmount)}
            className={cn(chipClassName, inactiveChipClassName)}
          >
            +{arsFormatter.format(quickAmount)}
          </button>
        ))}
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="rounded-full px-2.5 py-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
    </>
  );
}
