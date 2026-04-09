'use client'

import Link from 'next/link'
import { useMemo, useState, type ComponentType } from 'react'
import { useQuery } from 'convex/react'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  Percent,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `$${Math.round(value).toLocaleString('es-AR')}`
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `${value.toLocaleString('es-AR', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatBillingPeriod(period: string) {
  const [year, month] = period.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatDelta(
  value?: number | null,
  kind: 'currency' | 'percent' | 'count' = 'count'
) {
  if (value === null || value === undefined) return '-'
  const prefix = value > 0 ? '+' : ''
  if (kind === 'currency') return `${prefix}${formatCurrency(value)}`
  if (kind === 'percent') return `${prefix}${formatPercent(value)}`
  return `${prefix}${value.toLocaleString('es-AR')}`
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  title: string
  value: string
  detail: string
  icon: ComponentType<{ className?: string }>
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue'
}) {
  const toneClasses = {
    default: 'text-foreground',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
  }

  return (
    <Card className='bg-card/70'>
      <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
        <Icon className={cn('size-4', toneClasses[tone])} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-semibold', toneClasses[tone])}>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}

function DeltaPill({
  value,
  kind,
}: {
  value?: number | null
  kind?: 'currency' | 'percent' | 'count'
}) {
  if (value === null || value === undefined) {
    return (
      <span className='rounded-full border px-2 py-1 text-xs text-muted-foreground'>
        Sin comparacion
      </span>
    )
  }

  const isPositive = value > 0
  const isNegative = value < 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs',
        isPositive && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
        isNegative && 'border-red-500/30 bg-red-500/10 text-red-600',
        !isPositive &&
          !isNegative &&
          'border-blue-500/30 bg-blue-500/10 text-blue-600'
      )}
    >
      {isPositive ? <ArrowUp className='size-3' /> : null}
      {isNegative ? <ArrowDown className='size-3' /> : null}
      {formatDelta(value, kind)}
    </span>
  )
}

export default function PaymentMetricsPage() {
  const canQuery = useCanQueryCurrentOrganization()
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined)
  const data = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery ? { selectedPeriod } : 'skip'
  )

  const selectedPeriodLabel = useMemo(() => {
    if (!data?.selectedPeriod) return ''
    return formatBillingPeriod(data.selectedPeriod)
  }, [data?.selectedPeriod])

  const previousPeriodLabel = useMemo(() => {
    if (!data?.previousPeriod) return null
    return formatBillingPeriod(data.previousPeriod)
  }, [data?.previousPeriod])

  if (!canQuery || data === undefined) {
    return (
      <DashboardPageContainer className='space-y-6 py-6 md:py-10'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold md:text-3xl'>Balance Financiero</h1>
          <p className='max-w-3xl text-sm text-muted-foreground md:text-base'>
            Cargando resumen financiero y comparaciones entre periodos...
          </p>
        </div>
      </DashboardPageContainer>
    )
  }

  const {
    overview,
    paymentMethods,
    planBreakdown,
    monthlyOverview,
    availablePeriods,
    selectedOverview,
    comparison,
    financialBalance,
  } = data

  return (
    <DashboardPageContainer className='space-y-6 py-6 md:py-10'>
      <div className='space-y-3'>
        <Link
          href='/dashboard/metrics'
          className='inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground'
        >
          <ArrowLeft className='size-4' />
          Volver a metricas
        </Link>
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold md:text-3xl'>Balance Financiero</h1>
          <p className='max-w-3xl text-sm text-muted-foreground md:text-base'>
            El foco principal es el dinero que ingreso al gimnasio y el estado del
            balance del periodo.
          </p>
        </div>
      </div>

      <section className='space-y-4'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <h2 className='text-lg font-semibold'>Balance del periodo</h2>
            <p className='text-sm text-muted-foreground'>
              {selectedPeriodLabel}
              {previousPeriodLabel ? ` comparado con ${previousPeriodLabel}` : ''}
            </p>
          </div>

          <div className='w-full md:w-72'>
            <Select
              value={data.selectedPeriod}
              onValueChange={(value) => setSelectedPeriod(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder='Elegi un periodo' />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.map((period) => (
                  <SelectItem key={period} value={period}>
                    {formatBillingPeriod(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
          <Card className='bg-card/80'>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Landmark className='size-4 text-emerald-600' />
                Resumen principal
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='rounded-2xl border bg-emerald-500/5 p-5'>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Dinero que ingreso
                  </p>
                  <p className='mt-3 text-4xl font-semibold text-emerald-600'>
                    {formatCurrency(financialBalance.incomeArs)}
                  </p>
                  <div className='mt-3'>
                    <DeltaPill
                      value={comparison?.approvedAmountDeltaArs}
                      kind='currency'
                    />
                  </div>
                </div>

                <div className='rounded-2xl border bg-background/60 p-5'>
                  <p className='text-sm font-medium text-muted-foreground'>
                    Rentabilidad del gimnasio
                  </p>
                  <p className='mt-3 text-4xl font-semibold'>
                    {formatPercent(financialBalance.profitabilityPct)}
                  </p>
                  <p className='mt-3 text-sm text-muted-foreground'>
                    {financialBalance.hasExpenseData
                      ? 'Calculada sobre ingresos y egresos reales.'
                      : 'Pendiente hasta registrar egresos reales.'}
                  </p>
                </div>
              </div>

              <div className='grid gap-4 md:grid-cols-3'>
                <div className='rounded-xl border bg-background/50 p-4'>
                  <p className='text-xs uppercase tracking-wide text-muted-foreground'>
                    Ingresos por interes
                  </p>
                  <p className='mt-2 text-2xl font-semibold text-blue-600'>
                    {formatCurrency(financialBalance.interestIncomeArs)}
                  </p>
                </div>

                <div className='rounded-xl border bg-background/50 p-4'>
                  <p className='text-xs uppercase tracking-wide text-muted-foreground'>
                    Egresos
                  </p>
                  <p className='mt-2 text-2xl font-semibold text-amber-600'>
                    {formatCurrency(financialBalance.expenseArs)}
                  </p>
                </div>

                <div className='rounded-xl border bg-background/50 p-4'>
                  <p className='text-xs uppercase tracking-wide text-muted-foreground'>
                    Resultado neto
                  </p>
                  <p className='mt-2 text-2xl font-semibold'>
                    {formatCurrency(financialBalance.netResultArs)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className='grid gap-4'>
            <MetricCard
              title='Cobranza del periodo'
              value={formatPercent(selectedOverview?.collectionRatePct ?? 0)}
              detail={`${formatCurrency(selectedOverview?.approvedAmountArs)} cobrados sobre ${formatCurrency(selectedOverview?.expectedAmountArs)}`}
              icon={Percent}
              tone='green'
            />
            <MetricCard
              title='Pagos aprobados'
              value={`${selectedOverview?.approvedPayments ?? 0}`}
              detail='Cantidad de pagos aprobados en el periodo'
              icon={CheckCircle2}
              tone='green'
            />
            <MetricCard
              title='Pendientes y revision'
              value={`${(selectedOverview?.pendingPayments ?? 0) + (selectedOverview?.inReviewPayments ?? 0)}`}
              detail='Pagos todavia no cerrados del periodo'
              icon={Clock3}
              tone='amber'
            />
          </div>
        </div>

        {!financialBalance.hasExpenseData ? (
          <Card className='border-dashed bg-card/50'>
            <CardContent className='pt-6 text-sm text-muted-foreground'>
              Hoy el panel puede mostrar con claridad cuanto dinero ingreso, pero
              la rentabilidad real sigue incompleta porque no existe una tabla de
              egresos o gastos en Convex.
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className='space-y-4'>
        <div>
          <h2 className='text-lg font-semibold'>Comparacion mensual</h2>
          <p className='text-sm text-muted-foreground'>
            Variacion del periodo seleccionado contra el mes anterior.
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <Card className='bg-card/70'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Ingresos vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='text-2xl font-semibold'>
                {formatCurrency(selectedOverview?.approvedAmountArs)}
              </p>
              <DeltaPill value={comparison?.approvedAmountDeltaArs} kind='currency' />
            </CardContent>
          </Card>

          <Card className='bg-card/70'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                % de cobro vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='text-2xl font-semibold'>
                {formatPercent(selectedOverview?.collectionRatePct)}
              </p>
              <DeltaPill value={comparison?.collectionRateDeltaPct} kind='percent' />
            </CardContent>
          </Card>

          <Card className='bg-card/70'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Aprobados vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='text-2xl font-semibold'>
                {selectedOverview?.approvedPayments ?? 0}
              </p>
              <DeltaPill value={comparison?.approvedPaymentsDelta} kind='count' />
            </CardContent>
          </Card>

          <Card className='bg-card/70'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Pendientes vs mes anterior
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='text-2xl font-semibold'>
                {selectedOverview?.pendingPayments ?? 0}
              </p>
              <DeltaPill value={comparison?.pendingPaymentsDelta} kind='count' />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className='grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]'>
        <Card className='bg-card/70'>
          <CardHeader>
            <CardTitle>Metodos de pago</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {paymentMethods.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                Todavia no hay metodos de pago registrados en la base.
              </p>
            ) : (
              paymentMethods.map((method) => (
                <div key={method.method} className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-medium capitalize'>
                      {method.method.replaceAll('_', ' ')}
                    </span>
                    <span className='text-muted-foreground'>
                      {formatPercent(method.percentage)} · {method.count}
                    </span>
                  </div>
                  <div className='h-2 rounded-full bg-muted'>
                    <div
                      className='h-2 rounded-full bg-primary transition-all'
                      style={{ width: `${Math.min(method.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className='bg-card/70'>
          <CardHeader>
            <CardTitle>Rendimiento por plan</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Miembros</TableHead>
                  <TableHead>Cobrado</TableHead>
                  <TableHead>% de cobro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='text-muted-foreground'>
                      No hay planes activos para resumir.
                    </TableCell>
                  </TableRow>
                ) : (
                  planBreakdown.map((plan) => (
                    <TableRow key={plan.planId}>
                      <TableCell className='font-medium'>{plan.planName}</TableCell>
                      <TableCell>{plan.members}</TableCell>
                      <TableCell>{formatCurrency(plan.approvedRevenueArs)}</TableCell>
                      <TableCell>{formatPercent(plan.collectionRatePct)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className='bg-card/70'>
          <CardHeader>
            <CardTitle>Ultimos periodos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Pagos</TableHead>
                  <TableHead>Aprobados</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Ingresos</TableHead>
                  <TableHead>% de cobro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyOverview.map((period) => (
                  <TableRow
                    key={period.billingPeriod}
                    className={cn(
                      period.billingPeriod === data.selectedPeriod && 'bg-accent/20'
                    )}
                  >
                    <TableCell className='font-medium'>
                      {formatBillingPeriod(period.billingPeriod)}
                    </TableCell>
                    <TableCell>{period.totalPayments}</TableCell>
                    <TableCell>{period.approvedPayments}</TableCell>
                    <TableCell>{period.inReviewPayments}</TableCell>
                    <TableCell>{formatCurrency(period.approvedAmountArs)}</TableCell>
                    <TableCell>{formatPercent(period.collectionRatePct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title='Cobranza actual'
          value={formatPercent(overview.collectionRatePct)}
          detail={`${formatCurrency(overview.approvedRevenueArs)} cobrados sobre ${formatCurrency(overview.expectedRevenueArs)}`}
          icon={Percent}
          tone='green'
        />
        <MetricCard
          title='Pagos aprobados'
          value={formatPercent(overview.approvalRatePct)}
          detail={`${overview.approvedCount} de ${overview.trackedMembers} miembros al dia`}
          icon={CheckCircle2}
          tone='green'
        />
        <MetricCard
          title='Impagos'
          value={formatPercent(overview.unpaidRatePct)}
          detail={`${overview.unpaidCount} miembros con pago faltante, pendiente o rechazado`}
          icon={AlertCircle}
          tone='red'
        />
        <MetricCard
          title='Suspendidos'
          value={formatPercent(overview.suspendedRatePct)}
          detail={`${overview.suspendedCount} suscripciones suspendidas`}
          icon={ShieldAlert}
          tone='red'
        />
      </section>
    </DashboardPageContainer>
  )
}
