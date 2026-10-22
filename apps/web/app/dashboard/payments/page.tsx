"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Button } from "@/components/ui/button";
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
  FileSearch,
  Gift,
  Plus,
  UserPlus,
} from "lucide-react";
import PaymentReviewQueue from "@/components/features/payments/payment-review-queue";
import PlanList from "@/components/features/payments/plan-list";
import PaymentHistoryList from "@/components/features/payments/payment-history-list";
import BonificationList from "@/components/features/payments/bonification-list";
import RecordPaymentDialog from "@/components/features/payments/dialogs/record-payment-dialog";
import AssignPlanDialog from "@/components/features/payments/dialogs/assign-plan-dialog";
import BonificationDialog from "@/components/features/payments/dialogs/bonification-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

const TABS = ["pendientes", "planes", "bonificaciones", "historial"] as const;
type PaymentsTab = (typeof TABS)[number];

function formatArs(value: number) {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function StatTile({
  label,
  value,
  detail,
  active,
  onClick,
  valueClassName,
  children,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  const content = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-2xl font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </p>
      {children}
      {detail ? (
        <div className="text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </>
  );
  const className = cn(
    "flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-left",
    onClick &&
      "outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
    active && "border-foreground/30 bg-accent/40",
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={className}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default function PagosPage() {
  const canQuery = useCanQueryCurrentOrganization();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The tab lives in the URL so other pages (e.g. Finanzas) can link to one.
  const tabParam = searchParams.get("tab");
  const tab: PaymentsTab = TABS.includes(tabParam as PaymentsTab)
    ? (tabParam as PaymentsTab)
    : "pendientes";
  const setTab = (next: PaymentsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "pendientes") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  const [recordOpen, setRecordOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [bonificationOpen, setBonificationOpen] = useState(false);

  const pendingPayments = useQuery(
    api.planPayments.getPendingByOrganization,
    canQuery ? {} : "skip",
  );
  const plans = useQuery(
    api.membershipPlans.getByOrganization,
    canQuery ? { activeOnly: false } : "skip",
  );
  const bonifications = useQuery(
    api.planBonifications.getByOrganization,
    canQuery ? { status: "active" } : "skip",
  );
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const isAdmin = membership?.role === "admin";
  const metrics = useQuery(
    api.planPayments.getOrganizationMetrics,
    canQuery && isAdmin ? {} : "skip",
  );
  const overview = metrics?.overview;

  const pendingCount = pendingPayments?.length;
  const activePlansCount = plans?.filter((plan) => plan.isActive).length;
  const bonificationCount = bonifications?.length;

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Pagos
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Gestioná planes de membresía, revisá comprobantes y llevá el
            historial de pagos.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
        <Button className="gap-2" onClick={() => setRecordOpen(true)}>
          <Plus className="size-4" />
          Registrar pago
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Más acciones
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
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isAdmin ? (
          <>
            <StatTile
              label="Cobrado este mes"
              value={overview ? formatArs(overview.approvedRevenueArs) : "—"}
              detail={
                overview
                  ? `${overview.collectionRatePct}% de ${formatArs(overview.expectedRevenueArs)}`
                  : "Cargando…"
              }
            >
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${Math.min(overview?.collectionRatePct ?? 0, 100)}%`,
                  }}
                />
              </div>
            </StatTile>
            <StatTile
              label="Por cobrar"
              value={overview ? formatArs(overview.outstandingRevenueArs) : "—"}
              detail={
                overview
                  ? overview.unpaidCount > 0
                    ? `${overview.unpaidCount} ${overview.unpaidCount === 1 ? "miembro" : "miembros"} sin pagar`
                    : "Todos pagaron"
                  : "Cargando…"
              }
              onClick={() => router.push("/dashboard/members")}
            />
          </>
        ) : null}
        <StatTile
          label="Para revisar"
          value={
            <span className="inline-flex items-center gap-2">
              {pendingCount ?? "—"}
              {pendingCount ? (
                <FileSearch className="size-4 text-sky-500" aria-hidden />
              ) : null}
            </span>
          }
          valueClassName={
            pendingCount ? "text-sky-600 dark:text-sky-400" : undefined
          }
          detail={
            pendingCount ? "Comprobantes subidos por miembros" : "Nada pendiente"
          }
          active={tab === "pendientes"}
          onClick={() => setTab("pendientes")}
        />
        <StatTile
          label="Bonificados"
          value={bonificationCount ?? "—"}
          detail={
            activePlansCount !== undefined
              ? `${activePlansCount} ${activePlansCount === 1 ? "plan activo" : "planes activos"}`
              : "Con descuento activo"
          }
          active={tab === "bonificaciones"}
          onClick={() => setTab("bonificaciones")}
        />
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
          <TabsTrigger value="planes" className="gap-2">
            Planes
            {activePlansCount ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {activePlansCount}
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
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes">
          <PaymentReviewQueue />
        </TabsContent>

        <TabsContent value="planes">
          <PlanList />
        </TabsContent>

        <TabsContent value="bonificaciones">
          <BonificationList />
        </TabsContent>

        <TabsContent value="historial">
          <PaymentHistoryList />
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  );
}
