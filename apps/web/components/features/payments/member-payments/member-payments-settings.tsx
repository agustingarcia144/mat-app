"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2Off,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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

const MIN_GRACE_DAYS = 0;
const MAX_GRACE_DAYS = 30;

type MethodKey =
  | "bankTransferEnabled"
  | "mercadoPagoRecurringEnabled"
  | "mercadoPagoOneTimeEnabled";

const CONNECTION_LABELS: Record<string, { label: string; tone: string }> = {
  active: { label: "Conectada", tone: "bg-emerald-500/10 text-emerald-600" },
  pending: { label: "Pendiente", tone: "bg-amber-500/10 text-amber-600" },
  refresh_required: {
    label: "Requiere reconexión",
    tone: "bg-amber-500/10 text-amber-600",
  },
  error: { label: "Con error", tone: "bg-destructive/10 text-destructive" },
  disconnected: {
    label: "Desconectada",
    tone: "bg-muted text-muted-foreground",
  },
};

/**
 * A short, plain explanation of why a toggle cannot be turned on.
 *
 * Every disabled control says why: an admin who cannot tell the difference
 * between "not set up yet" and "broken" will contact support instead of
 * fixing it themselves.
 */
function useMercadoPagoBlocker(
  overview: ReturnType<typeof useQuery<typeof api.memberPaymentsAdmin.getOverview>>,
) {
  return useMemo(() => {
    if (!overview) return null;
    if (!overview.runtimeEnabled) {
      return "Los pagos con Mercado Pago están deshabilitados a nivel plataforma. Escribinos para activarlos.";
    }
    if (!overview.policy.mercadoPagoEnabled) {
      return "Tu plan de MAT no incluye cobros a socios con Mercado Pago.";
    }
    if (!overview.connection || overview.connection.status === "disconnected") {
      return "Conectá tu cuenta de Mercado Pago para poder cobrar a tus socios.";
    }
    if (overview.connection.status !== "active") {
      return "Tu conexión con Mercado Pago necesita atención antes de aceptar cobros nuevos.";
    }
    return null;
  }, [overview]);
}

