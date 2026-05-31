"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isOrgAdminRole } from "@/lib/security/roles";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

type FormState = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

const EMPTY_STATE: FormState = {
  name: "",
  address: "",
  phone: "",
  email: "",
};

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
  const router = useRouter();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const membership = useQuery(api.organizationMemberships.getCurrentMembership);
  const settings = useQuery(api.organizationSettings.get);
  const updateSettings = useMutation(api.organizationSettings.update);
  const currentOrganization = useQuery(api.organizations.getCurrentOrganization);
  const updateOrganization = useMutation(api.organizations.updateCurrentOrganization);
  const generateLogoUploadUrl = useMutation(api.organizations.generateOrganizationLogoUploadUrl);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_STATE);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const orgInitializedRef = useRef(false);

  const canEdit = useMemo(
    () => isOrgAdminRole(currentOrganization?.role),
    [currentOrganization?.role],
  );

  useEffect(() => {
    if (!currentOrganization || orgInitializedRef.current) return;
    orgInitializedRef.current = true;
    const data = {
      name: currentOrganization.name ?? "",
      address: currentOrganization.address ?? "",
      phone: currentOrganization.phone ?? "",
      email: currentOrganization.email ?? "",
    };
    setForm(data);
    setInitialForm(data);
  }, [currentOrganization]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    if (currentOrganization === null) {
      router.replace("/access-denied");
    }
  }, [currentOrganization, isAuthenticated, isAuthLoading, router]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoFile(selectedFile);
    setLogoPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      toast.error("Solo administradores pueden editar la organización");
      return;
    }

    setIsSubmitting(true);
    try {
      const hasFormChanges =
        form.name !== initialForm.name ||
        form.address !== initialForm.address ||
        form.phone !== initialForm.phone ||
        form.email !== initialForm.email ||
        logoFile !== null;

      if (!hasFormChanges) {
        toast.info("No hay cambios para guardar");
        return;
      }

      let uploadedLogoStorageId: string | undefined;
      if (logoFile) {
        const uploadUrl = await generateLogoUploadUrl({});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": logoFile.type || "application/octet-stream",
          },
          body: logoFile,
        });
        if (!uploadResponse.ok) {
          throw new Error("No se pudo subir el logo");
        }

        const uploadResult = (await uploadResponse.json()) as {
          storageId?: string;
        };
        if (!uploadResult.storageId) {
          throw new Error("La subida no devolvio un storageId valido");
        }
        uploadedLogoStorageId = uploadResult.storageId;
      }

      await updateOrganization({
        name: form.name,
        metadata: {
          address: form.address,
          phone: form.phone,
          email: form.email,
          ...(uploadedLogoStorageId
            ? { logoStorageId: uploadedLogoStorageId as never }
            : {}),
        },
      });
      router.refresh();
      setInitialForm(form);
      setLogoFile(null);
      toast.success("Organización actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (membership && !isOrgAdminRole(membership.role)) {
    return (
      <DashboardPageContainer>
        <p className="py-8 text-center text-muted-foreground">
          No tienes permisos para acceder a esta pagina.
        </p>
      </DashboardPageContainer>
    );
  }

  if (!settings || currentOrganization === undefined) {
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
          <CardTitle>Información de la organización</CardTitle>
          <CardDescription>
            Modifica la información de la organización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="organization-name">Nombre</Label>
              <Input
                id="organization-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={!canEdit || isSubmitting}
                maxLength={80}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="organization-logo">Logo</Label>
              {(logoPreviewUrl || currentOrganization?.logoUrl) && (
                <div className="h-16 w-16 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreviewUrl ?? currentOrganization?.logoUrl ?? ""}
                    alt="Logo de la organizacion"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <Input
                id="organization-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleLogoFileChange}
                disabled={!canEdit || isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Sube una nueva imagen para reemplazar el logo actual.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="organization-address">Dirección</Label>
              <Input
                id="organization-address"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                disabled={!canEdit || isSubmitting}
                maxLength={200}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="organization-phone">Teléfono</Label>
                <Input
                  id="organization-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  disabled={!canEdit || isSubmitting}
                  maxLength={30}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="organization-email">Email</Label>
                <Input
                  id="organization-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  disabled={!canEdit || isSubmitting}
                  maxLength={120}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!canEdit || isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
