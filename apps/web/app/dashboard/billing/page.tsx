"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const mercadoPagoCheckoutEnabled =
  process.env.NEXT_PUBLIC_MERCADOPAGO_CHECKOUT_ENABLED === "true";

type PlanKey = "lite" | "pro" | "ultra";

const LITE_FEATURES = ["Miembros", "Ejercicios", "Planificaciones", "Dashboard Lite"];
const PRO_FEATURES = [
  "Todo lo de LITE",
  "Clases y reservas",
  "Pagos y finanzas",
  "Métricas y usuarios",
];
const ULTRA_FEATURES = [
  "Todo lo de PRO",
  "Sin comisión MAT en los cobros a miembros",
  "Recompensas e ingreso QR",
  "Mati AI con 100 consultas por mes",
];

// The first entry of each list is "everything the plan below has", so it is not
// something a downgrade loses on its own.
const PLAN_FEATURES: Record<PlanKey, string[]> = {
  lite: LITE_FEATURES,
  pro: PRO_FEATURES,
  ultra: ULTRA_FEATURES,
};
const PLAN_NAMES: Record<PlanKey, string> = {
  lite: "LITE",
  pro: "PRO",
  ultra: "ULTRA",
};
const PLAN_RANK: Record<PlanKey, number> = { lite: 0, pro: 1, ultra: 2 };

function isPlanKey(value: string | null | undefined): value is PlanKey {
  return value === "lite" || value === "pro" || value === "ultra";
}

/**
 * The features an organization gives up moving from `from` to `to`: every tier
 * above the target, minus each list's leading "todo lo de X" line.
 */
function featuresLostByDowngrade(from: PlanKey, to: PlanKey) {
  if (PLAN_RANK[to] >= PLAN_RANK[from]) return [];
  return (Object.keys(PLAN_RANK) as PlanKey[])
    .filter((plan) => PLAN_RANK[plan] > PLAN_RANK[to] && PLAN_RANK[plan] <= PLAN_RANK[from])
    .flatMap((plan) => PLAN_FEATURES[plan].slice(1));
}

const accentButtonClassName =
  "w-full gap-2 border-transparent bg-[#FF5C24] text-white shadow-[0_12px_34px_-12px_rgba(255,92,36,0.7)] transition-colors hover:bg-[#F04E0E] hover:text-white";

function statusLabel(status: string | undefined) {
  switch (status) {
    case "active":
      return "Activa";
    case "trial":
      return "Prueba Pro";
    case "grace_period":
      return "Periodo de gracia";
    case "pending":
      return "Pendiente";
    default:
      return "Inactiva";
  }
}

function statusVariant(status: string | undefined) {
  if (status === "active") return "default";
  if (status === "trial") return "default";
  if (status === "grace_period" || status === "pending") return "secondary";
  return "destructive";
}

