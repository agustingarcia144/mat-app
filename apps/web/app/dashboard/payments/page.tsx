"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gift, MoreVertical, Plus, UserPlus } from "lucide-react";
import PaymentReviewQueue from "@/components/features/payments/payment-review-queue";
import PlanList from "@/components/features/payments/plan-list";
import PaymentHistoryList from "@/components/features/payments/payment-history-list";
import RecordPaymentDialog from "@/components/features/payments/dialogs/record-payment-dialog";
import AssignPlanDialog from "@/components/features/payments/dialogs/assign-plan-dialog";
import BonificationDialog from "@/components/features/payments/dialogs/bonification-dialog";

export default function PagosPage() {
  const [tab, setTab] = useState<"pendientes" | "planes" | "historial">(
    "pendientes",
  );
  const [recordOpen, setRecordOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [bonificationOpen, setBonificationOpen] = useState(false);

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Pagos</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Gestiona planes de membresía y revisa comprobantes de pago
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="shrink-0 gap-2">
              Acciones
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setBonificationOpen(true)}>
              <Gift className="mr-2 h-4 w-4" />
              Bonificar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Asignar/Desasignar Plan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRecordOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar pago
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />

      <AssignPlanDialog open={assignOpen} onOpenChange={setAssignOpen} />

      <BonificationDialog
        open={bonificationOpen}
        onOpenChange={setBonificationOpen}
      />

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as "pendientes" | "planes" | "historial")
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
  );
}
