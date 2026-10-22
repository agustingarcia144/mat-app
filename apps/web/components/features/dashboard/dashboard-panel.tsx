"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatArs(value: number) {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

/**
 * Color on the dashboard only carries meaning: good, warning or bad. Surfaces
 * stay neutral, so these few tones are what the eye lands on.
 */
export type Trend = "up" | "down" | "warning" | "neutral";

const TREND_PILL: Record<Trend, string> = {
  up: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  down: "bg-red-500/15 text-red-600 dark:text-red-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground",
};

const TREND_ARROW: Partial<Record<Trend, string>> = {
  up: "text-emerald-500",
  down: "text-red-500",
};

export function TrendPill({
  trend,
  children,
}: {
  trend: Trend;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        TREND_PILL[trend],
      )}
    >
      {children}
    </span>
  );
}

/** "+38%" style label for a change between two counts, or null without a base. */
export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

/** Bordered section with a title row and an optional "see more" link. */
export function Panel({
  title,
  description,
  href,
  linkLabel = "Ver todo",
  action,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-muted-foreground">
            {title}
          </h2>
          {description ? (
            <p className="truncate text-xs text-muted-foreground/80">
              {description}
            </p>
          ) : null}
        </div>
        {action}
        {href ? (
          <Link
            href={href}
            className="-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            {linkLabel}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PanelSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <Skeleton className="mb-4 h-5 w-32" />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Quiet empty state that keeps a panel's height without a mascot. */
export function PanelEmpty({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  detail,
  href,
  pill,
  trend = "neutral",
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  /** Short badge in the corner, e.g. "+38%"; its color comes from `trend`. */
  pill?: ReactNode;
  trend?: Trend;
  children?: ReactNode;
}) {
  const Arrow = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : null;
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {pill ? <TrendPill trend={trend}>{pill}</TrendPill> : null}
      </div>
      <p className="mt-1 flex items-center gap-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">
        {value}
        {Arrow ? (
          <Arrow
            className={cn("size-4 shrink-0", TREND_ARROW[trend])}
            aria-hidden
          />
        ) : null}
      </p>
      {children}
      {detail ? (
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </>
  );
  const className =
    "flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 sm:p-4";

  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "outline-none transition-colors hover:border-foreground/20 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** Thin capacity bar; turns amber when nearly full and red when full. */
export function OccupancyBar({
  taken,
  capacity,
}: {
  taken: number;
  capacity?: number | null;
}) {
  if (!capacity || capacity <= 0) {
    return (
      <span className="text-xs tabular-nums text-muted-foreground">
        {taken}
      </span>
    );
  }
  const pct = Math.min((taken / capacity) * 100, 100);
  return (
    <span className="flex items-center gap-2">
      <span
        className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:block"
        aria-hidden
      >
        <span
          className={cn(
            "block h-full rounded-full",
            pct >= 100
              ? "bg-red-500"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-foreground/60",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {taken}/{capacity}
      </span>
    </span>
  );
}
