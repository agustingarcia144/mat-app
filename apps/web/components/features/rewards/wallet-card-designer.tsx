"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Smartphone, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

type WalletDesign = {
  programName: string;
  showCardName?: boolean;
  backgroundColor: string;
  backgroundStyle?: "solid" | "gradient" | "image";
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngle?: number;
  showPoints?: boolean;
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

type WalletSettings = {
  mode: "global" | "by_plan";
  defaultDesign: WalletDesign;
  planDesigns: Array<{ planId: string; design: WalletDesign }>;
};

type RewardSettings = Record<string, unknown> & {
  walletCard: WalletSettings;
  pointsName: string;
};

type AssetUrls = { logoUrl: string | null; heroImageUrl: string | null };

export function WalletCardDesigner({
  organizationName,
  organizationLogoUrl,
  rewardSettings,
  plans,
  initialAssets,
  onSaved,
}: {
  organizationName: string;
  organizationLogoUrl: string | null;
  rewardSettings: RewardSettings;
  plans: Array<{ _id: string; name: string; isActive: boolean }>;
  initialAssets: {
    default: AssetUrls;
    plans: Array<{ planId: string } & AssetUrls>;
  };
  onSaved: (wallet: WalletSettings) => void;
}) {
  const updateSettings = useMutation(api.organizationSettings.update);
  const generateUploadUrl = useMutation(
    api.rewards.generateWalletAssetUploadUrl,
  );
  const [wallet, setWallet] = useState<WalletSettings>(
    rewardSettings.walletCard,
  );
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?._id ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [localAssets, setLocalAssets] = useState<Record<string, AssetUrls>>({});
  const [applePreviewStyle, setApplePreviewStyle] = useState<
    "poster" | "generic"
  >("poster");

  useEffect(
    () => setWallet(rewardSettings.walletCard),
    [rewardSettings.walletCard],
  );

  const selectionKey = wallet.mode === "global" ? "global" : selectedPlanId;
  const override = wallet.planDesigns.find(
    (item) => item.planId === selectedPlanId,
  );
  const design =
    wallet.mode === "global"
      ? wallet.defaultDesign
      : (override?.design ?? wallet.defaultDesign);
  const isFallback = wallet.mode === "by_plan" && !override;

  const persistedAssets = useMemo(() => {
    if (selectionKey === "global") return initialAssets.default;
    return (
      initialAssets.plans.find((item) => item.planId === selectionKey) ??
      initialAssets.default
    );
  }, [initialAssets, selectionKey]);
  const assets = localAssets[selectionKey] ?? persistedAssets;
  const effectiveAssets = {
    ...assets,
    logoUrl:
      (design.useOrganizationLogo ?? true) && organizationLogoUrl
        ? organizationLogoUrl
        : assets.logoUrl,
  };

  function updateDesign(patch: Partial<WalletDesign>) {
    setWallet((current) => patchSelectedDesign(current, selectedPlanId, patch));
  }

  function removePlanOverride() {
    setWallet((current) => ({
      ...current,
      planDesigns: current.planDesigns.filter(
        (item) => item.planId !== selectedPlanId,
      ),
    }));
    setLocalAssets((current) => {
      const next = { ...current };
      delete next[selectedPlanId];
      return next;
    });
  }

  async function uploadBlob(blob: Blob): Promise<string> {
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/png" },
      body: blob,
    });
    if (!response.ok) throw new Error("No se pudo subir la imagen");
    const result = (await response.json()) as { storageId?: string };
    if (!result.storageId) throw new Error("La subida no devolvió un archivo");
    return result.storageId;
  }

  async function uploadAsset(kind: "logo" | "hero", file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Usá una imagen PNG o JPG");
      return;
    }
    if (file.size > 5_000_000) {
      toast.error("La imagen no puede superar 5 MB");
      return;
    }
    setUploading(kind);
    try {
      const storageId = await uploadBlob(file);
      const previewUrl = URL.createObjectURL(file);
      updateDesign(
        kind === "logo"
          ? { logoStorageId: storageId, useOrganizationLogo: false }
          : { heroImageStorageId: storageId, backgroundStyle: "image" },
      );
      setLocalAssets((current) => ({
        ...current,
        [selectionKey]: {
          ...(current[selectionKey] ?? persistedAssets),
          ...(kind === "logo"
            ? { logoUrl: previewUrl }
            : { heroImageUrl: previewUrl }),
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      let walletToSave = wallet;
      if (design.backgroundStyle === "gradient") {
        const gradientBlob = await createGradientPng(design);
        const storageId = await uploadBlob(gradientBlob);
        walletToSave = patchSelectedDesign(wallet, selectedPlanId, {
          heroImageStorageId: storageId,
        });
        setWallet(walletToSave);
        setLocalAssets((current) => ({
          ...current,
          [selectionKey]: {
            ...(current[selectionKey] ?? persistedAssets),
            heroImageUrl: URL.createObjectURL(gradientBlob),
          },
        }));
      }
      await updateSettings({
        rewards: { ...rewardSettings, walletCard: walletToSave } as never,
      });
      onSaved(walletToSave);
      toast.success("Diseño de Wallet actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(620px,1.4fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Diseño de la membresía</CardTitle>
          <CardDescription>
            El diseño global siempre funciona como respaldo para planes sin
            personalización.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="wallet-by-plan">Diseños por plan</Label>
              <p className="text-xs text-muted-foreground">
                Permite que cada plan tenga una tarjeta diferente.
              </p>
            </div>
            <Switch
              id="wallet-by-plan"
              checked={wallet.mode === "by_plan"}
              onCheckedChange={(checked) =>
                setWallet((current) => ({
                  ...current,
                  mode: checked ? "by_plan" : "global",
                }))
              }
            />
          </div>

          {wallet.mode === "by_plan" && (
            <div className="space-y-2">
              <Label>Plan a personalizar</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name}
                      {plan.isActive ? "" : " (inactivo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFallback && (
                <p className="text-xs text-muted-foreground">
                  Este plan está usando el diseño global. Al editarlo se creará
                  su personalización.
                </p>
              )}
              {!isFallback && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removePlanOverride}
                >
                  Volver a usar el diseño global
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wallet-program-name">Nombre de la tarjeta</Label>
            <Input
              id="wallet-program-name"
              maxLength={40}
              value={design.programName}
              onChange={(event) =>
                updateDesign({ programName: event.target.value })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="wallet-show-card-name">Mostrar nombre</Label>
              <p className="text-xs text-muted-foreground">
                Muestra el nombre personalizado de la tarjeta en Wallet.
              </p>
            </div>
            <Switch
              id="wallet-show-card-name"
              checked={design.showCardName ?? true}
              onCheckedChange={(showCardName) =>
                updateDesign({ showCardName })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="wallet-show-points">Mostrar puntos</Label>
              <p className="text-xs text-muted-foreground">
                Muestra el saldo de puntos en Apple Wallet y Google Wallet.
              </p>
            </div>
            <Switch
              id="wallet-show-points"
              checked={design.showPoints ?? true}
              onCheckedChange={(showPoints) => updateDesign({ showPoints })}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de fondo</Label>
            <Select
              value={design.backgroundStyle ?? "solid"}
              onValueChange={(value) =>
                updateDesign({
                  backgroundStyle: value as "solid" | "gradient" | "image",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Color sólido</SelectItem>
                <SelectItem value="gradient">Degradado</SelectItem>
                <SelectItem value="image">Imagen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ColorField
            label="Color base"
            value={design.backgroundColor}
            onChange={(backgroundColor) => updateDesign({ backgroundColor })}
          />

          {design.backgroundStyle === "gradient" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Inicio"
                  value={design.gradientStartColor ?? design.backgroundColor}
                  onChange={(gradientStartColor) =>
                    updateDesign({
                      gradientStartColor,
                      backgroundColor: gradientStartColor,
                    })
                  }
                />
                <ColorField
                  label="Final"
                  value={design.gradientEndColor ?? "#216ACF"}
                  onChange={(gradientEndColor) =>
                    updateDesign({ gradientEndColor })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Ángulo: {design.gradientAngle ?? 135}°</Label>
                <Input
                  type="range"
                  min={0}
                  max={360}
                  value={design.gradientAngle ?? 135}
                  onChange={(event) =>
                    updateDesign({ gradientAngle: Number(event.target.value) })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se genera una imagen de fondo y se usa en las zonas visuales
                nativas de cada Wallet.
              </p>
            </div>
          )}

          {design.backgroundStyle === "image" && (
            <AssetInput
              label="Imagen de fondo"
              help="PNG o JPG. Apple la usa como arte completo del pase Poster Generic y Google como imagen principal."
              previewUrl={assets.heroImageUrl}
              loading={uploading === "hero"}
              onChange={(file) => uploadAsset("hero", file)}
            />
          )}

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="wallet-gym-logo">Usar logo del gimnasio</Label>
                <p className="text-xs text-muted-foreground">
                  Reutiliza el logo configurado en Ajustes.
                </p>
              </div>
              <Switch
                id="wallet-gym-logo"
                checked={
                  (design.useOrganizationLogo ?? true) &&
                  Boolean(organizationLogoUrl)
                }
                disabled={!organizationLogoUrl}
                onCheckedChange={(useOrganizationLogo) =>
                  updateDesign({ useOrganizationLogo })
                }
              />
            </div>
            {(design.useOrganizationLogo ?? true) && organizationLogoUrl ? (
              <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">
                <img
                  src={organizationLogoUrl}
                  alt=""
                  className="size-12 rounded-md object-contain"
                />
                <p className="text-sm">Logo actual de {organizationName}</p>
              </div>
            ) : (
              <AssetInput
                label="Logo personalizado"
                help="PNG transparente recomendado; también se admite JPG."
                previewUrl={assets.logoUrl}
                loading={uploading === "logo"}
                onChange={(file) => uploadAsset("logo", file)}
              />
            )}
            {!organizationLogoUrl && (
              <p className="text-xs text-amber-600">
                El gimnasio todavía no tiene un logo configurado.
              </p>
            )}
          </div>

          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Opciones avanzadas por plataforma
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Texto del logo en Apple Wallet</Label>
                <Input
                  maxLength={40}
                  placeholder={organizationName}
                  value={design.apple?.logoText ?? ""}
                  onChange={(event) =>
                    updateDesign({
                      apple: { ...design.apple, logoText: event.target.value },
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Texto Apple"
                  value={design.apple?.foregroundColor ?? "#FFFFFF"}
                  onChange={(foregroundColor) =>
                    updateDesign({
                      apple: { ...design.apple, foregroundColor },
                    })
                  }
                />
                <ColorField
                  label="Etiquetas Apple"
                  value={design.apple?.labelColor ?? "#BEC8DC"}
                  onChange={(labelColor) =>
                    updateDesign({ apple: { ...design.apple, labelColor } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre en Google Wallet</Label>
                <Input
                  maxLength={40}
                  placeholder={design.programName}
                  value={design.google?.programName ?? ""}
                  onChange={(event) =>
                    updateDesign({
                      google: { programName: event.target.value },
                    })
                  }
                />
              </div>
            </div>
          </details>

          <Button
            className="w-full"
            onClick={save}
            disabled={saving || Boolean(uploading)}
          >
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Guardar y actualizar tarjetas
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="size-4" />
            Vistas previas aproximadas; Wallet aplica el renderizado final en
            cada dispositivo.
          </div>
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <Label
              htmlFor="apple-preview-style"
              className={
                applePreviewStyle === "generic"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              Generic
            </Label>
            <Switch
              id="apple-preview-style"
              checked={applePreviewStyle === "poster"}
              onCheckedChange={(checked) =>
                setApplePreviewStyle(checked ? "poster" : "generic")
              }
              aria-label="Cambiar estilo de vista previa de Apple Wallet"
            />
            <Label
              htmlFor="apple-preview-style"
              className={
                applePreviewStyle === "poster"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              Poster Generic
            </Label>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <AppleWalletPreview
            organizationName={organizationName}
            pointsName={rewardSettings.pointsName}
            design={design}
            assets={effectiveAssets}
            variant={applePreviewStyle}
          />
          <GoogleWalletPreview
            organizationName={organizationName}
            pointsName={rewardSettings.pointsName}
            design={design}
            assets={effectiveAssets}
          />
        </div>
      </div>
    </div>
  );
}

function patchSelectedDesign(
  wallet: WalletSettings,
  selectedPlanId: string,
  patch: Partial<WalletDesign>,
): WalletSettings {
  if (wallet.mode === "global") {
    return {
      ...wallet,
      defaultDesign: { ...wallet.defaultDesign, ...patch },
    };
  }
  if (!selectedPlanId) return wallet;
  const currentOverride = wallet.planDesigns.find(
    (item) => item.planId === selectedPlanId,
  );
  const nextDesign = {
    ...(currentOverride?.design ?? wallet.defaultDesign),
    ...patch,
  };
  return {
    ...wallet,
    planDesigns: currentOverride
      ? wallet.planDesigns.map((item) =>
          item.planId === selectedPlanId
            ? { ...item, design: nextDesign }
            : item,
        )
      : [...wallet.planDesigns, { planId: selectedPlanId, design: nextDesign }],
  };
}

async function createGradientPng(design: WalletDesign): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo generar el degradado");
  const radians = (((design.gradientAngle ?? 135) - 90) * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  const gradient = context.createLinearGradient(
    canvas.width * (0.5 - x / 2),
    canvas.height * (0.5 - y / 2),
    canvas.width * (0.5 + x / 2),
    canvas.height * (0.5 + y / 2),
  );
  gradient.addColorStop(0, design.gradientStartColor ?? design.backgroundColor);
  gradient.addColorStop(1, design.gradientEndColor ?? "#216ACF");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No se pudo generar el degradado")),
      "image/png",
    ),
  );
}

function AssetInput({
  label,
  help,
  previewUrl,
  loading,
  onChange,
}: {
  label: string;
  help: string;
  previewUrl: string | null;
  loading: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 hover:bg-muted/40">
        <div className="flex size-14 items-center justify-center overflow-hidden rounded-md bg-muted">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {previewUrl ? "Reemplazar imagen" : "Subir imagen"}
          </p>
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg"
          disabled={loading}
          onChange={(event) => onChange(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          className="w-12 p-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function visualBackground(
  design: WalletDesign,
  imageUrl: string | null,
): CSSProperties | undefined {
  if (design.backgroundStyle === "gradient") {
    return {
      backgroundImage: `linear-gradient(${design.gradientAngle ?? 135}deg, ${design.gradientStartColor ?? design.backgroundColor}, ${design.gradientEndColor ?? "#216ACF"})`,
    };
  }
  if (design.backgroundStyle === "image" && imageUrl) {
    return {
      backgroundImage: `linear-gradient(rgb(0 0 0 / 0.2), rgb(0 0 0 / 0.2)), url(${JSON.stringify(imageUrl)})`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }
  return undefined;
}

function AppleWalletPreview({
  organizationName,
  pointsName,
  design,
  assets,
  variant,
}: PreviewProps & { variant: "poster" | "generic" }) {
  const foreground = design.apple?.foregroundColor ?? "#FFFFFF";
  const label = design.apple?.labelColor ?? "#BEC8DC";
  const artwork = visualBackground(design, assets.heroImageUrl);

  if (variant === "generic") {
    return (
      <div>
        <p className="mb-2 text-center text-sm font-medium">
          Apple Wallet · Generic
        </p>
        <div
          className="relative mx-auto flex min-h-[500px] max-w-[340px] flex-col overflow-hidden rounded-[22px] shadow-xl"
          style={{ backgroundColor: design.backgroundColor, color: foreground }}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="flex min-w-0 items-center gap-2">
              {assets.logoUrl && (
                <img
                  src={assets.logoUrl}
                  alt=""
                  className="h-[30px] max-w-[126px] object-contain object-left"
                />
              )}
              <span className="truncate text-sm font-semibold">
                {design.apple?.logoText || organizationName}
              </span>
            </div>
            {assets.heroImageUrl && design.backgroundStyle !== "solid" && (
              <img
                src={assets.heroImageUrl}
                alt=""
                className="size-[72px] rounded-lg object-cover"
              />
            )}
          </div>
          <div className="px-5 pt-10">
            <PreviewValue
              label="SOCIO"
              value="Socia de ejemplo"
              labelColor={label}
            />
            <div className="mt-6 grid grid-cols-2 gap-4">
              <PreviewValue
                label="MEMBRESÍA"
                value="Activa"
                labelColor={label}
              />
              <PreviewValue
                label="VENCE"
                value="31 ago 2026"
                labelColor={label}
              />
              {(design.showPoints ?? true) && (
                <PreviewValue
                  label={pointsName.toUpperCase()}
                  value="240"
                  labelColor={label}
                />
              )}
            </div>
          </div>
          <div className="mx-5 mb-6 mt-auto rounded-xl bg-white p-4 text-center shadow-lg">
            <QRCodeSVG
              value="MAT:WALLET:PREVIEW"
              size={150}
              className="mx-auto"
            />
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-[340px] text-center text-[11px] text-muted-foreground">
          Vista compatible con iOS 26 y versiones anteriores.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-center text-sm font-medium">
        Apple Wallet · Poster Generic
      </p>
      <div
        className="relative mx-auto flex min-h-[500px] max-w-[340px] flex-col overflow-hidden rounded-[22px] bg-cover bg-center shadow-xl"
        style={{
          backgroundColor: design.backgroundColor,
          color: foreground,
          ...artwork,
        }}
      >
        <div className="relative flex items-start justify-between gap-3 px-5 pt-5 drop-shadow-md">
          <div className="flex min-w-0 items-center gap-2">
            {assets.logoUrl && (
              <img
                src={assets.logoUrl}
                alt=""
                className="h-[30px] max-w-[126px] object-contain object-left"
              />
            )}
            <span className="truncate text-sm font-semibold">
              {design.apple?.logoText || organizationName}
            </span>
          </div>
          <PreviewValue label="MEMBRESÍA" value="Activa" labelColor={label} />
        </div>
        <div className="relative mt-auto min-h-52" />
        <div className="relative z-10 mx-auto mb-[-20px] rounded-xl bg-white p-2 shadow-lg">
          <QRCodeSVG value="MAT:WALLET:PREVIEW" size={126} />
        </div>
        <div className="relative bg-black/45 px-5 pb-5 pt-9 text-white shadow-[0_-8px_30px_rgb(0_0_0/0.16)] backdrop-blur-2xl">
          <div className="grid grid-cols-2 gap-5">
            <PreviewValue
              label="SOCIO"
              value="Socia de ejemplo"
              labelColor="rgb(255 255 255 / 0.68)"
            />
            <div className="text-right">
              <PreviewValue
                label="VENCE"
                value="31 ago 2026"
                labelColor="rgb(255 255 255 / 0.68)"
              />
            </div>
          </div>
          {(design.showPoints ?? true) && (
            <div className="mt-3 text-right">
              <PreviewValue
                label={pointsName.toUpperCase()}
                value="240"
                labelColor="rgb(255 255 255 / 0.68)"
              />
            </div>
          )}
          {(design.showCardName ?? true) && (
            <p className="mt-4 truncate text-xs font-medium">
              {design.programName}
            </p>
          )}
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-[340px] text-center text-[11px] text-muted-foreground">
        Poster Generic en iOS 27+. Apple aplica material translúcido en la zona
        inferior para conservar la legibilidad.
      </p>
    </div>
  );
}

function GoogleWalletPreview({
  organizationName,
  pointsName,
  design,
  assets,
}: PreviewProps) {
  const artwork = visualBackground(design, assets.heroImageUrl);
  return (
    <div>
      <p className="mb-2 text-center text-sm font-medium">Google Wallet</p>
      <div className="mx-auto max-w-[340px] overflow-hidden rounded-[18px] bg-white text-neutral-900 shadow-xl ring-1 ring-black/5">
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ backgroundColor: design.backgroundColor, color: "white" }}
        >
          {assets.logoUrl ? (
            <img
              src={assets.logoUrl}
              alt=""
              className="size-10 rounded-full bg-white object-contain"
            />
          ) : (
            <div className="size-10 rounded-full bg-white/20" />
          )}
          <div className="min-w-0">
            <p className="truncate text-xs opacity-80">{organizationName}</p>
            {(design.showCardName ?? true) && (
              <p className="truncate font-semibold">
                {design.google?.programName || design.programName}
              </p>
            )}
          </div>
        </div>
        {artwork && <div className="h-28 w-full" style={artwork} />}
        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap justify-between gap-4">
            <PreviewValue
              label="MEMBRESÍA"
              value="Activa"
              labelColor="#6B7280"
            />
            <PreviewValue label="VENCE" value="31 ago 2026" labelColor="#6B7280" />
            {(design.showPoints ?? true) && (
              <PreviewValue
                label={pointsName.toUpperCase()}
                value="240"
                labelColor="#6B7280"
              />
            )}
          </div>
          <div className="text-center">
            <QRCodeSVG
              value="MAT:WALLET:PREVIEW"
              size={126}
              className="mx-auto"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Presentá este código en recepción
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">SOCIO</p>
            <p className="font-medium">Socia de ejemplo</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type PreviewProps = {
  organizationName: string;
  pointsName: string;
  design: WalletDesign;
  assets: AssetUrls;
};

function PreviewValue({
  label,
  value,
  labelColor,
}: {
  label: string;
  value: string;
  labelColor: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-semibold tracking-wide"
        style={{ color: labelColor }}
      >
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
