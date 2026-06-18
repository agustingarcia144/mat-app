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
import { CheckCircle2, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
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
        className="w-full gap-2"
        variant={plan === "pro" ? "default" : "outline"}
      >
        {startingPlan === plan ? "Abriendo..." : "Pagar con MercadoPago"}
        <ExternalLink className="size-4" />
      </Button>
    );
  }

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Suscripción</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Gestiona el acceso de esta organización a MAT.
        </p>
      </div>

      {billingStatus === "trial" ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
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

      <div className="grid items-center gap-3">
        <Badge variant={statusVariant(billingStatus)} className="w-fit">
          Estado: {statusLabel(billingStatus)}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan LITE</CardTitle>
            <CardDescription>
              Acceso a miembros, ejercicios y planificaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-3xl font-semibold">
                {litePlan?.priceArs
                  ? currency.format(litePlan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="text-sm text-muted-foreground">
                por mes, equivalente comercial de USD{" "}
                {litePlan?.referencePriceUsd ?? 10}
              </p>
            </div>
            <Separator />
            <div className="grid gap-3">
              {LITE_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            {planButton("lite")}
          </CardContent>
        </Card>

        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Plan PRO</CardTitle>
              <Badge>Recomendado</Badge>
            </div>
            <CardDescription>
              Acceso completo a todos los módulos de MAT.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-3xl font-semibold">
                {proPlan?.priceArs
                  ? currency.format(proPlan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="text-sm text-muted-foreground">por mes</p>
            </div>
            <Separator />
            <div className="grid gap-3">
              {PRO_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
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
