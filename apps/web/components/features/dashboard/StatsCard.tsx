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
        'rounded-2xl border bg-background/60 p-4 transition hover:shadow-md flex flex-col',
        !isList && 'h-[180px] w-[200px] justify-between',
        isList && (compact ? 'h-[180px] w-[340px]' : 'h-[200px] w-[340px]'),
        className
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>

        <div className="flex items-center gap-2">
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-accent/40 transition"
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
            'flex-1 mt-2 pr-1',
            children
              ? 'overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
              : 'flex items-center justify-center',
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </Card>
  )
}