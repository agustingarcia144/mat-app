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
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Check, ChevronsUpDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function buildBillingPeriodOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  // Current month + 2 previous months
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

export default function RecordPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
}: RecordPaymentDialogProps) {
  const canQuery = useCanQueryCurrentOrganization();

  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    open && canQuery ? {} : "skip",
  );

  const recordPayment = useMutation(api.planPayments.recordPayment);
  const generateUploadUrl = useMutation(api.planPayments.generateUploadUrl);

  const [subscriptionId, setSubscriptionId] = useState<
    Id<"memberPlanSubscriptions"> | ""
  >("");
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">(
    "cash",
  );
  const [billingPeriod, setBillingPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amountOverride, setAmountOverride] = useState<number | undefined>(
    undefined,
  );
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const billingPeriodOptions = useMemo(() => buildBillingPeriodOptions(), []);

  // Filter to active or suspended subscriptions (those that can receive payments)
  const eligibleSubscriptions = useMemo(
    () =>
      (subscriptions ?? []).filter(
        (s) =>
          (s.status === "active" || s.status === "suspended") &&
          !s.familyParentSubscriptionId,
      ),
    [subscriptions],
  );

  const selectedSubscription = useMemo(
    () => eligibleSubscriptions.find((s) => s._id === subscriptionId),
    [eligibleSubscriptions, subscriptionId],
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setSubscriptionId("");
    setPaymentMethod("cash");
    const now = new Date();
    setBillingPeriod(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    );
    setAmountDisplay("");
    setAmountOverride(undefined);
    setNotes("");
    setProofFile(null);
  }, [open]);

  // When subscription changes, prefill amount
  useEffect(() => {
    if (selectedSubscription?.plan) {
      const price =
        selectedSubscription.payableAmountArs ?? selectedSubscription.plan.priceArs;
      setAmountDisplay(price.toLocaleString("es-AR"));
      setAmountOverride(undefined);
    }
  }, [selectedSubscription]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) : 0;
    setAmountDisplay(num.toLocaleString("es-AR"));
    setAmountOverride(num);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionId) return;

    setIsSubmitting(true);
    try {
      let proofStorageId: Id<"_storage"> | undefined;
      let proofFileName: string | undefined;
      let proofContentType: string | undefined;

      // Upload proof file if provided
      if (proofFile) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": proofFile.type },
          body: proofFile,
        });
        if (!res.ok) throw new Error("Error al subir comprobante");
        const { storageId } = await res.json();
        proofStorageId = storageId;
        proofFileName = proofFile.name;
        proofContentType = proofFile.type;
      }

      await recordPayment({
        subscriptionId: subscriptionId as Id<"memberPlanSubscriptions">,
        billingPeriod,
        paymentMethod,
        amountArs: amountOverride,
        notes: notes || undefined,
        proofStorageId,
        proofFileName,
        proofContentType,
      });

      toast.success("Pago registrado correctamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al registrar pago",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar pago</SheetTitle>
          <SheetDescription>
            Registra un pago en efectivo o por transferencia bancaria para un
            miembro.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Member / Subscription selection */}
          <Field>
            <FieldLabel>Miembro</FieldLabel>
            <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
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
                    <CommandEmpty>No se encontraron miembros.</CommandEmpty>
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
                              {sub.plan?.name ?? "Plan"}{" "}
                              {(sub.coveredMemberCount ?? 1) > 1 &&
                                `(${sub.coveredMemberCount} miembros)`}{" "}
                              {sub.status === "suspended" && "(suspendido)"}
                            </span>
                            {sub.familyAssociatedNames?.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Asociados: {sub.familyAssociatedNames.join(", ")}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {!subscriptionId && (
              <FieldDescription>
                Solo se muestran titulares con suscripción activa o suspendida.
              </FieldDescription>
            )}
          </Field>

          {/* Billing period */}
          <Field>
            <FieldLabel>Período</FieldLabel>
            <Select value={billingPeriod} onValueChange={setBillingPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {billingPeriodOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Payment method */}
          <Field>
            <FieldLabel>Método de pago</FieldLabel>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as "cash" | "bank_transfer")
              }
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cash" id="method-cash" />
                <Label
                  htmlFor="method-cash"
                  className="font-normal cursor-pointer"
                >
                  Efectivo
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="bank_transfer" id="method-transfer" />
                <Label
                  htmlFor="method-transfer"
                  className="font-normal cursor-pointer"
                >
                  Transferencia
                </Label>
              </div>
            </RadioGroup>
          </Field>

          {/* Amount */}
          <Field>
            <FieldLabel>Monto (ARS)</FieldLabel>
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="text"
                inputMode="numeric"
                className="pl-7"
                value={amountDisplay}
                onChange={handleAmountChange}
                placeholder={
                  selectedSubscription?.plan
                    ? (
                        selectedSubscription.payableAmountArs ??
                        selectedSubscription.plan.priceArs
                      ).toLocaleString("es-AR")
                    : "0"
                }
              />
            </div>
            {selectedSubscription?.plan && (
              <FieldDescription>
                Monto sugerido: $
                {(
                  selectedSubscription.payableAmountArs ??
                  selectedSubscription.plan.priceArs
                ).toLocaleString("es-AR")}
                {(selectedSubscription.coveredMemberCount ?? 1) > 1 &&
                  ` (${selectedSubscription.coveredMemberCount} miembros x $${selectedSubscription.plan.priceArs.toLocaleString("es-AR")})`}
              </FieldDescription>
            )}
          </Field>

          {/* Proof upload (bank transfer only, optional) */}
          {paymentMethod === "bank_transfer" && (
            <Field>
              <FieldLabel>Comprobante (opcional)</FieldLabel>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    document.getElementById("proof-file-input")?.click()
                  }
                >
                  <Upload className="h-4 w-4" />
                  {proofFile ? "Cambiar archivo" : "Subir comprobante"}
                </Button>
                {proofFile && (
                  <span className="truncate text-sm text-muted-foreground">
                    {proofFile.name}
                  </span>
                )}
              </div>
              <input
                id="proof-file-input"
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          )}

          {/* Notes */}
          <Field>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Pago parcial, recibo #123..."
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !subscriptionId}>
              {isSubmitting ? "Registrando..." : "Registrar pago"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
