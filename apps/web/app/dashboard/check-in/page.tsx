"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, QrCode, RefreshCw, XCircle } from "lucide-react";

type ScanResult = {
  allowed: boolean;
  duplicate?: boolean;
  code: string;
  decisionId: string;
  checkedInAt?: number;
  pointsAwarded?: number;
  bonusPointsAwarded?: number;
  alreadyAwarded?: boolean;
  balance?: number;
  member?: { name?: string; imageUrl?: string };
  checkInId?: string;
  reservationChoices?: Array<{
    id: string;
    className: string;
    startTime?: number;
  }>;
};

const CODE_MESSAGES: Record<string, string> = {
  QR_INVALID: "El código no es válido.",
  QR_EXPIRED: "El código de la app venció. Pedile al socio que lo actualice.",
  QR_REVOKED: "La credencial fue revocada.",
  QR_REPLAYED: "Este código dinámico ya fue utilizado.",
  WRONG_ORGANIZATION: "El código pertenece a otro gimnasio.",
  MEMBERSHIP_INACTIVE: "La membresía del socio está inactiva.",
  SUBSCRIPTION_REQUIRED: "El socio no tiene un plan activo.",
  SUBSCRIPTION_SUSPENDED: "El plan del socio está suspendido.",
  SUBSCRIPTION_PENDING_PAYMENT: "El plan todavía está pendiente de pago.",
  REWARDS_DISABLED: "El control de acceso por QR no está habilitado.",
};

function playFeedback(success: boolean) {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = success ? 880 : 220;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener("ended", () => void context.close(), {
      once: true,
    });
  } catch {
    // Audio feedback is optional; visual feedback remains available.
  }
}

export default function CheckInPage() {
  const scanQr = useMutation(api.rewards.scanQr);
  const linkReservation = useMutation(api.rewards.linkReservationToCheckIn);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const focusScanner = useCallback(() => inputRef.current?.focus(), []);

  const reset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setValue("");
    setResult(null);
    setSubmitting(false);
    requestAnimationFrame(focusScanner);
  }, [focusScanner]);

  useEffect(() => {
    focusScanner();
    const onWindowFocus = () => focusScanner();
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [focusScanner]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const payload = value.trim();
    setValue("");
    if (!payload || submitting) {
      focusScanner();
      return;
    }
    setSubmitting(true);
    try {
      const response = (await scanQr({ payload })) as ScanResult;
      setResult(response);
      playFeedback(response.allowed);
      resetTimer.current = setTimeout(reset, response.allowed ? 6_000 : 4_000);
    } catch {
      const response: ScanResult = {
        allowed: false,
        code: "UNAVAILABLE",
        decisionId: "unavailable",
      };
      setResult(response);
      playFeedback(false);
      resetTimer.current = setTimeout(reset, 4_000);
    } finally {
      setSubmitting(false);
    }
  }

  const success = result?.allowed === true;
  const initials = result?.member?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function selectReservation(reservationId: string) {
    if (!result?.checkInId) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await linkReservation({
        checkInId: result.checkInId as never,
        reservationId: reservationId as never,
      });
      setResult({ ...result, reservationChoices: [] });
      resetTimer.current = setTimeout(reset, 3_000);
    } catch {
      setResult({ ...result, code: "RESERVATION_LINK_FAILED" });
      resetTimer.current = setTimeout(reset, 4_000);
    }
  }

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Ingreso por QR</h1>
        <p className="text-muted-foreground">
          Conectá el lector USB en modo teclado y escaneá el código del socio.
        </p>
      </div>

      <Card className="mx-auto w-full max-w-3xl overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <QrCode className="size-5" /> Puesto de recepción
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 md:p-10">
          {!result ? (
            <form onSubmit={submit} className="space-y-6 text-center">
              <div className="mx-auto flex size-28 items-center justify-center rounded-full bg-primary/10 text-primary">
                {submitting ? (
                  <RefreshCw className="size-12 animate-spin" />
                ) : (
                  <QrCode className="size-12" />
                )}
              </div>
              <div>
                <p className="text-xl font-semibold">
                  {submitting ? "Validando ingreso…" : "Listo para escanear"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El campo permanece enfocado para recibir el próximo código.
                </p>
              </div>
              <Input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => setTimeout(focusScanner, 50)}
                disabled={submitting}
                autoComplete="off"
                aria-label="Entrada del lector QR"
                className="mx-auto max-w-md text-center font-mono"
                placeholder="Escaneá o pegá un código para probar"
              />
              <Button type="submit" disabled={!value.trim() || submitting}>
                Validar código
              </Button>
            </form>
          ) : (
            <div
              className={`rounded-2xl border p-6 text-center ${
                success
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-destructive/30 bg-destructive/10"
              }`}
              role="status"
              aria-live="assertive"
            >
              {success ? (
                <CheckCircle2 className="mx-auto size-16 text-emerald-600" />
              ) : (
                <XCircle className="mx-auto size-16 text-destructive" />
              )}
              <h2 className="mt-4 text-3xl font-bold">
                {success ? "Ingreso autorizado" : "Ingreso denegado"}
              </h2>

              {success && result.member ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <Avatar className="size-24 border-4 border-background shadow">
                    <AvatarImage src={result.member.imageUrl} />
                    <AvatarFallback className="text-xl">
                      {initials || "SO"}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-2xl font-semibold">
                    {result.member.name || "Socio"}
                  </p>
                  {result.duplicate && (
                    <Badge variant="secondary">Ingreso ya registrado</Badge>
                  )}
                  {!!result.bonusPointsAwarded && (
                    <Badge variant="secondary">
                      Incluye +{result.bonusPointsAwarded} de bono
                    </Badge>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-left text-sm">
                    <div className="rounded-lg bg-background/70 p-3">
                      <p className="text-muted-foreground">Puntos obtenidos</p>
                      <p className="text-lg font-semibold">
                        +{result.pointsAwarded ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/70 p-3">
                      <p className="text-muted-foreground">Saldo</p>
                      <p className="text-lg font-semibold">
                        {result.balance ?? 0}
                      </p>
                    </div>
                  </div>
                  {!!result.reservationChoices?.length && (
                    <div className="mt-2 w-full max-w-md rounded-lg bg-background/80 p-3 text-left">
                      <p className="mb-2 text-sm font-medium">
                        Elegí la clase correspondiente
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {result.reservationChoices.map((reservation) => (
                          <Button
                            key={reservation.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => selectReservation(reservation.id)}
                          >
                            {reservation.className}
                            {reservation.startTime
                              ? ` · ${new Date(
                                  reservation.startTime,
                                ).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : ""}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : !success ? (
                <p className="mx-auto mt-4 max-w-lg text-lg">
                  {CODE_MESSAGES[result.code] ??
                    "No se pudo validar el acceso. Revisá la conexión e intentá nuevamente."}
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="mt-6"
                onClick={reset}
              >
                Escanear siguiente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mx-auto max-w-2xl text-center text-xs text-muted-foreground">
        El lector solo captura el código. La autorización siempre la decide MAT.
        Una futura integración con molinete deberá usar la decisión autenticada
        del backend.
      </p>
    </DashboardPageContainer>
  );
}
