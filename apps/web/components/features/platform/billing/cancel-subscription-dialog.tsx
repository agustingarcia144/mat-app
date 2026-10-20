"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
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
import {
  getPlanLabel,
  getSourceLabel,
  type PlatformOrgRow,
} from "@/components/features/platform/platform-labels";

interface CancelSubscriptionDialogProps {
  organization: PlatformOrgRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CancelSubscriptionDialog({
  organization,
  open,
  onOpenChange,
}: CancelSubscriptionDialogProps) {
  const cancelSubscription = useMutation(
    api.organizationBilling.cancelOffMercadoPagoSubscription,
  );
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    if (!organization) return;
    setIsCancelling(true);
    try {
      await cancelSubscription({
        organizationId: organization.organizationId,
      });
      toast.success(`Se cortó la suscripción de ${organization.name}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo cortar la suscripción",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cortar suscripción</AlertDialogTitle>
          <AlertDialogDescription>
            {organization?.name} ({organization && getPlanLabel(organization)}
            {" · "}
            {organization && getSourceLabel(organization.source)}) pierde el
            acceso al plan ahora mismo y queda inactiva. Para reactivarla,
            registrá un pago o dale un período de prueba.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isCancelling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void handleCancel();
            }}
          >
            {isCancelling ? "Cortando..." : "Cortar suscripción"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
