'use client'

import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  icon?: LucideIcon
  iconHref?: string

  variant?: 'metric' | 'list'

  value?: number | string
  footer?: ReactNode

  children?: ReactNode

  compact?: boolean
  actionLabel?: string
  actionHref?: string
  actionIcon?: LucideIcon
  className?: string
}

export default function StatsCard({
  title,
  icon: Icon,
  iconHref,
  variant = 'metric',
  value,
  footer,
  children,
  compact = false,
  actionLabel,
  actionHref,
  actionIcon: ActionIcon,
  className,
}: Props) {
  const isList = variant === 'list'

  return (
    <Card
      className={cn(
        'flex min-w-0 min-h-0 flex-col overflow-hidden rounded-2xl border bg-background/60 p-4 transition hover:shadow-md',
        !isList && 'min-h-[180px] w-full justify-between md:h-[180px] md:w-[200px]',
        isList &&
          (compact
            ? 'min-h-[180px] w-full md:h-[180px]'
            : 'min-h-[200px] w-full md:h-[200px]'),
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition hover:bg-accent/40"
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {actionLabel}
            </Link>
          )}

          {Icon && iconHref && (
            <Link
              href={iconHref}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 hover:bg-muted"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
        </div>
      </div>

      {!isList ? (
        <>
          <div className="flex flex-1 items-center justify-center">
            <span className="text-4xl font-semibold">{value}</span>
          </div>

          {footer && (
            <div className="flex justify-center">{footer}</div>
          )}
        </>
      ) : (
        <div
          className={[
            'mt-2 min-h-0 flex-1 overflow-hidden pr-1',
            children
              ? 'space-y-2'
              : 'flex items-center justify-center',
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </Card>
  )
}
