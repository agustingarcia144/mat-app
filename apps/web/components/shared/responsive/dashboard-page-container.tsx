import * as React from 'react'

import { cn } from '@/lib/utils'

type DashboardPageContainerProps = React.ComponentProps<'section'>

export function DashboardPageContainer({
  className,
  ...props
}: DashboardPageContainerProps) {
  return (
    <section
      className={cn('container mx-auto px-3 sm:px-4 md:px-0', className)}
      {...props}
    />
  )
}
