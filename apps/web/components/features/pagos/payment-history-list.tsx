'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { type Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PaymentReviewDialog from './dialogs/payment-review-dialog'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

type PaymentStatusFilter = 'all' | 'pending' | 'in_review' | 'approved' | 'declined'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendiente', variant: 'secondary' },
  in_review: { label: 'En revisión', variant: 'outline' },
  approved: { label: 'Aprobado', variant: 'default' },
  declined: { label: 'Rechazado', variant: 'destructive' },
}

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split('-')
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const monthIndex = parseInt(month!, 10) - 1
  return `${monthNames[monthIndex]} ${year}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function PaymentHistoryList() {
  const canQuery = useCanQueryCurrentOrganization()
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>('all')

  const payments = useQuery(
    api.planPayments.getByOrganization,
    canQuery
      ? statusFilter === 'all'
        ? {}
        : { status: statusFilter }
      : 'skip'
  )

  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<{
    id: Id<'planPayments'>
    memberName: string
    planName: string
    billingPeriod: string
    amountArs: number
  } | null>(null)

  const handleRowClick = (payment: NonNullable<typeof payments>[number]) => {
    if (payment.status !== 'in_review') return
    setSelectedPayment({
      id: payment._id,
      memberName: payment.userFullName,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amountArs: payment.amountArs,
    })
    setReviewOpen(true)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Historial de pagos</h2>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PaymentStatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="in_review">En revisión</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
              <SelectItem value="declined">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {payments === undefined ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando historial...
          </p>
        ) : payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay pagos registrados.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Miembro</th>
                  <th className="p-3 text-left font-medium">Plan</th>
                  <th className="p-3 text-left font-medium">Periodo</th>
                  <th className="p-3 text-left font-medium">Monto</th>
                  <th className="p-3 text-left font-medium">Estado</th>
                  <th className="p-3 text-left font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const statusInfo = STATUS_LABELS[payment.status]
                  return (
                    <tr
                      key={payment._id}
                      className={`border-t border-border hover:bg-muted/30 ${
                        payment.status === 'in_review'
                          ? 'cursor-pointer'
                          : ''
                      }`}
                      onClick={() => handleRowClick(payment)}
                    >
                      <td className="p-3">{payment.userFullName}</td>
                      <td className="p-3">{payment.planName}</td>
                      <td className="p-3">
                        {formatBillingPeriod(payment.billingPeriod)}
                      </td>
                      <td className="p-3">
                        ${payment.amountArs.toLocaleString('es-AR')}
                      </td>
                      <td className="p-3">
                        <Badge variant={statusInfo?.variant ?? 'secondary'}>
                          {statusInfo?.label ?? payment.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(payment.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPayment && (
        <PaymentReviewDialog
          open={reviewOpen}
          onOpenChange={(open) => {
            setReviewOpen(open)
            if (!open) setSelectedPayment(null)
          }}
          paymentId={selectedPayment.id}
          memberName={selectedPayment.memberName}
          planName={selectedPayment.planName}
          billingPeriod={selectedPayment.billingPeriod}
          amountArs={selectedPayment.amountArs}
        />
      )}
    </>
  )
}