export default function MemberPaymentsSettings({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const overview = useQuery(api.memberPaymentsAdmin.getOverview, {});
  const updateSettings = useMutation(api.organizationSettings.update);
  const disconnect = useMutation(api.memberPayments.disconnectMercadoPago);
  const beginConnection = useAction(
    api.memberPaymentsActions.beginMercadoPagoConnection,
  );
  const checkHealth = useAction(
    api.memberPaymentsActions.checkMercadoPagoConnectionHealth,
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [graceDraft, setGraceDraft] = useState<string>("");

  const blocker = useMercadoPagoBlocker(overview);
  const savedGraceDays = overview?.settings.gracePeriodDays;

  // Keep the editable field in step with the saved value without making the
  // whole settings object a dependency, which would reset the draft on any
  // unrelated change.
  useEffect(() => {
    if (savedGraceDays !== undefined) {
      setGraceDraft(String(savedGraceDays));
    }
  }, [savedGraceDays]);

  // The OAuth callback sends the admin back here with a short result code.
  useEffect(() => {
    const result = searchParams.get("mp");
    if (!result) return;

    if (result === "success") {
      toast.success("Cuenta de Mercado Pago conectada");
    } else if (result === "denied") {
      toast.info("Cancelaste la conexión con Mercado Pago");
    } else {
      toast.error(
        "No pudimos conectar la cuenta de Mercado Pago. Intentá de nuevo.",
      );
    }

    router.replace("/dashboard/settings");
  }, [router, searchParams]);

  if (overview === undefined) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (overview === null) return null;

  const { connection, settings, counts } = overview;
  const connectionState = connection?.status ?? "disconnected";
  const connectionLabel =
    CONNECTION_LABELS[connectionState] ?? CONNECTION_LABELS.disconnected!;
  const hasLiveDebits =
    counts.activeAgreements +
      counts.retryingAgreements +
      counts.pausedAgreements +
      counts.scheduledCancellations >
    0;

  const saveMethods = async (patch: Partial<Record<MethodKey, boolean>>) => {
    const next = { ...settings, ...patch };
    if (
      !next.bankTransferEnabled &&
      !next.mercadoPagoRecurringEnabled &&
      !next.mercadoPagoOneTimeEnabled
    ) {
      toast.error("Tenés que dejar al menos un método de pago habilitado");
      return;
    }
    try {
      await updateSettings({ memberPayments: next });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar los cambios",
      );
    }
  };

  const saveGraceDays = async () => {
    const parsed = Number(graceDraft);
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_GRACE_DAYS ||
      parsed > MAX_GRACE_DAYS
    ) {
      toast.error(
        `El período de gracia debe ser un número entero entre ${MIN_GRACE_DAYS} y ${MAX_GRACE_DAYS}`,
      );
      setGraceDraft(String(settings.gracePeriodDays));
      return;
    }
    if (parsed === settings.gracePeriodDays) return;

    try {
      await updateSettings({
        memberPayments: { ...settings, gracePeriodDays: parsed },
      });
      toast.success("Período de gracia actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar los cambios",
      );
      setGraceDraft(String(settings.gracePeriodDays));
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { authorizationUrl } = await beginConnection({
        returnPath: "/dashboard/settings",
      });
      window.location.href = authorizationUrl;
    } catch (error) {
      setIsConnecting(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos iniciar la conexión con Mercado Pago",
      );
    }
  };

  const handleCheckHealth = async () => {
    setIsChecking(true);
    try {
      const result = await checkHealth({});
      if (result.status === "active") {
        toast.success(
          result.sellerNickname
            ? `Conexión correcta (${result.sellerNickname})`
            : "Conexión correcta",
        );
      } else if (result.status === "none") {
        toast.info("Todavía no conectaste una cuenta de Mercado Pago");
      } else {
        toast.error(result.reason ?? "La conexión necesita atención");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos verificar la conexión",
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnect({});
      toast.success("Cuenta de Mercado Pago desconectada");
      setDisconnectOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos desconectar la cuenta",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobros a socios</CardTitle>
        <CardDescription>
          Elegí cómo pueden pagar tus socios desde la app y conectá tu cuenta de
          Mercado Pago para recibir el dinero directamente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Mercado Pago</span>
                <Badge variant="secondary" className={connectionLabel.tone}>
                  {connectionLabel.label}
                </Badge>
              </div>
              {connection && connection.status !== "disconnected" ? (
                <p className="text-sm text-muted-foreground">
                  Cobrás en la cuenta{" "}
                  <span className="font-medium text-foreground">
                    {connection.providerNickname ?? connection.providerAccountId}
                  </span>
                  {connection.providerEmail ? ` (${connection.providerEmail})` : ""}
                  . El dinero de tus socios va directo ahí.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no conectaste una cuenta. Sin conexión sólo podés
                  cobrar por transferencia.
                </p>
              )}
              {connection?.lastError ? (
                <p className="flex items-start gap-1.5 text-sm text-destructive">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  {connection.lastError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckHealth}
                disabled={!canEdit || isChecking || !connection}
              >
                {isChecking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Probar conexión
              </Button>
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={!canEdit || isConnecting || !overview.runtimeEnabled}
              >
                {isConnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                {connection && connection.status !== "disconnected"
                  ? "Reconectar"
                  : "Conectar cuenta"}
              </Button>
              {connection && connection.status !== "disconnected" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={!canEdit || hasLiveDebits}
                  title={
                    hasLiveDebits
                      ? "No podés desconectar mientras haya débitos automáticos activos"
                      : undefined
                  }
                >
                  <Link2Off className="size-4" />
                  Desconectar
                </Button>
              ) : null}
            </div>
          </div>

          {hasLiveDebits ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Hay {counts.activeAgreements + counts.retryingAgreements} débito(s)
              automático(s) en curso. Para desconectar la cuenta primero tenés que
              cancelarlos: las credenciales siguen haciendo falta para poder
              frenar esos cobros.
            </p>
          ) : null}
        </section>

        {blocker ? (
          <p className="flex items-start gap-1.5 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {blocker}
          </p>
        ) : null}

        <section className="divide-y">
          <MethodRow
            id="bankTransferEnabled"
            label="Transferencia bancaria"
            description="El socio sube un comprobante y ustedes lo aprueban."
            checked={settings.bankTransferEnabled}
            disabled={!canEdit}
            onCheckedChange={(value) =>
              saveMethods({ bankTransferEnabled: value })
            }
          />
          <MethodRow
            id="mercadoPagoRecurringEnabled"
            label="Débito automático"
            description="Mercado Pago cobra todos los meses en la fecha de alta del socio. Sólo disponible en planes que se cobran desde la fecha de alta y sin intereses por mora."
            checked={settings.mercadoPagoRecurringEnabled}
            disabled={!canEdit || blocker !== null}
            disabledReason={blocker}
            onCheckedChange={(value) =>
              saveMethods({ mercadoPagoRecurringEnabled: value })
            }
          />
          <MethodRow
            id="mercadoPagoOneTimeEnabled"
            label="Pago adelantado con Mercado Pago"
            description="El socio paga 3, 6 o 12 meses de una vez, con el descuento que configures en el plan."
            checked={settings.mercadoPagoOneTimeEnabled}
            disabled={!canEdit || blocker !== null}
            disabledReason={blocker}
            onCheckedChange={(value) =>
              saveMethods({ mercadoPagoOneTimeEnabled: value })
            }
          />
        </section>

        <section className="grid gap-2">
          <Label htmlFor="grace-period-days">Período de gracia (días)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="grace-period-days"
              type="number"
              min={MIN_GRACE_DAYS}
              max={MAX_GRACE_DAYS}
              value={graceDraft}
              onChange={(event) => setGraceDraft(event.target.value)}
              onBlur={saveGraceDays}
              disabled={!canEdit}
              className="w-24"
            />
            <p className="text-sm text-muted-foreground">
              Días que un socio conserva el acceso después de que le rebota un
              cobro. El plazo se cuenta desde el primer intento fallido: los
              reintentos de Mercado Pago no lo extienden.
            </p>
          </div>
        </section>

        {(settings.mercadoPagoRecurringEnabled ||
          settings.mercadoPagoOneTimeEnabled) && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            Si desactivás Mercado Pago, tus socios dejan de poder iniciar cobros
            nuevos, pero los débitos automáticos que ya existen siguen andando.
            Para frenarlos hay que cancelarlos uno por uno desde Pagos.
          </p>
        )}
      </CardContent>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Mercado Pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos a borrar las credenciales guardadas y a desactivar los cobros
              con Mercado Pago. Tus socios van a poder seguir pagando por
              transferencia. Para volver a cobrar con Mercado Pago vas a tener
              que conectar la cuenta de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDisconnect();
              }}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function MethodRow({
  id,
  label,
  description,
  checked,
  disabled,
  disabledReason,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  disabledReason?: string | null;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
        {disabled && disabledReason ? (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
