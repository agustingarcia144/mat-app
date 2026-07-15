"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinanceType = "income" | "expense";

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

export function formatSignedCurrency(type: FinanceType, value: number) {
  return `${type === "income" ? "+" : "-"}${formatCurrency(value)}`;
}

export const amountToneClassName = (type: FinanceType) =>
  type === "income" ? "text-emerald-600" : "text-rose-600";

/** Circular icon that carries the income/expense meaning without a text badge. */
export function TypeAvatar({ type }: { type: FinanceType }) {
  const isIncome = type === "income";
  const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      aria-label={isIncome ? "Ingreso" : "Egreso"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border",
        isIncome
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
          : "border-rose-500/25 bg-rose-500/10 text-rose-600",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const tableHeadClassName =
  "h-10 text-xs font-medium uppercase tracking-wide text-muted-foreground";

export const tableRowClassName =
  "border-border/60 transition-colors hover:bg-muted/40";

export function FinanceStatePanel({
  icon: Icon,
  title,
  description,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
        <Icon className={cn("size-5", iconClassName)} />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
