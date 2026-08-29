"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Clock,
  Gift,
  Plus,
  UserPlus,
} from "lucide-react";
import PaymentReviewQueue from "@/components/features/payments/payment-review-queue";
import PaymentHistoryList from "@/components/features/payments/payment-history-list";
import BonificationList from "@/components/features/payments/bonification-list";
import RecordPaymentDialog from "@/components/features/payments/dialogs/record-payment-dialog";
import AssignPlanDialog from "@/components/features/payments/dialogs/assign-plan-dialog";
import BonificationDialog from "@/components/features/payments/dialogs/bonification-dialog";
import MemberPaymentsPanel from "@/components/features/payments/member-payments/member-payments-panel";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

const TABS = [
  "pendientes",
  "bonificaciones",
  "debitos",
  "historial",
] as const;
type PaymentsTab = (typeof TABS)[number];

export default function PagosPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const [tab, setTab] = useState<PaymentsTab>("pendientes");
  const [recordOpen, setRecordOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [bonificationOpen, setBonificationOpen] = useState(false);

  const pendingPayments = useQuery(
    api.planPayments.getPendingByOrganization,
    canQuery ? {} : "skip",
  );
  const bonifications = useQuery(
    api.planBonifications.getByOrganization,
    canQuery ? { status: "active" } : "skip",
  );

  const pendingCount = pendingPayments?.length;
  const bonificationCount = bonifications?.length;

  const stats = [
    {
      key: "pendientes" as const,
      title: "Pendientes de revisión",
      value: pendingCount,
      detail: "Comprobantes por aprobar",
      icon: Clock,
      iconClassName: "border-amber-500/25 bg-amber-500/10 text-amber-600",
      valueClassName: pendingCount ? "text-amber-600" : "text-foreground",
    },
    {
      key: "bonificaciones" as const,
      title: "Miembros bonificados",
      value: bonificationCount,
      detail: "Con descuento activo",
      icon: Gift,
      iconClassName: "border-purple-500/25 bg-purple-500/10 text-purple-600",
      valueClassName: "text-foreground",
    },
  ];

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Pagos
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Revisá comprobantes, gestioná bonificaciones y llevá el historial
            de pagos.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="shrink-0 gap-2">
              Acciones
              <ChevronDown className="size-4 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Acciones rápidas
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[
              {
                onClick: () => setRecordOpen(true),
                icon: Plus,
                iconClassName:
                  "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
                title: "Registrar pago",
                description: "Cargá un pago en efectivo o transferencia",
              },
              {
                onClick: () => setAssignOpen(true),
                icon: UserPlus,
                iconClassName:
                  "border-blue-500/25 bg-blue-500/10 text-blue-600",
                title: "Asignar o desasignar plan",
                description: "Gestioná el plan de un miembro",
              },
              {
                onClick: () => setBonificationOpen(true),
                icon: Gift,
                iconClassName:
                  "border-purple-500/25 bg-purple-500/10 text-purple-600",
                title: "Bonificar",
                description: "Otorgá un descuento o plan gratuito",
              },
            ].map((action) => (
              <DropdownMenuItem
                key={action.title}
                onClick={action.onClick}
                className="items-start gap-3 py-2.5"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
                    action.iconClassName,
                  )}
                >
                  <action.icon className="size-4" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium leading-none">
                    {action.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((stat) => (
          <Card
            key={stat.key}
            className="border-border/70 shadow-sm transition-colors hover:border-border"
          >
            <CardContent className="p-0">
              <button
                type="button"
                onClick={() => setTab(stat.key)}
                aria-pressed={tab === stat.key}
                className={cn(
                  "flex w-full items-start justify-between gap-4 rounded-xl p-5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
                  tab === stat.key && "bg-muted/30",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-semibold tracking-tight tabular-nums",
                      stat.valueClassName,
                    )}
                  >
                    {stat.value ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.detail}</p>
                </div>
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border",
                    stat.iconClassName,
                  )}
                >
                  <stat.icon className="size-4" />
                </span>
              </button>
            </CardContent>
          </Card>
        ))}
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
        onValueChange={(v) => setTab(v as PaymentsTab)}
        className="space-y-4"
      >
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="pendientes" className="gap-2">
            Pendientes
            {pendingCount ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {pendingCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="bonificaciones" className="gap-2">
            Bonificaciones
            {bonificationCount ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {bonificationCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="debitos">Mercado Pago</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes">
          <PaymentReviewQueue />
        </TabsContent>

        <TabsContent value="bonificaciones">
          <BonificationList />
        </TabsContent>

        <TabsContent value="debitos">
          <MemberPaymentsPanel canQuery={canQuery} />
        </TabsContent>

        <TabsContent value="historial">
          <PaymentHistoryList />
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  );
}
