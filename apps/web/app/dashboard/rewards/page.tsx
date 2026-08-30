"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Gift,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  TicketCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

type Source =
  | "qr_check_in"
  | "class_attendance"
  | "manual"
  | "membership_payment";

type RewardForm = {
  enabled: boolean;
  programName: string;
  pointsName: string;
  pointsPerAttendance: number;
  pointsPerMembershipMonth: number;
  maxRewardedAttendancesPerDay: number;
  eligibleSources: Source[];
  streaksEnabled: boolean;
  streakIntervalDays?: number;
  streakBonusPoints?: number;
  weeklyBonusEnabled: boolean;
  weeklyAttendanceTarget?: number;
  weeklyBonusPoints?: number;
  terms?: string;
  walletCard: {
    enabled: boolean;
    mode: "global" | "by_plan";
    defaultDesign: WalletDesign;
    planDesigns: Array<{ planId: string; design: WalletDesign }>;
  };
};

type WalletDesign = {
  programName: string;
  backgroundColor: string;
  backgroundStyle?: "solid" | "gradient" | "image";
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngle?: number;
  useOrganizationLogo?: boolean;
  logoStorageId?: string;
  heroImageStorageId?: string;
  apple?: {
    logoText?: string;
    foregroundColor?: string;
    labelColor?: string;
  };
  google?: { programName?: string };
};

const EMPTY_REWARD = {
  name: "",
  description: "",
  pointsCost: 100,
  fulfillmentInstructions: "",
  imageUrl: "",
  availableQuantity: "",
  perMemberLimit: "",
  enabled: true,
};

