"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MailPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import RoleBadge from "@/components/shared/badges/role-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StaffInvitation } from "@/lib/security/organization-invitations";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Props = {
  refreshKey: number;
};

export function PendingInvitationsCard({ refreshKey }: Props) {
  const invitationList = useQuery(api.organizations.listPendingInvitations);
  const revokeInvitation = useMutation(api.organizations.revokeInvitation);
  const [selectedInvitation, setSelectedInvitation] =
    useState<StaffInvitation | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const invitations = useMemo(
    () => (invitationList ?? []) as StaffInvitation[],
    [invitationList],
  );

  const handleRevoke = async () => {
    if (!selectedInvitation) {
      return;
    }

    setIsRevoking(true);
    try {
      await revokeInvitation({
        invitationId: selectedInvitation.id as Id<"organizationInvitations">,
      });
      setSelectedInvitation(null);
      toast.success("Invitación revocada");
    } catch (revokeError) {
      toast.error(
        revokeError instanceof Error
          ? revokeError.message
          : "No se pudo revocar la invitación",
      );
    } finally {
      setIsRevoking(false);
    }
  };

  // Nothing to act on: keep the team list at the top of the page.
  if (invitationList === undefined || invitations.length === 0) {
    return null;
  }

  return (
    <>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <MailPlus className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Invitaciones pendientes</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {invitations.length}
          </span>
        </div>
        <ul className="divide-y rounded-lg border">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1.5">
                <p className="truncate text-sm font-medium">
                  {invitation.email}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role={String(invitation.role)} />
                  <span className="text-xs text-muted-foreground">
                    Enviada el{" "}
                    {format(
                      new Date(invitation.createdAt),
                      "d MMM yyyy, HH:mm",
                      {
                        locale: es,
                      },
                    )}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5 self-start text-muted-foreground hover:text-destructive sm:self-center"
                onClick={() => setSelectedInvitation(invitation)}
              >
                <Trash2 className="size-4" />
                Revocar
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <Dialog
        open={!!selectedInvitation}
        onOpenChange={(open) => !open && setSelectedInvitation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revocar invitación</DialogTitle>
            <DialogDescription>
              {selectedInvitation?.email} dejará de poder unirse a la
              organización con este enlace. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedInvitation(null)}
              disabled={isRevoking}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRevoke()}
              disabled={isRevoking}
            >
              {isRevoking ? "Revocando…" : "Revocar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
