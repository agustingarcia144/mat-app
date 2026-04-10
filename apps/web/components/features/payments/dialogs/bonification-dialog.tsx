"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Check, ChevronsUpDown, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

const REASON_LABELS: Record<string, string> = {
  friend_and_family: "Familiar/Amigo",
  trainer: "Entrenador",
  employee: "Empleado",
  sponsor: "Sponsor",
  other: "Otro",
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  full: "100% gratis",
  percentage: "Porcentaje de descuento",
  fixed: "Monto fijo de descuento",
};

function computePreviewAmount(
  planPrice: number,
  discountType: string,
  discountValue: number,
): number {
  if (discountType === "full") return 0;
  if (discountType === "percentage") {
    return Math.round(planPrice * (1 - discountValue / 100));
  }
  return Math.max(0, planPrice - discountValue);
}

interface BonificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function BonificationDialog({
  open,
  onOpenChange,
  onSuccess,
}: BonificationDialogProps) {
  const canQuery = useCanQueryCurrentOrganization();

  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    open && canQuery ? {} : "skip",
  );
  const bonifications = useQuery(
    api.planBonifications.getByOrganization,
    open && canQuery ? { status: "active" } : "skip",
  );

  const createBonification = useMutation(api.planBonifications.create);
  const revokeBonification = useMutation(api.planBonifications.revoke);

  // Create state
  const [subscriptionId, setSubscriptionId] = useState<
    Id<"memberPlanSubscriptions"> | ""
  >("");
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [discountType, setDiscountType] = useState<
    "full" | "percentage" | "fixed"
  >("full");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Revoke state
  const [revokeBonificationId, setRevokeBonificationId] = useState<
    Id<"planBonifications"> | ""
  >("");
  const [revokeSearchOpen, setRevokeSearchOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Members with active/suspended subs that do NOT have an active bonification
  const bonifiedSubscriptionIds = useMemo(
    () => new Set((bonifications ?? []).map((b) => String(b.subscriptionId))),
    [bonifications],
  );

  const eligibleSubscriptions = useMemo(
    () =>
      (subscriptions ?? []).filter(
        (s) =>
          (s.status === "active" || s.status === "suspended") &&
          !bonifiedSubscriptionIds.has(String(s._id)),
      ),
    [subscriptions, bonifiedSubscriptionIds],
  );

  const selectedSubscription = useMemo(
    () => eligibleSubscriptions.find((s) => s._id === subscriptionId),
    [eligibleSubscriptions, subscriptionId],
  );

  const selectedBonification = useMemo(
    () => (bonifications ?? []).find((b) => b._id === revokeBonificationId),
    [bonifications, revokeBonificationId],
  );

  // Computed preview amount
  const previewAmount = useMemo(() => {
    if (!selectedSubscription?.plan) return null;
    return computePreviewAmount(
      selectedSubscription.plan.priceArs,
      discountType,
      discountValue,
    );
  }, [selectedSubscription, discountType, discountValue]);

  // Reset form on open
  useEffect(() => {
    if (!open) return;
    setSubscriptionId("");
    setDiscountType("full");
    setDiscountValue(0);
    setReason("");
    setNotes("");
    setRevokeBonificationId("");
    setRevokeReason("");
  }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionId || !reason) return;

    setIsSubmitting(true);
    try {
      await createBonification({
        subscriptionId: subscriptionId as Id<"memberPlanSubscriptions">,
        discountType,
        discountValue: discountType === "full" ? 0 : discountValue,
        reason: reason as any,
        notes: notes || undefined,
      });
      toast.success("Bonificación creada correctamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear bonificación",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeBonificationId) return;

    setIsSubmitting(true);
    try {
      await revokeBonification({
        bonificationId: revokeBonificationId as Id<"planBonifications">,
        reason: revokeReason || undefined,
      });
      toast.success("Bonificación revocada correctamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al revocar bonificación",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bonificación de plan</SheetTitle>
          <SheetDescription>
            Otorgá un descuento o plan gratuito a un miembro.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="create" className="pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              Bonificar
            </TabsTrigger>
            <TabsTrigger value="revoke" className="flex-1">
              Revocar
            </TabsTrigger>
          </TabsList>

          {/* ── CREATE TAB ── */}
          <TabsContent value="create">
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              {/* Member selection */}
              <Field>
                <FieldLabel>Miembro</FieldLabel>
                <Popover
                  open={memberSearchOpen}
                  onOpenChange={setMemberSearchOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={memberSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedSubscription
                        ? `${selectedSubscription.userFullName} — ${selectedSubscription.plan?.name ?? "Plan"}`
                        : "Seleccionar miembro..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0"
                    align="start"
                    style={{ width: "var(--radix-popover-trigger-width)" }}
                  >
                    <Command>
                      <CommandInput placeholder="Buscar miembro..." />
                      <CommandList>
                        <CommandEmpty>No hay miembros elegibles.</CommandEmpty>
                        <CommandGroup>
                          {eligibleSubscriptions.map((sub) => (
                            <CommandItem
                              key={sub._id}
                              value={`${sub.userFullName} ${sub.plan?.name ?? ""}`}
                              onSelect={() => {
                                setSubscriptionId(sub._id);
                                setMemberSearchOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  subscriptionId === sub._id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{sub.userFullName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {sub.plan?.name ?? "Plan"}
                                  {" · $"}
                                  {sub.plan?.priceArs.toLocaleString("es-AR") ??
                                    "0"}
                                  /mes
                                  {sub.status === "suspended" &&
                                    " (suspendido)"}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FieldDescription>
                  Solo se muestran miembros con plan activo o suspendido sin
                  bonificación.
                </FieldDescription>
              </Field>

              {/* Discount type */}
              <Field>
                <FieldLabel>Tipo de descuento</FieldLabel>
                <RadioGroup
                  value={discountType}
                  onValueChange={(v) =>
                    setDiscountType(v as "full" | "percentage" | "fixed")
                  }
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="full" id="dt-full" />
                    <Label
                      htmlFor="dt-full"
                      className="cursor-pointer font-normal"
                    >
                      100% gratis
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="percentage" id="dt-pct" />
                    <Label
                      htmlFor="dt-pct"
                      className="cursor-pointer font-normal"
                    >
                      Porcentaje de descuento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="fixed" id="dt-fixed" />
                    <Label
                      htmlFor="dt-fixed"
                      className="cursor-pointer font-normal"
                    >
                      Monto fijo de descuento
                    </Label>
                  </div>
                </RadioGroup>
              </Field>

              {/* Discount value (conditional) */}
              {discountType === "percentage" && (
                <Field>
                  <FieldLabel>Porcentaje de descuento</FieldLabel>
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={discountValue || ""}
                      onChange={(e) =>
                        setDiscountValue(parseInt(e.target.value) || 0)
                      }
                      placeholder="Ej: 50"
                      className="pr-8"
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              )}

              {discountType === "fixed" && (
                <Field>
                  <FieldLabel>Monto de descuento (ARS)</FieldLabel>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      min={1}
                      value={discountValue || ""}
                      onChange={(e) =>
                        setDiscountValue(parseInt(e.target.value) || 0)
                      }
                      placeholder="Ej: 5000"
                      className="pl-7"
                    />
                  </div>
                </Field>
              )}

              {/* Reason */}
              <Field>
                <FieldLabel>Motivo</FieldLabel>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REASON_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Notes */}
              <Field>
                <FieldLabel>Notas (opcional)</FieldLabel>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles adicionales..."
                />
              </Field>

              {/* Preview card */}
              {selectedSubscription?.plan && previewAmount !== null && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-purple-500" />
                    <p className="font-medium">Vista previa</p>
                  </div>
                  <p className="text-muted-foreground">
                    {selectedSubscription.plan.name}: $
                    {selectedSubscription.plan.priceArs.toLocaleString("es-AR")}
                    /mes
                  </p>
                  <p className="font-semibold text-purple-600 dark:text-purple-400">
                    Bonificado: ${previewAmount.toLocaleString("es-AR")}/mes
                    {discountType === "full" && " (gratis)"}
                    {discountType === "percentage" &&
                      ` (${discountValue}% descuento)`}
                    {discountType === "fixed" &&
                      ` ($${discountValue.toLocaleString("es-AR")} descuento)`}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !subscriptionId ||
                    !reason ||
                    (discountType !== "full" && discountValue <= 0)
                  }
                >
                  {isSubmitting ? "Creando..." : "Crear bonificación"}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* ── REVOKE TAB ── */}
          <TabsContent value="revoke">
            <form onSubmit={handleRevoke} className="space-y-4 pt-2">
              <Field>
                <FieldLabel>Miembro bonificado</FieldLabel>
                <Popover
                  open={revokeSearchOpen}
                  onOpenChange={setRevokeSearchOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={revokeSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedBonification
                        ? `${selectedBonification.userFullName} — ${selectedBonification.planName}`
                        : "Seleccionar miembro..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0"
                    align="start"
                    style={{ width: "var(--radix-popover-trigger-width)" }}
                  >
                    <Command>
                      <CommandInput placeholder="Buscar miembro..." />
                      <CommandList>
                        <CommandEmpty>
                          No hay miembros con bonificación activa.
                        </CommandEmpty>
                        <CommandGroup>
                          {(bonifications ?? []).map((b) => (
                            <CommandItem
                              key={b._id}
                              value={`${b.userFullName} ${b.planName}`}
                              onSelect={() => {
                                setRevokeBonificationId(b._id);
                                setRevokeSearchOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  revokeBonificationId === b._id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{b.userFullName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {b.planName}
                                  {" · "}
                                  {DISCOUNT_TYPE_LABELS[b.discountType] ??
                                    b.discountType}
                                  {b.discountType === "percentage" &&
                                    ` (${b.discountValue}%)`}
                                  {b.discountType === "fixed" &&
                                    ` ($${b.discountValue.toLocaleString("es-AR")})`}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FieldDescription>
                  Solo se muestran miembros con bonificación activa.
                </FieldDescription>
              </Field>

              {selectedBonification && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
                  <p className="font-medium">
                    {selectedBonification.userFullName}
                  </p>
                  <p className="text-muted-foreground">
                    {selectedBonification.planName}
                    {" · "}
                    {DISCOUNT_TYPE_LABELS[selectedBonification.discountType]}
                    {selectedBonification.discountType === "percentage" &&
                      ` (${selectedBonification.discountValue}%)`}
                    {selectedBonification.discountType === "fixed" &&
                      ` ($${selectedBonification.discountValue.toLocaleString("es-AR")})`}
                  </p>
                  <p className="text-muted-foreground">
                    Motivo:{" "}
                    {REASON_LABELS[selectedBonification.reason] ??
                      selectedBonification.reason}
                  </p>
                  <p className="text-destructive/80 text-xs">
                    El miembro volverá al flujo de pago normal a partir del
                    próximo período.
                  </p>
                </div>
              )}

              <Field>
                <FieldLabel>Motivo de revocación (opcional)</FieldLabel>
                <Textarea
                  rows={2}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Motivo por el que se revoca la bonificación..."
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isSubmitting || !revokeBonificationId}
                >
                  {isSubmitting ? "Revocando..." : "Revocar bonificación"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
