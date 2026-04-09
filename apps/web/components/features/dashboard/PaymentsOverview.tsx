'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  TrendingUp,
} from 'lucide-react'

import { api } from '@/convex/_generated/api'
import { Card } from '@/components/ui/card'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'
import { cn } from '@/lib/utils'

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `$${Math.round(value).toLocaleString('es-AR')}`
}

function formatCompactCurrency(value?: number | null) {
  if (value === null || value === undefined) return '-'

  const rounded = Math.round(value)
  const compact = new Intl.NumberFormat('es-AR', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: rounded >= 1000000 ? 1 : 0,
  }).format(rounded)

  return `$${compact}`
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `${value.toLocaleString('es-AR', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatShortPeriod(period: string) {
  const [year, month] = period.split('-')
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
  }).format(new Date(Number(year), Number(month) - 1, 1))
}

export default function PaymentsOverview() {
  const canQuery = useCanQueryCurrentOrganization()
  const data = useQuery(api.planPayments.getOrganizationMetrics, canQuery ? {} : 'skip')

  const chartData = !data?.monthlyOverview?.length
    ? []
    : (() => {
        const periods = [...data.monthlyOverview].slice(0, 6).reverse()
        const maxAmount = Math.max(...periods.map((period) => period.approvedAmountArs), 1)

        return periods.map((period) => ({
          ...period,
          heightPct: Math.max((period.approvedAmountArs / maxAmount) * 100, 10),
        }))
      })()

  if (!canQuery || data === undefined) {
    return (
      <Card className="flex h-full min-h-[220px] w-full flex-col rounded-2xl border bg-background/60 p-4 md:h-[220px] md:p-5">
        <div className="text-sm text-muted-foreground">Pagos</div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Cargando resumen financiero...
        </div>
      </Card>
    )
  }

  const selectedOverview = data.selectedOverview

  return (
    <Card className="flex h-full min-h-[220px] w-full flex-col overflow-hidden rounded-2xl border bg-background/60 p-4 md:h-[220px] md:px-5 md:pb-5 md:pt-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">Pulso financiero</h3>
        <Link
          href="/dashboard/metrics/payments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver balance
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-stretch">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-stretch">
          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-emerald-500/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Ingresos</span>
              <CreditCard className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-xl font-semibold text-emerald-600 md:text-2xl">
              {formatCompactCurrency(selectedOverview?.approvedAmountArs ?? 0)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              Pagos aprobados del periodo
            </p>
          </div>

          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Cobranza</span>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {formatPercent(selectedOverview?.collectionRatePct ?? 0)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              Sobre {formatCompactCurrency(selectedOverview?.expectedAmountArs ?? 0)}
            </p>
          </div>

          <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-amber-500/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Pendientes</span>
              <Clock3 className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-600">
              {(selectedOverview?.pendingPayments ?? 0) +
                (selectedOverview?.inReviewPayments ?? 0)}
            </p>
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
              Pagos sin cerrar
            </p>
          </div>
        </div>

        <div className="flex h-full min-h-[112px] flex-col rounded-2xl border bg-background/40 p-3 xl:max-w-[220px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Evolucion de ingresos</p>
              <p className="text-[11px] text-muted-foreground">
                Ultimos {chartData.length} periodos
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {formatPercent(data.overview.collectionRatePct)} actual
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
              Todavia no hay periodos suficientes para graficar.
            </div>
          ) : (
            <div className="mt-auto flex h-[58px] items-end gap-1 pt-2">
              {chartData.map((period) => (
                <div
                  key={period.billingPeriod}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex h-full w-full items-end">
                    <div
                      className={cn(
                        'w-full rounded-t-xl bg-gradient-to-t from-emerald-500 to-emerald-300 transition-all',
                        period.billingPeriod === data.selectedPeriod &&
                          'from-primary to-primary/70'
                      )}
                      style={{ height: `${period.heightPct}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-medium">
                      {formatShortPeriod(period.billingPeriod)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {formatCompactCurrency(period.approvedAmountArs)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
