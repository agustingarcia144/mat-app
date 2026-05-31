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
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const mercadoPagoCheckoutEnabled =
  process.env.NEXT_PUBLIC_MERCADOPAGO_CHECKOUT_ENABLED === "true";

function statusLabel(status: string | undefined) {
  switch (status) {
    case "active":
      return "Activa";
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
  if (status === "grace_period" || status === "pending") return "secondary";
  return "destructive";
}

export default function BillingPage() {
  const params = useSearchParams();
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const billing = useQuery(api.organizationBilling.getCurrentBilling);
  const entitlement = useQuery(api.organizationBilling.getCurrentEntitlement);
  const createCheckout = useAction(api.organizationBilling.createCheckout);
  const cancelCurrentSubscription = useAction(
    api.organizationBilling.cancelCurrentSubscription,
  );

  const plan = billing?.plan;
  const isMercadoPagoSubscription =
    billing?.subscription?.source === "mercadopago" ||
    Boolean(billing?.subscription?.mercadoPagoPreapprovalId);
  const billingStatus = entitlement?.billingStatus;
  const returnedFromMercadoPago = params.get("mp_status") === "return";
  const blocked = params.get("blocked") === "1";

  const handleStartCheckout = async () => {
    setIsStartingCheckout(true);
    try {
      const result = await createCheckout({});
      window.location.href = result.initPoint;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar MercadoPago",
      );
      setIsStartingCheckout(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCurrentSubscription({});
      toast.success("Suscripción cancelada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo cancelar",
      );
    }
  };

  return (
    <DashboardPageContainer className="space-y-4 py-4 md:space-y-6 md:py-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Suscripción</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Gestiona el acceso de esta organización a MAT.
        </p>
      </div>

      {blocked ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <CardHeader>
            <CardTitle className="text-base">Función no incluida</CardTitle>
            <CardDescription>
              El plan LITE solo incluye miembros, ejercicios y planificaciones.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {returnedFromMercadoPago && billingStatus !== "active" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pago en verificación</CardTitle>
            <CardDescription>
              MercadoPago ya redirigió a MAT. El acceso se activa cuando llega
              la notificación verificada del pago.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Plan LITE</CardTitle>
                <CardDescription>
                  USD 10 de referencia, cobrado en pesos argentinos.
                </CardDescription>
              </div>
              <Badge variant={statusVariant(billingStatus)}>
                {statusLabel(billingStatus)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-3xl font-semibold">
                {plan?.priceArs
                  ? currency.format(plan.priceArs)
                  : "ARS sin configurar"}
              </p>
              <p className="text-sm text-muted-foreground">
                por mes, equivalente comercial de USD{" "}
                {plan?.referencePriceUsd ?? 10}
              </p>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Miembros",
                "Ejercicios",
                "Planificaciones",
                "Dashboard Lite",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {billingStatus === "active" ? (
                isMercadoPagoSubscription && mercadoPagoCheckoutEnabled ? (
                  <Button variant="outline" onClick={handleCancel}>
                    Cancelar suscripción
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tu suscripción está gestionada por MAT.
                  </p>
                )
              ) : mercadoPagoCheckoutEnabled ? (
                <Button
                  onClick={handleStartCheckout}
                  disabled={isStartingCheckout}
                  className="gap-2"
                >
                  {isStartingCheckout ? "Abriendo..." : "Pagar con MercadoPago"}
                  <ExternalLink className="size-4" />
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Para activar o regularizar tu suscripción, contactá a MAT.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

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
                La redirección desde MercadoPago no habilita el acceso por sí
                sola.
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
      </div>
    </DashboardPageContainer>
  );
}
