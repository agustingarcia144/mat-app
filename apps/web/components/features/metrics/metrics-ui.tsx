"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatCount(value: number) {
  return value.toLocaleString("es-AR");
}

/**
 * Recharts tooltip styling. The theme tokens are oklch, so they are read with
 * `var(--token)` directly — wrapping them in `hsl()` yields an invalid color.
 */
export const CHART_TOOLTIP_PROPS = {
  cursor: { className: "fill-muted/40" },
  contentStyle: {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
  } satisfies CSSProperties,
  labelStyle: { color: "var(--popover-foreground)", fontWeight: 500 },
  itemStyle: { color: "var(--popover-foreground)" },
} as const;

export const CHART_AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
} as const;

export function MetricsPageHeader({
  title,
  description,
  backHref = "/dashboard/metrics",
  backLabel = "Métricas",
  actions,
}: {
  title: string;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  valueClassName,
  delta,
  detail,
  children,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  delta?: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-2xl font-semibold tabular-nums md:text-3xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      {delta}
      {children}
      {detail ? (
        <div className="text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {children}
    </section>
  );
}

/** Up/down change, green when it moves the good way (`invert` for costs). */
export function DeltaPill({
  value,
  suffix = "",
  invert = false,
  label,
}: {
  value?: number | null;
  suffix?: string;
  invert?: boolean;
  label?: string;
}) {
  if (value === null || value === undefined || value === 0) return null;

  const isGood = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        isGood
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {value > 0 ? "+" : "−"}
      {Math.abs(value).toLocaleString("es-AR", { maximumFractionDigits: 1 })}
      {suffix}
      {label ? <span className="text-muted-foreground"> {label}</span> : null}
    </span>
  );
}

export function MetricsSection({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("bg-card", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function MetricsEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Green / amber / red pill for a percentage where higher is better. */
export function RateBadge({
  value,
  good = 80,
  fair = 50,
}: {
  value: number | null;
  good?: number;
  fair?: number;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        value >= good
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : value >= fair
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {formatPercent(value)}
    </span>
  );
}

/** Thin progress bar used for shares and rates. */
export function ShareBar({
  share,
  className,
  barClassName = "bg-foreground/70",
}: {
  share: number;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full", barClassName)}
        style={{ width: `${Math.min(Math.max(share, 0), 100)}%` }}
      />
    </div>
  );
}
