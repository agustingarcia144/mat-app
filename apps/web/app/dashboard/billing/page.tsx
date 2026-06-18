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
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const mercadoPagoCheckoutEnabled =
  process.env.NEXT_PUBLIC_MERCADOPAGO_CHECKOUT_ENABLED === "true";

const LITE_FEATURES = ["Miembros", "Ejercicios", "Planificaciones", "Dashboard Lite"];
const PRO_FEATURES = [
  "Todo lo de LITE",
  "Clases y reservas",
  "Pagos y finanzas",
  "Métricas y usuarios",
];

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
  const [startingPlan, setStartingPlan] = useState<"lite" | "pro" | null>(null);
  const billing = useQuery(api.organizationBilling.getCurrentBilling);
  const entitlement = useQuery(api.organizationBilling.getCurrentEntitlement);
  const litePlan = useQuery(api.appBillingPlans.getLite);
  const proPlan = useQuery(api.appBillingPlans.getPro);
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

  const handleStartCheckout = async (plan: "lite" | "pro") => {
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

  function planButton(plan: "lite" | "pro") {
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
    if (isActivePaid && !isMercadoPagoSubscription) {
      return (
        <p className="text-sm text-muted-foreground">
          Para cambiar de plan, contactá a MAT.
        </p>
      );
    }
    if (!mercadoPagoCheckoutEnabled) {
      return (
        <p className="text-sm text-muted-foreground">
          Para activar tu suscripción, contactá a MAT.
        </p>
      );
    }
    return (
      <Button
        onClick={() => handleStartCheckout(plan)}
        disabled={startingPlan !== null}
        className={plan === "pro" ? accentButtonClassName : "w-full gap-2"}
        variant={plan === "pro" ? "default" : "outline"}
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
              El plan LITE solo incluye miembros, ejercicios y planificaciones.
              Actualizá a PRO para acceder a todos los módulos.
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

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
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

        {/* PRO (featured) */}
        <Card className="relative flex flex-col overflow-hidden border-[#FF5C24]/40 bg-[linear-gradient(180deg,rgba(255,92,36,0.08),transparent_55%)] shadow-[0_30px_80px_-50px_rgba(255,92,36,0.7)]">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#FF5C24]/20 blur-3xl" />
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Plan PRO</CardTitle>
              <Badge className="border-transparent bg-[#FF5C24] text-white hover:bg-[#FF5C24]">
                Recomendado
              </Badge>
            </div>
            <CardDescription>
              Acceso completo a todos los módulos de MAT.
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
            <Separator className="bg-[#FF5C24]/20" />
            <div className="grid flex-1 gap-3">
              {PRO_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <Check className="size-4 shrink-0 text-[#FF5C24]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {planButton("pro")}
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
    </DashboardPageContainer>
  );
}
