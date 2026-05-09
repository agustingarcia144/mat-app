"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { DashboardPageContainer } from "@/components/shared/responsive/dashboard-page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isOrgAdminRole } from "@/lib/security/roles";
import { Skeleton } from "@/components/ui/skeleton";

function SettingRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function SettingsPage() {
  const membership = useQuery(
    api.organizationMemberships.getCurrentMembership,
  );
  const settings = useQuery(api.organizationSettings.get);
  const updateSettings = useMutation(api.organizationSettings.update);

  if (membership && !isOrgAdminRole(membership.role)) {
    return (
      <DashboardPageContainer>
        <p className="py-8 text-center text-muted-foreground">
          No tienes permisos para acceder a esta pagina.
        </p>
      </DashboardPageContainer>
    );
  }

  if (!settings) {
    return (
      <DashboardPageContainer className="space-y-6 py-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </DashboardPageContainer>
    );
  }

  const handleToggle = async (
    field: "planificationsEnabled" | "classesEnabled" | "financeEnabled" | "memberAutoApproval",
    value: boolean,
  ) => {
    try {
      await updateSettings({ [field]: value });
    } catch {
      toast.error("Error al guardar la configuracion");
    }
  };

  return (
    <DashboardPageContainer className="space-y-6 py-4">
      <h1 className="text-2xl font-bold tracking-tight">Configuracion</h1>

      <Card>
        <CardHeader>
          <CardTitle>Modulos</CardTitle>
          <CardDescription>
            Activa o desactiva funcionalidades para tu organizacion. Los modulos
            desactivados no seran visibles para ningun usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <SettingRow
            id="planificationsEnabled"
            label="Planificaciones"
            description="Gestionar planificaciones de entrenamiento y asignaciones"
            checked={settings.planificationsEnabled}
            onCheckedChange={(v) => handleToggle("planificationsEnabled", v)}
          />
          <SettingRow
            id="classesEnabled"
            label="Clases"
            description="Programar clases, reservas y asistencia"
            checked={settings.classesEnabled}
            onCheckedChange={(v) => handleToggle("classesEnabled", v)}
          />
          <SettingRow
            id="financeEnabled"
            label="Ingresos y egresos"
            description="Seguimiento manual de ingresos y gastos"
            checked={settings.financeEnabled}
            onCheckedChange={(v) => handleToggle("financeEnabled", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro de miembros</CardTitle>
          <CardDescription>
            Controla como se unen los nuevos miembros a tu organizacion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            id="memberAutoApproval"
            label="Aprobacion automatica"
            description="Los miembros que escaneen el codigo QR se unen inmediatamente sin aprobacion del admin"
            checked={settings.memberAutoApproval}
            onCheckedChange={(v) => handleToggle("memberAutoApproval", v)}
          />
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
