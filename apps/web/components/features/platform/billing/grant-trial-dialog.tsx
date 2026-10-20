"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  formatDay,
  type PlatformOrgRow,
} from "@/components/features/platform/platform-labels";

const DEFAULT_TRIAL_DAYS = 7;
const MAX_TRIAL_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

interface GrantTrialDialogProps {
  organization: PlatformOrgRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GrantTrialDialog({
  organization,
  open,
  onOpenChange,
}: GrantTrialDialogProps) {
  const grantTrial = useMutation(api.organizationBilling.grantTrial);
  const [daysInput, setDaysInput] = useState(String(DEFAULT_TRIAL_DAYS));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) setDaysInput(String(DEFAULT_TRIAL_DAYS));
  }, [open]);

  if (!organization) return null;

  const days = Number(daysInput);
  const isValid = Number.isInteger(days) && days >= 1 && days <= MAX_TRIAL_DAYS;
  const endsAt = isValid ? Date.now() + days * DAY_MS : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const result = await grantTrial({
        organizationId: organization.organizationId,
        days,
      });
      toast.success(
        `Prueba otorgada. Acceso hasta el ${formatDay(result.trialEndsAt)}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo otorgar la prueba",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Otorgar prueba</DialogTitle>
          <DialogDescription>
            {organization.name} tendrá acceso completo durante el período de
            prueba.
            {organization.planKey
              ? " Conserva su plan y origen actuales."
              : " Se crea una prueba en el plan PRO, como la del alta."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="trialDays">Días de prueba</FieldLabel>
            <Input
              id="trialDays"
              type="number"
              min={1}
              max={MAX_TRIAL_DAYS}
              step={1}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
            />
            <FieldDescription>Se cuentan desde hoy.</FieldDescription>
            {!isValid && (
              <FieldError>
                Ingresá un número de días entre 1 y {MAX_TRIAL_DAYS}
              </FieldError>
            )}
          </Field>

          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            Acceso de prueba hasta el{" "}
            <span className="font-medium">{formatDay(endsAt)}</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Otorgando..." : "Otorgar prueba"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
