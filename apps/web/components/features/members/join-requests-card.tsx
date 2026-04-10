"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type PendingJoinRequest = {
  _id: Id<"organizationJoinRequests">;
  userId: string;
  status: string;
  requestedAt: number;
  source?: string;
  fullName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
};
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export function JoinRequestsCard() {
  const pending = useQuery(api.joinGym.listPendingJoinRequests);
  const approve = useAction(api.joinGym.approveJoinRequest);
  const reject = useMutation(api.joinGym.rejectJoinRequest);

  if (pending === undefined) return null;
  if (pending.length === 0) return null;

  const handleApprove = async (requestId: Id<"organizationJoinRequests">) => {
    try {
      await approve({ requestId });
      toast.success("Solicitud aprobada. El usuario ya es miembro.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aprobar");
    }
  };

  const handleReject = async (requestId: Id<"organizationJoinRequests">) => {
    try {
      await reject({ requestId });
      toast.success("Solicitud rechazada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo rechazar");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4" />
          Solicitudes de unión ({pending.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Usuarios que escanearon el QR o ingresaron el código manual y esperan
          tu aprobación.
        </p>
        <ul className="space-y-2">
          {pending.map((req: PendingJoinRequest) => {
            const initials =
              req.fullName
                ?.split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) ||
              req.email?.[0]?.toUpperCase() ||
              "?";
            return (
              <li
                key={req._id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    {req.imageUrl && <AvatarImage src={req.imageUrl} />}
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {req.fullName || req.email || "Usuario"}
                    </p>
                    {req.email && req.fullName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {req.email}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(req.requestedAt), "d MMM yyyy, HH:mm", {
                        locale: es,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1"
                    onClick={() => handleApprove(req._id)}
                  >
                    <Check className="size-3.5" />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => handleReject(req._id)}
                  >
                    <X className="size-3.5" />
                    Rechazar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