export default function RewardsAdminPage() {
  const dashboard = useQuery(api.rewards.getAdminDashboard);
  const balanceAudit = useQuery(api.rewards.auditAccountBalances);
  const updateSettings = useMutation(api.organizationSettings.update);
  const saveDefinition = useMutation(api.rewards.saveRewardDefinition);
  const updateRedemption = useMutation(api.rewards.updateRedemptionStatus);
  const adjustBalance = useMutation(api.rewards.adjustBalance);
  const rotateCredential = useMutation(api.rewards.rotateCredential);
  const voidCheckIn = useMutation(api.rewards.voidCheckIn);
  const [form, setForm] = useState<RewardForm | null>(null);
  const [reward, setReward] = useState(EMPTY_REWARD);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (dashboard && !form) setForm(dashboard.settings as RewardForm);
  }, [dashboard, form]);

  if (!dashboard || !form) {
    return (
      <DashboardPageContainer className="flex min-h-80 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </DashboardPageContainer>
    );
  }

  function toggleSource(source: Source, checked: boolean) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        eligibleSources: checked
          ? [...new Set([...current.eligibleSources, source])]
          : current.eligibleSources.filter((item) => item !== source),
      };
    });
  }

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await updateSettings({ rewards: form as never });
      toast.success("Programa de recompensas actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createReward(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await saveDefinition({
        id: editingRewardId ? (editingRewardId as never) : undefined,
        name: reward.name,
        description: reward.description || undefined,
        pointsCost: reward.pointsCost,
        fulfillmentInstructions: reward.fulfillmentInstructions || undefined,
        imageUrl: reward.imageUrl || undefined,
        availableQuantity: reward.availableQuantity
          ? Number(reward.availableQuantity)
          : undefined,
        perMemberLimit: reward.perMemberLimit
          ? Number(reward.perMemberLimit)
          : undefined,
        enabled: reward.enabled,
      });
      setReward(EMPTY_REWARD);
      setEditingRewardId(null);
      toast.success(
        editingRewardId ? "Recompensa actualizada" : "Recompensa creada",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setCreating(false);
    }
  }

  function editReward(
    definition: NonNullable<typeof dashboard>["definitions"][number],
  ) {
    setEditingRewardId(String(definition._id));
    setReward({
      name: definition.name,
      description: definition.description ?? "",
      pointsCost: definition.pointsCost,
      fulfillmentInstructions: definition.fulfillmentInstructions ?? "",
      imageUrl: definition.imageUrl ?? "",
      availableQuantity:
        definition.availableQuantity === undefined
          ? ""
          : String(definition.availableQuantity),
      perMemberLimit:
        definition.perMemberLimit === undefined
          ? ""
          : String(definition.perMemberLimit),
      enabled: definition.enabled,
    });
  }

  async function setRedemptionStatus(
    id: NonNullable<typeof dashboard>["redemptions"][number]["_id"],
    status: "ready" | "fulfilled" | "cancelled",
  ) {
    const cancellationReason =
      status === "cancelled"
        ? window.prompt("Motivo de la cancelación")?.trim()
        : undefined;
    if (status === "cancelled" && !cancellationReason) return;
    try {
      await updateRedemption({ id, status, cancellationReason });
      toast.success("Canje actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo actualizar",
      );
    }
  }

  async function adjustMember(
    account: NonNullable<typeof dashboard>["accounts"][number],
  ) {
    const rawPoints = window.prompt(
      `Puntos para ${account.memberName}. Usá un valor negativo para descontar.`,
      "10",
    );
    if (!rawPoints) return;
    const points = Number(rawPoints);
    const reason = window.prompt("Motivo obligatorio del ajuste")?.trim();
    if (!Number.isInteger(points) || points === 0 || !reason) {
      toast.error("Ingresá puntos enteros y un motivo");
      return;
    }
    try {
      await adjustBalance({ userId: account.userId, points, reason });
      toast.success("Saldo ajustado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo ajustar",
      );
    }
  }

  async function rotateMemberCredential(
    account: NonNullable<typeof dashboard>["accounts"][number],
  ) {
    if (!window.confirm(`¿Revocar el QR actual de ${account.memberName}?`))
      return;
    try {
      await rotateCredential({ userId: account.userId });
      toast.success(
        "Credencial rotada. Wallet se actualizará automáticamente.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo rotar");
    }
  }

  async function voidAttendance(
    item: NonNullable<typeof dashboard>["checkIns"][number],
  ) {
    const reason = window.prompt("Motivo de la anulación")?.trim();
    if (!reason) return;
    try {
      await voidCheckIn({ id: item._id, reason });
      toast.success("Asistencia anulada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular");
    }
  }

  const statCards: Array<[string, number, LucideIcon]> = [
    ["Socios registrados", dashboard.stats.membersEnrolled, Users],
    ["Puntos disponibles", dashboard.stats.pointsOutstanding, Gift],
    ["Puntos entregados", dashboard.stats.pointsEarned, Settings2],
    ["Puntos canjeados", dashboard.stats.pointsRedeemed, TicketCheck],
  ];

  return (
    <DashboardPageContainer className="space-y-6 py-6 md:py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Recompensas</h1>
        <p className="text-muted-foreground">
          Configurá cómo se obtienen puntos y qué beneficios puede canjear cada
          socio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{String(label)}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {String(value)}
                </p>
              </div>
              <Icon className="size-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      {balanceAudit && balanceAudit.discrepancies.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Se detectaron {balanceAudit.discrepancies.length} cuentas cuyo saldo
            no coincide con el libro mayor. No se modificó ningún dato;
            revisalas antes de hacer ajustes.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Configuración</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="members">Socios</TabsTrigger>
          <TabsTrigger value="redemptions">Canjes</TabsTrigger>
          <TabsTrigger value="attendance">Asistencias</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <form onSubmit={saveConfiguration}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Reglas del programa</CardTitle>
                    <CardDescription>
                      Los cambios se aplican a futuras asistencias y no
                      recalculan el historial.
                    </CardDescription>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                    aria-label="Habilitar recompensas"
                  />
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <Field label="Nombre del programa">
                  <Input
                    value={form.programName}
                    onChange={(event) =>
                      setForm({ ...form, programName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Nombre de los puntos">
                  <Input
                    value={form.pointsName}
                    onChange={(event) =>
                      setForm({ ...form, pointsName: event.target.value })
                    }
                  />
                </Field>
                <NumberField
                  label="Puntos por asistencia"
                  value={form.pointsPerAttendance}
                  onChange={(pointsPerAttendance) =>
                    setForm({ ...form, pointsPerAttendance })
                  }
                />
                <NumberField
                  label="Máximo de premios por día"
                  value={form.maxRewardedAttendancesPerDay}
                  onChange={(maxRewardedAttendancesPerDay) =>
                    setForm({ ...form, maxRewardedAttendancesPerDay })
                  }
                />
                <div className="space-y-2">
                  <Label>Fuentes que otorgan puntos</Label>
                  <div className="space-y-2 rounded-md border p-3">
                    {[
                      ["qr_check_in", "Ingreso por QR"],
                      ["class_attendance", "Asistencia a clase"],
                      ["manual", "Asistencia manual"],
                      ["membership_payment", "Meses de antigüedad"],
                    ].map(([source, label]) => (
                      <label
                        key={source}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.eligibleSources.includes(
                            source as Source,
                          )}
                          onCheckedChange={(checked) =>
                            toggleSource(source as Source, checked === true)
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Los ingresos duplicados se detectan por día calendario del
                    gimnasio, no en una ventana móvil de 24 horas.
                  </p>
                </div>

                {form.eligibleSources.includes("membership_payment") && (
                  <NumberField
                    label="Puntos por mes de antigüedad"
                    value={form.pointsPerMembershipMonth}
                    onChange={(pointsPerMembershipMonth) =>
                      setForm({ ...form, pointsPerMembershipMonth })
                    }
                  />
                )}

                <BonusConfiguration
                  title="Bono por racha"
                  description="Premia días consecutivos de asistencia."
                  enabled={form.streaksEnabled}
                  onEnabledChange={(streaksEnabled) =>
                    setForm({ ...form, streaksEnabled })
                  }
                >
                  <NumberField
                    label="Días consecutivos"
                    value={form.streakIntervalDays ?? 3}
                    onChange={(streakIntervalDays) =>
                      setForm({ ...form, streakIntervalDays })
                    }
                  />
                  <NumberField
                    label="Puntos extra"
                    value={form.streakBonusPoints ?? 20}
                    onChange={(streakBonusPoints) =>
                      setForm({ ...form, streakBonusPoints })
                    }
                  />
                </BonusConfiguration>

                <BonusConfiguration
                  title="Objetivo semanal"
                  description="Premia alcanzar una cantidad de días dentro de la semana."
                  enabled={form.weeklyBonusEnabled}
                  onEnabledChange={(weeklyBonusEnabled) =>
                    setForm({ ...form, weeklyBonusEnabled })
                  }
                >
                  <NumberField
                    label="Días objetivo"
                    value={form.weeklyAttendanceTarget ?? 3}
                    onChange={(weeklyAttendanceTarget) =>
                      setForm({ ...form, weeklyAttendanceTarget })
                    }
                  />
                  <NumberField
                    label="Puntos extra"
                    value={form.weeklyBonusPoints ?? 20}
                    onChange={(weeklyBonusPoints) =>
                      setForm({ ...form, weeklyBonusPoints })
                    }
                  />
                </BonusConfiguration>

                <Field
                  label="Términos para los socios"
                  className="md:col-span-2"
                >
                  <Textarea
                    value={form.terms ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, terms: event.target.value })
                    }
                    placeholder="Explicá cómo se obtienen y canjean los puntos."
                  />
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Guardar configuración
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        <TabsContent
          value="catalog"
          className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"
        >
          <Card>
            <CardHeader>
              <CardTitle>
                {editingRewardId ? "Editar recompensa" : "Nueva recompensa"}
              </CardTitle>
              <CardDescription>
                El gimnasio confirma la entrega manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={createReward} className="space-y-4">
                <Field label="Nombre">
                  <Input
                    value={reward.name}
                    onChange={(e) =>
                      setReward({ ...reward, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Descripción">
                  <Textarea
                    value={reward.description}
                    onChange={(e) =>
                      setReward({ ...reward, description: e.target.value })
                    }
                  />
                </Field>
                <NumberField
                  label="Costo en puntos"
                  value={reward.pointsCost}
                  onChange={(pointsCost) =>
                    setReward({ ...reward, pointsCost })
                  }
                />
                <Field label="Instrucciones de entrega">
                  <Input
                    value={reward.fulfillmentInstructions}
                    onChange={(e) =>
                      setReward({
                        ...reward,
                        fulfillmentInstructions: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="URL de imagen (opcional)">
                  <Input
                    type="url"
                    value={reward.imageUrl}
                    onChange={(e) =>
                      setReward({ ...reward, imageUrl: e.target.value })
                    }
                    placeholder="https://…"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Stock (opcional)">
                    <Input
                      type="number"
                      min={0}
                      value={reward.availableQuantity}
                      onChange={(e) =>
                        setReward({
                          ...reward,
                          availableQuantity: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Límite por socio">
                    <Input
                      type="number"
                      min={1}
                      value={reward.perMemberLimit}
                      onChange={(e) =>
                        setReward({ ...reward, perMemberLimit: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={creating}>
                    {creating && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    {editingRewardId ? "Guardar cambios" : "Crear recompensa"}
                  </Button>
                  {editingRewardId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingRewardId(null);
                        setReward(EMPTY_REWARD);
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Catálogo del gimnasio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.definitions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay recompensas.
                </p>
              )}
              {dashboard.definitions.map((definition) => (
                <div
                  key={definition._id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{definition.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {definition.description}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {definition.pointsCost} {form.pointsName}
                    </p>
                  </div>
                  <Badge variant={definition.enabled ? "default" : "secondary"}>
                    {definition.enabled ? "Activa" : "Oculta"}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => editReward(definition)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await saveDefinition({
                            id: definition._id,
                            name: definition.name,
                            description: definition.description,
                            pointsCost: definition.pointsCost,
                            fulfillmentInstructions:
                              definition.fulfillmentInstructions,
                            imageUrl: definition.imageUrl,
                            availableQuantity: definition.availableQuantity,
                            perMemberLimit: definition.perMemberLimit,
                            enabled: !definition.enabled,
                          });
                          toast.success(
                            definition.enabled
                              ? "Recompensa oculta"
                              : "Recompensa publicada",
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "No se pudo actualizar",
                          );
                        }
                      }}
                    >
                      {definition.enabled ? "Ocultar" : "Publicar"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas de socios</CardTitle>
              <CardDescription>
                Los ajustes y rotaciones quedan auditados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.accounts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Las cuentas se crean cuando un socio obtiene o canjea puntos.
                </p>
              )}
              {dashboard.accounts.map((account) => (
                <div
                  key={account._id}
                  className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{account.memberName}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.balance} {form.pointsName} ·{" "}
                      {account.lifetimeEarned} obtenidos
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => adjustMember(account)}
                    >
                      Ajustar saldo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rotateMemberCredential(account)}
                    >
                      <RefreshCw className="mr-1 size-3.5" /> Rotar QR
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redemptions">
          <Card>
            <CardHeader>
              <CardTitle>Solicitudes de canje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.redemptions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay canjes todavía.
                </p>
              )}
              {dashboard.redemptions.map((item) => (
                <div
                  key={item._id}
                  className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {item.memberName} · {item.rewardName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.pointsCost} {form.pointsName} ·{" "}
                      {new Date(item.createdAt).toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{item.status}</Badge>
                    {item.status === "requested" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRedemptionStatus(item._id, "ready")}
                      >
                        Marcar listo
                      </Button>
                    )}
                    {(item.status === "requested" ||
                      item.status === "ready") && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            setRedemptionStatus(item._id, "fulfilled")
                          }
                        >
                          Entregado
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setRedemptionStatus(item._id, "cancelled")
                          }
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Últimos ingresos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.checkIns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay ingresos por QR.
                </p>
              )}
              {dashboard.checkIns.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{item.memberName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.checkedInAt).toLocaleString("es-AR")} ·{" "}
                      {item.source}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        item.status === "allowed"
                          ? "default"
                          : item.status === "denied"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {item.status}
                    </Badge>
                    {item.pointsAwarded > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        +{item.pointsAwarded} puntos
                      </p>
                    )}
                    {item.status === "allowed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-7 text-xs"
                        onClick={() => voidAttendance(item)}
                      >
                        Anular
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardPageContainer>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function BonusConfiguration({
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && <div className="grid grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}
