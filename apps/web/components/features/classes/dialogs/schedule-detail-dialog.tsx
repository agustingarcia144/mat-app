"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import matWolfLooking from "@/assets/mat-wolf-looking.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  MoreHorizontal,
  Eye,
  Users,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type Doc, type Id } from "@/convex/_generated/dataModel";
import ClassStatusBadge from "@/components/shared/badges/class-status-badge";
import { toast } from "sonner";

interface ScheduleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: Id<"classSchedules">;
}

function safeDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(`${year}-${month}-${day}`);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const d = new Date(value as number | string);
  return isNaN(d.getTime()) ? null : d;
}

function getPlanStatus(assignment: {
  startDate?: number | string | null;
  endDate?: number | string | null;
}) {
  const start = safeDate(assignment.startDate);
  const end = safeDate(assignment.endDate);
  const now = new Date();
  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (!start || !end)
    return {
      status: "not_started" as const,
      daysLeft: null,
      daysExpired: null,
    };
  const daysLeftRaw = diffDays(now, end);
  const daysLeft = Math.max(daysLeftRaw, 0);
  const daysExpiredRaw = diffDays(end, now);
  const daysExpired = end <= now ? Math.max(daysExpiredRaw, 0) : null;
  if (end <= now)
    return { status: "expired" as const, daysLeft: 0, daysExpired };
  if (start > now)
    return { status: "not_started" as const, daysLeft, daysExpired: null };
  if (daysLeft <= 5)
    return { status: "expiring_soon" as const, daysLeft, daysExpired: null };
  return { status: "active" as const, daysLeft, daysExpired: null };
}

type ReservationWithUser = {
  _id: Id<"classReservations">;
  userId: string;
  status: string;
  notes?: string | null;
  checkedInAt?: number | null;
  isFixedSlot?: boolean;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    email?: string | null;
    imageUrl?: string | null;
  } | null;
};

