"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import StaffSelect, {
  type StaffOption,
} from "@/components/features/team/staff-select";
import { isOrgStaffRole } from "@/lib/security/roles";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Ban,
  Check,
  Eye,
  MoreHorizontal,
  Repeat2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { type Doc, type Id } from "@/convex/_generated/dataModel";
import ClassStatusBadge from "@/components/shared/badges/class-status-badge";
import { toast } from "sonner";

const RESERVATION_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "confirmed", label: "Confirmadas" },
  { value: "attended", label: "Asistieron" },
  { value: "no_show", label: "Ausentes" },
  { value: "cancelled", label: "Canceladas" },
] as const;

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

const RESERVATION_STATUS: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  confirmed: {
    label: "Confirmada",
    dot: "bg-sky-500",
    text: "text-foreground",
  },
  attended: {
    label: "Asistió",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  no_show: {
    label: "Ausente",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
  cancelled: {
    label: "Cancelada",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

function ReservationStatus({
  status,
  checkedInAt,
}: {
  status: string;
  checkedInAt?: number | null;
}) {
  const meta = RESERVATION_STATUS[status];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        meta.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
      {status === "attended" && checkedInAt && (
        <span className="font-normal tabular-nums text-muted-foreground">
          {format(new Date(checkedInAt), "HH:mm")}
        </span>
      )}
    </span>
  );
}

function ReservationRow({
  reservation,
  isPastClass,
  actionLoading,
  handleCheckIn,
  handleMarkNoShow,
}: {
  reservation: ReservationWithUser;
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
  const busy = actionLoading === reservation._id;
  const canMarkAttendance = reservation.status === "confirmed" && isPastClass;

  const handleViewPlan = () => {
    if (assignment?.planification?._id)
      router.push(`/dashboard/planifications/${assignment.planification._id}`);
  };
  const handleAssign = () => router.push("/dashboard/planifications");

  const planLine = !assignment ? (
    <span>Sin planificación</span>
  ) : (
    <>
      <span className="truncate">{assignment.planification?.name}</span>
      {planStatus?.status === "expired" ? (
        <span className="shrink-0 text-red-600 dark:text-red-400">
          · Vencida
        </span>
      ) : planStatus?.status === "expiring_soon" ? (
        <span className="shrink-0 text-amber-600 dark:text-amber-400">
          · Vence en {planStatus.daysLeft}d
        </span>
      ) : planStatus?.status === "not_started" ? (
        <span className="shrink-0">· No iniciada</span>
      ) : planStatus?.daysLeft != null ? (
        <span className="shrink-0">· {planStatus.daysLeft}d restantes</span>
      ) : null}
    </>
  );

  const fullName =
    reservation.user?.fullName ||
    [reservation.user?.firstName, reservation.user?.lastName]
      .filter(Boolean)
      .join(" ") ||
    "Usuario";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={reservation.user?.imageUrl ?? undefined} />
        <AvatarFallback className="text-xs">
          {reservation.user?.firstName?.[0]}
          {reservation.user?.lastName?.[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{fullName}</p>
          {reservation.isFixedSlot && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Repeat2 className="size-3" aria-hidden />
              Fijo
            </span>
          )}
        </div>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {planLine}
        </p>
        {reservation.notes && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            “{reservation.notes}”
          </p>
        )}
      </div>

      <div className="ml-11 flex items-center gap-1.5 sm:ml-0">
        {canMarkAttendance ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => handleCheckIn(reservation._id)}
              disabled={busy}
            >
              <Check className="size-3.5 text-emerald-600" aria-hidden />
              Presente
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => handleMarkNoShow(reservation._id)}
              disabled={busy}
            >
              <X className="size-3.5 text-red-600" aria-hidden />
              Ausente
            </Button>
          </>
        ) : (
          <ReservationStatus
            status={reservation.status}
            checkedInAt={reservation.checkedInAt}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Más acciones para ${fullName}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {assignment && (
              <DropdownMenuItem onClick={handleViewPlan}>
                <Eye className="mr-2 size-4" />
                Ver planificación
              </DropdownMenuItem>
            )}
            {showAssign && (
              <DropdownMenuItem onClick={handleAssign}>
                <Users className="mr-2 size-4" />
                Asignar planificación
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
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
  const updateSchedule = useMutation(api.classSchedules.update);

  const canQueryOrgData = useCanQueryCurrentOrganization();
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQueryOrgData ? {} : "skip",
  );
  const staffOptions = useMemo<StaffOption[]>(() => {
    return (memberships ?? [])
      .filter((m) => isOrgStaffRole(m.role))
      .map((m) => ({
        userId: m.userId,
        fullName:
          m.fullName ||
          [m.firstName, m.lastName].filter(Boolean).join(" ") ||
          m.email ||
          m.userId,
        email: m.email,
        role: m.role,
      }));
  }, [memberships]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inChargeSaving, setInChargeSaving] = useState(false);

  const handleInChargeChange = async (nextUserId: string | null) => {
    setInChargeSaving(true);
    try {
      await updateSchedule({ id: scheduleId, inChargeUserId: nextUserId });
      toast.success("Responsable del turno actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar",
      );
    } finally {
      setInChargeSaving(false);
    }
  };
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

  const countByStatus: Record<string, number> = {
    confirmed: confirmedCount,
    attended: attendedCount,
    no_show: noShowCount,
    cancelled: reservations
      ? reservations.filter(
          (r: Doc<"classReservations">) => r.status === "cancelled",
        ).length
      : 0,
  };

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

  const isPastClass = schedule ? schedule.startTime < Date.now() : false;
  const isCancelled = schedule?.status === "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl">
        {!schedule || !reservations ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Detalle del turno</DialogTitle>
              <DialogDescription>Cargando el turno.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-32 rounded-lg" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-1 border-b p-5 pr-12 text-left">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate">
                  {schedule.class?.name ?? "Turno"}
                </DialogTitle>
                <ClassStatusBadge status={schedule.status} />
              </div>
              <DialogDescription className="first-letter:uppercase">
                {format(new Date(schedule.startTime), "EEEE d 'de' MMMM", {
                  locale: es,
                })}{" "}
                · {format(new Date(schedule.startTime), "HH:mm")}–
                {format(new Date(schedule.endTime), "HH:mm")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Reservas</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {schedule.currentReservations}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{schedule.capacity}
                    </span>
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        schedule.currentReservations >= schedule.capacity
                          ? "bg-red-500"
                          : schedule.currentReservations / schedule.capacity >
                              0.6
                            ? "bg-amber-500"
                            : "bg-emerald-500",
                      )}
                      style={{
                        width: `${
                          schedule.capacity > 0
                            ? Math.min(
                                (schedule.currentReservations /
                                  schedule.capacity) *
                                  100,
                                100,
                              )
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Asistieron
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {attendedCount}
                  </p>
                </div>
                <div className="rounded-lg border px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-red-500" />
                    Ausentes
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {noShowCount}
                  </p>
                </div>
              </div>

              {!isCancelled && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">A cargo</p>
                  <StaffSelect
                    staff={staffOptions}
                    value={schedule.inChargeUserId ?? null}
                    onChange={(next) => void handleInChargeChange(next)}
                    placeholder="Sin asignar"
                    noneLabel="Sin asignar"
                    disabled={inChargeSaving}
                    className="sm:w-64"
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Reservas</h3>
                  {isPastClass && confirmedCount > 0 && !isCancelled && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {confirmedCount} sin marcar asistencia
                    </span>
                  )}
                </div>

                {reservations.length > 0 && (
                  <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {RESERVATION_FILTERS.filter(
                      (f) => f.value === "all" || countByStatus[f.value] > 0,
                    ).map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        aria-pressed={statusFilter === f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                          statusFilter === f.value
                            ? "border-foreground bg-foreground text-background"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                      >
                        {f.label}
                        <span className="tabular-nums opacity-60">
                          {f.value === "all"
                            ? reservations.length
                            : countByStatus[f.value]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {filteredReservations.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {reservations.length === 0
                      ? "Todavía nadie reservó este turno."
                      : "No hay reservas con este estado."}
                  </div>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {filteredReservations.map(
                      (reservation: ReservationWithUser) => (
                        <ReservationRow
                          key={reservation._id}
                          reservation={reservation}
                          isPastClass={isPastClass}
                          actionLoading={actionLoading}
                          handleCheckIn={handleCheckIn}
                          handleMarkNoShow={handleMarkNoShow}
                        />
                      ),
                    )}
                  </ul>
                )}
              </div>
            </div>

            {!isCancelled && (
              <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleRequestCancelOrRemove("remove")}
                  disabled={isRemoving}
                >
                  <Trash2 className="mr-1.5 size-4" aria-hidden />
                  Eliminar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRequestCancelOrRemove("cancel")}
                  disabled={isRemoving}
                >
                  <Ban className="mr-1.5 size-4" aria-hidden />
                  {isRemoving ? "Procesando..." : "Cancelar turno"}
                </Button>
              </div>
            )}
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
        <AlertDialogContent className="w-[calc(100%-1.5rem)] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmAction === "cancel" ? "Cancelar turno" : "Eliminar turno"}
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
                      <strong>{attendedCount} asistencias registradas</strong>{" "}
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
