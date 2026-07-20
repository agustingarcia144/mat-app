"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, CalendarClock, UserMinus } from "lucide-react";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import { toast } from "sonner";
import StatusBadge from "../../../shared/badges/status-badge";

interface AssignedMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: any[];
  planificationName: string;
}

export default function AssignedMembersDialog({
  open,
  onOpenChange,
  assignments,
  planificationName,
}: AssignedMembersDialogProps) {
  const unassign = useMutation(api.planificationAssignments.unassign);
  const extend = useMutation(api.planificationAssignments.extend);
  const [unassigningId, setUnassigningId] =
    useState<Id<"planificationAssignments"> | null>(null);
  const [extendId, setExtendId] =
    useState<Id<"planificationAssignments"> | null>(null);
  const [extendEndDate, setExtendEndDate] = useState("");
  const [extending, setExtending] = useState(false);

  const handleUnassign = async (
    assignmentId: Id<"planificationAssignments">,
  ) => {
    setUnassigningId(assignmentId);
    try {
      await unassign({ id: assignmentId });
      toast.success("Miembro desasignado");
    } catch (error) {
      console.error("Failed to unassign:", error);
      toast.error("Error al desasignar");
    } finally {
      setUnassigningId(null);
    }
  };

  const toDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

  const handleOpenExtend = (assignment: {
    _id: Id<"planificationAssignments">;
    endDate?: number | null;
  }) => {
    // Suggest 30 days past the current end (or from today if it has none yet).
    const base = assignment.endDate ? new Date(assignment.endDate) : new Date();
    const suggestedEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    setExtendId(assignment._id);
    setExtendEndDate(toDateInputValue(suggestedEnd));
  };

  const handleExtend = async () => {
    if (!extendId) return;
    if (!extendEndDate) {
      toast.error("Seleccioná una fecha de fin");
      return;
    }
    setExtending(true);
    try {
      await extend({
        id: extendId,
        endDate: new Date(`${extendEndDate}T00:00:00`).getTime(),
      });
      toast.success("Planificación extendida");
      setExtendId(null);
      setExtendEndDate("");
    } catch (error) {
      console.error("Failed to extend:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al extender",
      );
    } finally {
      setExtending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Miembros Asignados</DialogTitle>
          <DialogDescription>
            Planificación: {planificationName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {assignments.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=""
                    className="h-20 w-20 object-contain"
                  />
                </EmptyMedia>
                <EmptyTitle>No hay miembros asignados</EmptyTitle>
                <EmptyDescription>
                  No hay miembros asignados a esta planificación. Asígnalos
                  desde el menú de la planificación.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => {
                const user = assignment.user;
                const initials = user?.fullName
                  ? user.fullName
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : user?.email
                    ? user.email[0].toUpperCase()
                    : "?";

                return (
                  <div
                    key={assignment._id}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="h-12 w-12">
                      {user?.imageUrl && (
                        <AvatarImage
                          src={user.imageUrl}
                          alt={user.fullName || user.email || "User"}
                        />
                      )}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">
                          {user?.fullName || "Sin nombre"}
                        </p>
                        <StatusBadge status={assignment.status} />
                      </div>
                      {user?.email && (
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                      {(assignment.startDate || assignment.endDate) && (
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {assignment.startDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Inicio:{" "}
                                {format(
                                  new Date(assignment.startDate),
                                  "dd MMM yyyy",
                                  { locale: es },
                                )}
                              </span>
                            </div>
                          )}
                          {assignment.endDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Fin:{" "}
                                {format(
                                  new Date(assignment.endDate),
                                  "dd MMM yyyy",
                                  { locale: es },
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {assignment.notes && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {assignment.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenExtend(assignment)}
                        disabled={assignment.status === "cancelled"}
                      >
                        <CalendarClock className="h-4 w-4 mr-1.5" />
                        Extender
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleUnassign(assignment._id)}
                        disabled={unassigningId === assignment._id}
                      >
                        <UserMinus className="h-4 w-4 mr-1.5" />
                        {unassigningId === assignment._id
                          ? "Desasignando..."
                          : "Desasignar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>

      <Dialog
        open={extendId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setExtendId(null);
            setExtendEndDate("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extender planificación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nueva fecha de fin</Label>
              <Input
                type="date"
                value={extendEndDate}
                onChange={(e) => setExtendEndDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setExtendId(null);
                  setExtendEndDate("");
                }}
                disabled={extending}
              >
                Cancelar
              </Button>
              <Button onClick={handleExtend} disabled={extending}>
                {extending ? "Extendiendo..." : "Extender"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
