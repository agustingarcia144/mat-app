"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlatformOrgRow } from "@/components/features/platform/platform-labels";

interface ModulesDialogProps {
  organization: PlatformOrgRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Human names for the module keys the backend knows about. */
const MODULE_LABELS: Record<string, string> = {
  dashboard: "Inicio",
  members: "Miembros",
  exercises: "Ejercicios",
  planifications: "Planificaciones",
  classes: "Clases",
  payments: "Membresías y pagos",
  finance: "Finanzas",
  metrics: "Métricas",
  metrics_exercises: "Métricas de ejercicios",
  users: "Mi equipo",
  settings: "Configuración",
  check_in: "Ingreso QR y credencial Wallet",
  rewards: "Recompensas",
  member_payments: "Cobro a socios (Mercado Pago)",
};

const PLAN_DEFAULT = "plan";
const FORCED_ON = "on";
const FORCED_OFF = "off";

export default function ModulesDialog({
  organization,
  open,
  onOpenChange,
}: ModulesDialogProps) {
  const data = useQuery(
    api.appBillingPlans.listOrganizationModuleOverrides,
    open && organization
      ? { organizationId: organization.organizationId }
      : "skip",
  );
  const setOverride = useMutation(
    api.appBillingPlans.setOrganizationModuleOverride,
  );
  const [pending, setPending] = useState<string | null>(null);

  const handleChange = async (module: string, value: string) => {
    if (!organization) return;
    setPending(module);
    try {
      await setOverride({
        organizationId: organization.organizationId,
        module,
        enabled:
          value === PLAN_DEFAULT ? null : value === FORCED_ON ? true : false,
      });
      toast.success(`${MODULE_LABELS[module] ?? module} actualizado`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo actualizar",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Módulos de {organization?.name}</DialogTitle>
          <DialogDescription>
            El plan define qué ve el gimnasio. Acá se puede forzar un módulo
            para esta organización sola, sin tocar el plan ni el de los demás.
          </DialogDescription>
        </DialogHeader>

        {data === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {data.knownModules.map((module) => {
              const override = data.overrides.find(
                (item) => item.module === module,
              );
              const fromPlan = data.planModules.includes(module);
              const value = !override
                ? PLAN_DEFAULT
                : override.enabled
                  ? FORCED_ON
                  : FORCED_OFF;
              const effective = data.effectiveModules.includes(module);

              return (
                <div
                  key={module}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {MODULE_LABELS[module] ?? module}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {module}
                      {fromPlan ? " · incluido en el plan" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={effective ? "default" : "outline"}>
                      {effective ? "Activo" : "Inactivo"}
                    </Badge>
                    <Select
                      value={value}
                      disabled={pending === module}
                      onValueChange={(next) => handleChange(module, next)}
                    >
                      <SelectTrigger className="h-9 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PLAN_DEFAULT}>
                          Según el plan
                        </SelectItem>
                        <SelectItem value={FORCED_ON}>Forzar activo</SelectItem>
                        <SelectItem value={FORCED_OFF}>
                          Forzar inactivo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