function daysLeft(trialEndsAt: number | undefined) {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function BillingPage() {
  const params = useSearchParams();
  const [startingPlan, setStartingPlan] = useState<PlanKey | null>(null);
  const [planPendingChange, setPlanPendingChange] = useState<PlanKey | null>(
    null,
  );
  const billing = useQuery(api.organizationBilling.getCurrentBilling);
  const entitlement = useQuery(api.organizationBilling.getCurrentEntitlement);
  const litePlan = useQuery(api.appBillingPlans.getLite);
  const proPlan = useQuery(api.appBillingPlans.getPro);
  const ultraPlan = useQuery(api.appBillingPlans.getUltra);
  const createCheckout = useAction(api.organizationBilling.createCheckout);
  const cancelCurrentSubscription = useAction(
    api.organizationBilling.cancelCurrentSubscription,
  );
  const resyncCurrentSubscription = useAction(
    api.organizationBilling.resyncCurrentSubscription,
  );
  const [isResyncing, setIsResyncing] = useState(false);

  const isMercadoPagoSubscription =
    billing?.subscription?.source === "mercadopago" ||
    Boolean(billing?.subscription?.mercadoPagoPreapprovalId);
  const billingStatus = entitlement?.billingStatus;
  const planKey = entitlement?.planKey;
  const returnedFromMercadoPago = params.get("mp_status") === "return";
  const blocked = params.get("blocked") === "1";
  const trialDays = daysLeft(entitlement?.trialEndsAt);

  const handleStartCheckout = async (plan: PlanKey) => {
    setPlanPendingChange(null);
    setStartingPlan(plan);
    try {
      const result = await createCheckout({ planKey: plan });
      window.location.assign(result.initPoint);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo iniciar MercadoPago",
      );
      setStartingPlan(null);
    }
  };

  const handleResync = async () => {
    setIsResyncing(true);
    try {
      const result = await resyncCurrentSubscription({});
      if (result.synced) {
        toast.success("Pago verificado. Actualizamos tu suscripción.");
      } else {
        toast.info("Todavía no hay un pago aprobado en MercadoPago.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo verificar el pago",
      );
    } finally {
      setIsResyncing(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCurrentSubscription({});
      toast.success("Suscripción cancelada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cancelar");
    }
  };

  const isActivePaid = billingStatus === "active";

  function planButton(plan: PlanKey) {
    if (isActivePaid && planKey === plan) {
      return isMercadoPagoSubscription && mercadoPagoCheckoutEnabled ? (
        <Button variant="outline" onClick={handleCancel} className="w-full">
          Cancelar suscripción
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tu suscripción está gestionada por MAT.
        </p>
      );
    }
    // Falling through here means the org is on a *different* plan than this
    // card. A legacy/manual org may still start a self-serve MercadoPago
    // checkout: prepareCheckoutInternal only blocks orgs that already have an
    // active MercadoPago subscription, and it keeps entitlementStatus active
    // until the webhook authorizes the payment.
    if (!mercadoPagoCheckoutEnabled) {
      return (
        <p className="text-sm text-muted-foreground">
          Para activar tu suscripción, contactá a MAT.
        </p>
      );
    }
    // Switching an already-active org to another plan applies immediately,
    // before MercadoPago collects anything, so confirm it first.
    const needsConfirmation = isActivePaid && planKey !== plan;
    return (
      <Button
        onClick={() =>
          needsConfirmation
            ? setPlanPendingChange(plan)
            : handleStartCheckout(plan)
        }
        disabled={startingPlan !== null}
        className={plan === "ultra" ? accentButtonClassName : "w-full gap-2"}
        variant={plan === "ultra" ? "default" : "outline"}
      >
        {startingPlan === plan ? "Abriendo..." : "Pagar con MercadoPago"}
        <ArrowRight className="size-4" />
      </Button>
    );
  }

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Suscripción</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Gestiona el acceso de esta organización a MAT.
          </p>
        </div>
        <Badge variant={statusVariant(billingStatus)} className="mt-1">
          Estado: {statusLabel(billingStatus)}
        </Badge>
      </div>

      {billingStatus === "trial" ? (
        <Card className="overflow-hidden border-[#FF5C24]/40 bg-[linear-gradient(180deg,rgba(255,92,36,0.10),transparent)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-[#FF5C24]" />
              Prueba Pro activa
            </CardTitle>
            <CardDescription>
              {trialDays > 0
                ? `Te ${trialDays === 1 ? "queda" : "quedan"} ${trialDays} ${
                    trialDays === 1 ? "día" : "días"
                  } de tu prueba Pro. Elegí un plan para no perder acceso.`
                : "Tu prueba Pro termina hoy. Elegí un plan para no perder acceso."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {blocked ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <CardHeader>
            <CardTitle className="text-base">Función no incluida</CardTitle>
            <CardDescription>
              {planKey === "pro"
                ? "Las recompensas y el ingreso QR son parte del plan ULTRA. Actualizá para habilitarlos."
                : "El plan LITE solo incluye miembros, ejercicios y planificaciones. Actualizá para acceder a esta función."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {returnedFromMercadoPago && billingStatus !== "active" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pago en verificación</CardTitle>
            <CardDescription>
              MercadoPago ya redirigió a MAT. El acceso se activa cuando llega la
              notificación verificada del pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleResync}
              disabled={isResyncing}
            >
              {isResyncing ? "Verificando..." : "Volver a verificar el pago"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        {/* LITE */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Plan LITE</CardTitle>
              <Badge variant="secondary">Lo esencial</Badge>
            </div>
            <CardDescription>
              Acceso a miembros, ejercicios y planificaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            <div>
              <p className="text-4xl font-semibold tracking-tight">
                {litePlan?.priceArs
                  ? currency.format(litePlan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                por mes
              </p>
            </div>
            <Separator />
            <div className="grid flex-1 gap-3">
              {LITE_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {planButton("lite")}
          </CardContent>
        </Card>

        {/* PRO */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Plan PRO</CardTitle>
              <Badge variant="secondary">Gestión completa</Badge>
            </div>
            <CardDescription>
              Clases, pagos, finanzas, métricas y usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            <div>
              <p className="text-4xl font-semibold tracking-tight">
                {proPlan?.priceArs
                  ? currency.format(proPlan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">por mes</p>
            </div>
            <Separator />
            <div className="grid flex-1 gap-3">
              {PRO_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {planButton("pro")}
          </CardContent>
        </Card>

        {/* ULTRA (featured) */}
        <Card className="relative flex flex-col overflow-hidden border-[#FF5C24]/40 bg-[linear-gradient(180deg,rgba(255,92,36,0.08),transparent_55%)] shadow-[0_30px_80px_-50px_rgba(255,92,36,0.7)]">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#FF5C24]/20 blur-3xl" />
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Plan ULTRA</CardTitle>
              <Badge className="border-transparent bg-[#FF5C24] text-white hover:bg-[#FF5C24]">
                Recomendado
              </Badge>
            </div>
            <CardDescription>
              Todo lo de PRO, sin comisión en los cobros a miembros.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            <div>
              <p className="text-4xl font-semibold tracking-tight">
                {ultraPlan?.priceArs
                  ? currency.format(ultraPlan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">por mes</p>
            </div>
            <Separator className="bg-[#FF5C24]/20" />
            <div className="grid flex-1 gap-3">
              {ULTRA_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <Check className="size-4 shrink-0 text-[#FF5C24]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {planButton("ultra")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Verificación de acceso
          </CardTitle>
          <CardDescription>
            MAT activa el plan con pagos verificados o habilitación interna.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Estado actual: {statusLabel(billingStatus)}.</p>
          {mercadoPagoCheckoutEnabled || isMercadoPagoSubscription ? (
            <p>
              La redirección desde MercadoPago no habilita el acceso por sí sola.
            </p>
          ) : (
            <p>La suscripción se administra internamente por MAT.</p>
          )}
          {entitlement?.graceUntil ? (
            <p>
              Gracia hasta:{" "}
              {new Intl.DateTimeFormat("es-AR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(entitlement.graceUntil)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={planPendingChange !== null}
        onOpenChange={(open) => {
          if (!open) setPlanPendingChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              {planPendingChange
                ? `Cambiar a ${PLAN_NAMES[planPendingChange]}`
                : "Cambiar de plan"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  El cambio de plan se aplica ahora, antes de que MercadoPago
                  cobre. Si no completás el pago, la organización queda igual en{" "}
                  {planPendingChange ? PLAN_NAMES[planPendingChange] : "su plan"}.
                </p>
                {planPendingChange && isPlanKey(planKey)
                  ? (() => {
                      const lost = featuresLostByDowngrade(
                        planKey,
                        planPendingChange,
                      );
                      if (lost.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                          <p className="font-medium">
                            Vas a perder el acceso a:
                          </p>
                          <ul className="mt-1 list-disc pl-5">
                            {lost.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                          {planKey === "ultra" ? (
                            <p className="mt-2">
                              Los datos de recompensas se conservan, pero el
                              programa deja de sumar puntos.
                            </p>
                          ) : null}
                        </div>
                      );
                    })()
                  : null}
                <p>
                  Tu acceso sigue activo mientras MercadoPago procesa el primer
                  pago. Para volver al plan anterior, contactá a MAT.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (planPendingChange) handleStartCheckout(planPendingChange);
              }}
            >
              Continuar a MercadoPago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageContainer>
  );
}