function ReservationRow({
  reservation,
  getStatusBadge,
  isPastClass,
  actionLoading,
  handleCheckIn,
  handleMarkNoShow,
}: {
  reservation: ReservationWithUser;
  getStatusBadge: (status: string) => React.ReactNode;
  isPastClass: boolean;
  actionLoading: string | null;
  handleCheckIn: (id: Id<"classReservations">) => void;
  handleMarkNoShow: (id: Id<"classReservations">) => void;
}) {
  const router = useRouter();
  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    reservation.userId ? { userId: reservation.userId } : "skip",
  );
  const assignment = assignments?.find(
    (
      a: Doc<"planificationAssignments"> & {
        planification?: { _id: Id<"planifications">; name: string } | null;
      },
    ) => a.status === "active",
  );
  const planStatus = assignment ? getPlanStatus(assignment) : null;
  const showAssign = !assignment || planStatus?.status === "expired";

  const handleViewPlan = () => {
    if (assignment?.planification?._id)
      router.push(`/dashboard/planifications/${assignment.planification._id}`);
  };
  const handleAssign = () => router.push("/dashboard/planifications");

  const planBadge =
    assignment && planStatus ? (
      planStatus.status === "expired" ? (
        <Badge variant="outline" className="text-xs">
          Vencida
        </Badge>
      ) : planStatus.status === "active" && planStatus.daysLeft != null ? (
        <Badge className="bg-green-600 text-xs">
          {planStatus.daysLeft}d rest.
        </Badge>
      ) : planStatus.status === "expiring_soon" ? (
        <Badge className="bg-yellow-500 text-black text-xs">Próx. vencer</Badge>
      ) : planStatus.status === "not_started" ? (
        <Badge variant="secondary" className="text-xs">
          No iniciada
        </Badge>
      ) : null
    ) : null;

  return (
    <div className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="shrink-0">
          <AvatarImage src={reservation.user?.imageUrl ?? undefined} />
          <AvatarFallback>
            {reservation.user?.firstName?.[0]}
            {reservation.user?.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">
              {reservation.user?.fullName || "Usuario"}
            </p>
            {reservation.isFixedSlot && (
              <Badge variant="secondary" className="text-xs font-normal">
                Turno fijo
              </Badge>
            )}
          </div>
          {reservation.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {reservation.notes}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {assignment?.planification?.name
                ? `Planificación: ${assignment.planification.name}`
                : "Sin planificación"}
            </span>
            {planBadge}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {assignment && (
                  <DropdownMenuItem onClick={handleViewPlan}>
                    <Eye className="h-4 w-4 mr-2" />
                    Ver planificación
                  </DropdownMenuItem>
                )}
                {showAssign && (
                  <DropdownMenuItem onClick={handleAssign}>
                    <Users className="h-4 w-4 mr-2" />
                    Asignar planificación
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {getStatusBadge(reservation.status)}

        {reservation.status === "confirmed" && isPastClass && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCheckIn(reservation._id)}
              disabled={actionLoading === reservation._id}
            >
              Registrar asistencia
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMarkNoShow(reservation._id)}
              disabled={actionLoading === reservation._id}
            >
              Marcar ausente
            </Button>
          </div>
        )}

        {reservation.checkedInAt && (
          <p className="text-xs text-muted-foreground">
            {format(new Date(reservation.checkedInAt), "HH:mm", { locale: es })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ScheduleDetailDialog({
  open,
  onOpenChange,
  scheduleId,
}: ScheduleDetailDialogProps) {
  const schedule = useQuery(api.classSchedules.getScheduleWithDetails, {
    id: scheduleId,
  });
  const reservations = useQuery(api.classReservations.getByScheduleWithUsers, {
    scheduleId,
  });
  const checkIn = useMutation(api.classReservations.checkIn);
  const markNoShow = useMutation(api.classReservations.markNoShow);
  const cancelSchedule = useMutation(api.classSchedules.cancel);
  const removeSchedule = useMutation(api.classSchedules.remove);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "cancel" | "remove" | null
  >(null);

  const filteredReservations =
    !schedule || !reservations
      ? []
      : statusFilter === "all"
        ? reservations
        : reservations.filter(
            (r: Doc<"classReservations">) => r.status === statusFilter,
          );

  const confirmedCount = reservations
    ? reservations.filter(
        (r: Doc<"classReservations">) => r.status === "confirmed",
      ).length
    : 0;
  const attendedCount = reservations
    ? reservations.filter(
        (r: Doc<"classReservations">) => r.status === "attended",
      ).length
    : 0;
  const noShowCount = reservations
    ? reservations.filter(
        (r: Doc<"classReservations">) => r.status === "no_show",
      ).length
    : 0;

  const hasActiveReservationsOrAttendance =
    confirmedCount > 0 || attendedCount > 0 || noShowCount > 0;

  const handleCheckIn = async (reservationId: Id<"classReservations">) => {
    setActionLoading(reservationId);
    try {
      await checkIn({ id: reservationId });
    } catch (error) {
      console.error("Error checking in:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al registrar asistencia",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkNoShow = async (reservationId: Id<"classReservations">) => {
    setActionLoading(reservationId);
    try {
      await markNoShow({ id: reservationId });
    } catch (error) {
      console.error("Error marking no-show:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al marcar ausencia",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestCancelOrRemove = (action: "cancel" | "remove") => {
    if (!schedule) return;

    // If the schedule has active reservations or attendance, show confirmation dialog
    if (hasActiveReservationsOrAttendance) {
      setConfirmAction(action);
      return;
    }

    // No reservations/attendance — proceed directly
    if (action === "cancel") {
      executeCancelSchedule();
    } else {
      executeRemoveSchedule();
    }
  };

  const executeCancelSchedule = async () => {
    setConfirmAction(null);
    setIsRemoving(true);
    try {
      await cancelSchedule({ id: scheduleId });
      toast.success("Turno cancelado");
      onOpenChange(false);
    } catch (error) {
      console.error("Error cancelling schedule:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al cancelar el turno",
      );
    } finally {
      setIsRemoving(false);
    }
  };

  const executeRemoveSchedule = async () => {
    setConfirmAction(null);
    setIsRemoving(true);
    try {
      await removeSchedule({ id: scheduleId, force: true });
      toast.success("Turno eliminado");
      onOpenChange(false);
    } catch (error) {
      console.error("Error removing schedule:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al eliminar el turno",
      );
    } finally {
      setIsRemoving(false);
    }
  };

  const handleConfirmAction = () => {
    if (confirmAction === "cancel") {
      executeCancelSchedule();
    } else if (confirmAction === "remove") {
      executeRemoveSchedule();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge variant="default" className="gap-1">
            <Clock className="h-3 w-3" />
            Confirmada
          </Badge>
        );
      case "attended":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle2 className="h-3 w-3" />
            Asistió
          </Badge>
        );
      case "no_show":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            No asistió
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Cancelada
          </Badge>
        );
      default:
        return null;
    }
  };

  const isPastClass = schedule ? schedule.startTime < Date.now() : false;
  const isCancelled = schedule?.status === "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {schedule?.class?.name ?? "Detalle del turno"}
          </DialogTitle>
          <DialogDescription>
            Información y reservas del turno seleccionado.
          </DialogDescription>
        </DialogHeader>
        {!schedule || !reservations ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-muted-foreground">Cargando detalles...</p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{schedule.class?.name}</DialogTitle>
              <DialogDescription>
                {format(
                  new Date(schedule.startTime),
                  "EEEE d 'de' MMMM 'a las' HH:mm",
                  {
                    locale: es,
                  },
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Schedule Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Capacidad</p>
                  <p className="text-lg font-semibold">
                    {schedule.currentReservations} / {schedule.capacity}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estado</p>
                  <ClassStatusBadge status={schedule.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Confirmadas</p>
                  <p className="text-lg font-semibold">{confirmedCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Asistencias</p>
                  <p className="text-lg font-semibold">
                    {attendedCount}
                    {noShowCount > 0 && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({noShowCount} ausentes)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {!isCancelled && (
                <div className="flex justify-between items-center">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="confirmed">Confirmadas</SelectItem>
                      <SelectItem value="attended">Asistieron</SelectItem>
                      <SelectItem value="no_show">No asistieron</SelectItem>
                      <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRequestCancelOrRemove("cancel")}
                      disabled={isRemoving}
                    >
                      {isRemoving ? "Procesando..." : "Cancelar turno"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRequestCancelOrRemove("remove")}
                      disabled={isRemoving}
                    >
                      {isRemoving ? "Procesando..." : "Eliminar turno"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Reservations List */}
              <div className="space-y-2">
                <h3 className="font-semibold">
                  Reservas ({filteredReservations.length})
                </h3>

                {filteredReservations.length === 0 ? (
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyMedia>
                        <Image
                          src={matWolfLooking}
                          alt=""
                          className="h-16 w-16 object-contain"
                        />
                      </EmptyMedia>
                      <EmptyTitle>No hay reservas</EmptyTitle>
                      <EmptyDescription>
                        {statusFilter === "all"
                          ? "No hay reservas para este turno"
                          : "No hay reservas con este estado"}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="space-y-2">
                    {filteredReservations.map(
                      (reservation: ReservationWithUser) => (
                        <ReservationRow
                          key={reservation._id}
                          reservation={reservation}
                          getStatusBadge={getStatusBadge}
                          isPastClass={isPastClass}
                          actionLoading={actionLoading}
                          handleCheckIn={handleCheckIn}
                          handleMarkNoShow={handleMarkNoShow}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>

      {/* Confirmation dialog for cancel/remove with reservations or attendance */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmAction === "cancel"
                ? "Cancelar turno"
                : "Eliminar turno"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {confirmAction === "cancel"
                    ? "Este turno tiene información asociada. Al cancelarlo:"
                    : "Este turno tiene información asociada. Al eliminarlo:"}
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  {confirmedCount > 0 && (
                    <li>
                      Se cancelarán{" "}
                      <strong>{confirmedCount} reservas confirmadas</strong> y
                      se notificará a los miembros.
                    </li>
                  )}
                  {attendedCount > 0 && (
                    <li>
                      Hay{" "}
                      <strong>
                        {attendedCount} asistencias registradas
                      </strong>{" "}
                      que se verán afectadas.
                    </li>
                  )}
                  {noShowCount > 0 && (
                    <li>
                      Hay <strong>{noShowCount} ausencias registradas</strong>.
                    </li>
                  )}
                  {confirmAction === "remove" && (
                    <li>
                      El turno se eliminará permanentemente del calendario.
                    </li>
                  )}
                </ul>
                <p className="text-sm font-medium text-destructive">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={buttonVariants({ variant: "destructive" })}
            >
              {confirmAction === "cancel"
                ? "Sí, cancelar turno"
                : "Sí, eliminar turno"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
