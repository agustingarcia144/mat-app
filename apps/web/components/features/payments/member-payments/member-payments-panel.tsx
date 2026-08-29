"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const money = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `$${value.toLocaleString("es-AR")}`;

const date = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Date(value).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

const AGREEMENT_LABELS: Record<string, { label: string; tone: string }> = {
  pending_authorization: {
    label: "Esperando autorización",
    tone: "bg-muted text-muted-foreground",
  },
  pending_first_payment: {
    label: "Esperando primer cobro",
    tone: "bg-amber-500/10 text-amber-600",
  },
  active: { label: "Activo", tone: "bg-emerald-500/10 text-emerald-600" },
  retrying: { label: "Reintentando", tone: "bg-amber-500/10 text-amber-600" },
  paused_bonification: {
    label: "Pausado por bonificación",
    tone: "bg-blue-500/10 text-blue-600",
  },
  cancellation_scheduled: {
    label: "Baja programada",
    tone: "bg-orange-500/10 text-orange-600",
  },
  cancelled: { label: "Cancelado", tone: "bg-muted text-muted-foreground" },
  failed: { label: "Con error", tone: "bg-destructive/10 text-destructive" },
};

const TRANSACTION_LABELS: Record<string, { label: string; tone: string }> = {
  approved: { label: "Aprobado", tone: "bg-emerald-500/10 text-emerald-600" },
  pending: { label: "Pendiente", tone: "bg-amber-500/10 text-amber-600" },
  rejected: { label: "Rechazado", tone: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelado", tone: "bg-muted text-muted-foreground" },
  refunded: { label: "Devuelto", tone: "bg-orange-500/10 text-orange-600" },
  charged_back: { label: "Contracargo", tone: "bg-destructive/10 text-destructive" },
  unknown: { label: "Desconocido", tone: "bg-muted text-muted-foreground" },
};

export default function MemberPaymentsPanel({ canQuery }: { canQuery: boolean }) {
  const agreements = useQuery(
    api.memberPaymentsAdmin.listAgreements,
    canQuery ? {} : "skip",
  );
  const transactions = useQuery(
    api.memberPaymentsAdmin.listTransactions,
    canQuery ? { limit: 50 } : "skip",
  );
  const operations = useQuery(
    api.memberPaymentsAdmin.listProviderOperations,
    canQuery ? {} : "skip",
  );

  const resync = useMutation(api.memberPaymentsAdmin.resyncAgreement);
  const cancelAgreement = useMutation(api.memberPaymentsAdmin.cancelAgreement);
  const retryOperation = useMutation(api.memberPayments.retryProviderOperation);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    id: Id<"memberRecurringAgreements">;
    memberName: string;
  } | null>(null);

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos completar la acción",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!canQuery) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Débitos automáticos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agreements === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : agreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía ningún socio activó el débito automático.
            </p>
          ) : (
            agreements.map((agreement) => {
              const label =
                AGREEMENT_LABELS[agreement.status] ?? AGREEMENT_LABELS.unknown!;
              return (
                <div
                  key={agreement._id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {agreement.memberName}
                      </span>
                      <Badge variant="secondary" className={label?.tone}>
                        {label?.label ?? agreement.status}
                      </Badge>
                      {agreement.familyMemberCount > 1 ? (
                        <Badge variant="outline">
                          Grupo familiar · {agreement.familyMemberCount}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {agreement.planName} · {money(agreement.amountArs)}/mes
                      {agreement.pendingAmountArs !== null
                        ? ` · pasa a ${money(agreement.pendingAmountArs)} el ${date(agreement.pendingAmountEffectiveAt)}`
                        : ""}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Próximo cobro: {date(agreement.nextChargeAt)}
                      {agreement.currentPeriodEnd
                        ? ` · cubierto hasta ${date(agreement.currentPeriodEnd)}`
                        : ""}
                    </p>

                    {agreement.status === "retrying" ? (
                      <p className="flex items-start gap-1.5 text-xs text-amber-600">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        Cobro rechazado el {date(agreement.firstFailureAt)}.
                        {agreement.graceUntil
                          ? ` Conserva el acceso hasta el ${date(agreement.graceUntil)}.`
                          : " El período de gracia ya venció."}
                      </p>
                    ) : null}

                    {agreement.accessEndsAt ? (
                      <p className="text-xs text-orange-600">
                        Baja pedida: el acceso termina el{" "}
                        {date(agreement.accessEndsAt)}.
                      </p>
                    ) : null}

                    <p className="font-mono text-[11px] text-muted-foreground">
                      {agreement.providerPreapprovalId ?? agreement.externalReference}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === agreement._id}
                      onClick={() =>
                        run(
                          agreement._id,
                          () => resync({ agreementId: agreement._id }),
                          "Sincronización pedida a Mercado Pago",
                        )
                      }
                    >
                      {busyId === agreement._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Resincronizar
                    </Button>
                    {agreement.isLive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === agreement._id}
                        onClick={() =>
                          setCancelTarget({
                            id: agreement._id,
                            memberName: agreement.memberName,
                          })
                        }
                      >
                        <Ban className="size-4" />
                        Cancelar débito
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {operations !== undefined && operations.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Operaciones pendientes con Mercado Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {operations.map((operation) => (
              <div
                key={operation._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">
                    {operation.memberName} · {operation.operation}
                    {operation.amountArs !== null
                      ? ` · ${money(operation.amountArs)}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {operation.status === "permanently_failed"
                      ? "Falló definitivamente"
                      : `En cola · ${operation.attempts} intento(s)`}
                    {operation.lastError ? ` · ${operation.lastError}` : ""}
                  </p>
                </div>
                {operation.status === "permanently_failed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === operation._id}
                    onClick={() =>
                      run(
                        operation._id,
                        () => retryOperation({ operationId: operation._id }),
                        "Operación reencolada",
                      )
                    }
                  >
                    {busyId === operation._id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Reintentar
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobros de Mercado Pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay cobros con Mercado Pago.
            </p>
          ) : (
            transactions.map((transaction) => {
              const label =
                TRANSACTION_LABELS[transaction.status] ??
                TRANSACTION_LABELS.unknown!;
              return (
                <div
                  key={transaction._id}
                  className="space-y-1 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {transaction.memberName}
                    </span>
                    <Badge variant="secondary" className={label?.tone}>
                      {label?.label ?? transaction.status}
                    </Badge>
                    <Badge variant="outline">
                      {transaction.kind === "advance"
                        ? "Pago adelantado"
                        : "Débito mensual"}
                    </Badge>
                    {transaction.billingPeriod ? (
                      <Badge variant="outline">{transaction.billingPeriod}</Badge>
                    ) : null}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Cobrado {money(transaction.grossAmountArs)} · comisión Mercado
                    Pago {money(transaction.providerFeeArs)} · comisión MAT{" "}
                    {money(transaction.platformFeeArs)} · neto para el gimnasio{" "}
                    <span className="font-medium text-foreground">
                      {money(transaction.gymNetAmountArs)}
                    </span>
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {date(transaction.providerApprovedAt ?? transaction.createdAt)}
                    {transaction.statusDetail ? ` · ${transaction.statusDetail}` : ""}
                  </p>

                  {transaction.requiresAttention ? (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {transaction.attentionReason}
                    </p>
                  ) : null}

                  <p className="font-mono text-[11px] text-muted-foreground">
                    {transaction.providerTransactionId}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cancelar el débito automático de {cancelTarget?.memberName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Mercado Pago deja de cobrarle. El socio conserva el acceso que ya
              pagó y a partir del próximo período va a tener que pagar por
              transferencia. Esto no da de baja su plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                const target = cancelTarget;
                if (!target) return;
                void run(
                  target.id,
                  () => cancelAgreement({ agreementId: target.id }),
                  "Débito automático cancelado",
                ).then(() => setCancelTarget(null));
              }}
            >
              Cancelar débito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
