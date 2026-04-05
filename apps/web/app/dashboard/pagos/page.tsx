'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'
import PaymentReviewQueue from '@/components/features/pagos/payment-review-queue'
import PlanList from '@/components/features/pagos/plan-list'
import PaymentHistoryList from '@/components/features/pagos/payment-history-list'

export default function PagosPage() {
  const [tab, setTab] = useState<'pendientes' | 'planes' | 'historial'>(
    'pendientes'
  )

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Pagos</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Gestiona planes de membresía y revisa comprobantes de pago
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as 'pendientes' | 'planes' | 'historial')
        }
      >
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="planes">Planes</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-4">
          <PaymentReviewQueue />
        </TabsContent>

        <TabsContent value="planes" className="mt-4">
          <PlanList />
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <PaymentHistoryList />
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  )
}
