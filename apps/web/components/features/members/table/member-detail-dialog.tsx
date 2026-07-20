"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/shared/badges/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { Member } from "@repo/core";

import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Trash2,
  CalendarDays,
  CalendarClock,
  List,
  CalendarPlus,
  Wallet,
  CreditCard,
  RefreshCw,
  UserMinus,
} from "lucide-react";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import PlanCalendar from "@/components/ui/plancalendar";
import StaffSelect, {
  type StaffOption,
} from "@/components/features/team/staff-select";
import { isOrgStaffRole } from "@/lib/security/roles";

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

type Props = {
  member: Member | null;
  open: boolean;
  onClose: () => void;
};

function safeDate(value: any): Date | null {
  if (!value) return null;

  // Parse "yyyy-MM-dd" as local date to avoid UTC offset shifting the day
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getPlanStatus(assignment: {
  startDate?: number | string | null;
  endDate?: number | string | null;
}) {
  const start = safeDate(assignment.startDate);
  const end = safeDate(assignment.endDate);

  if (!start || !end) return null;

  const now = new Date();

  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

  if (end <= now) {
    return {
      status: "expired" as const,
      daysLeft: 0,
    };
  }

  if (start > now) {
    return {
      status: "not_started" as const,
      daysLeft: diffDays(now, end),
    };
  }

  const daysLeft = Math.max(diffDays(now, end), 0);

  if (daysLeft <= 5) {
    return {
      status: "expiring_soon" as const,
      daysLeft,
    };
  }

  return {
    status: "active" as const,
    daysLeft,
  };
}

function formatArs(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function billingPeriodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es });
}

function getCuotaBadge(
  currentPeriod: { status: string; dueAt?: number | null },
  memberStatus: string,
) {
  if (memberStatus === "suspended") {
    return {
      label: "Suspendida",
      className: "bg-red-500/20 text-red-400 border border-red-500/40",
    };
  }
  if (currentPeriod.status === "approved") {
    return {
      label: "Al día",
      className: "bg-green-500/20 text-green-400 border border-green-500/40",
    };
  }
  if (currentPeriod.status === "in_review") {
    return {
      label: "En revisión",
      className: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
    };
  }
  const overdue =
    typeof currentPeriod.dueAt === "number" && Date.now() > currentPeriod.dueAt;
  return overdue
    ? {
        label: "Vencida",
        className: "bg-red-500/20 text-red-400 border border-red-500/40",
      }
    : {
        label: "Pendiente",
        className:
          "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
      };
}

const UNLIMITED_WEEKLY_CLASS_LIMIT = 9999;

export default function MemberDetailDialog({ member, open, onClose }: Props) {
  const router = useRouter();

  const [addFixedSlotOpen, setAddFixedSlotOpen] = useState(false);
  const [planViewMode, setPlanViewMode] = useState<"calendar" | "summary">(
    "calendar",
  );
  const [assignPlanOpen, setAssignPlanOpen] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState<Id<"planifications"> | "">(
    "",
  );
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendEndDate, setExtendEndDate] = useState("");
  const [extendAssignmentId, setExtendAssignmentId] =
    useState<Id<"planificationAssignments"> | "">("");

  // Membership / cuota
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">(
    "cash",
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [membershipPlanOpen, setMembershipPlanOpen] = useState(false);
  const [membershipPlanMode, setMembershipPlanMode] = useState<
    "assign" | "change"
  >("assign");
  const [selectedMembershipPlanId, setSelectedMembershipPlanId] = useState<
    Id<"membershipPlans"> | ""
  >("");
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState({
    memberId: "",
    index: 0,
  });
  const [addClassId, setAddClassId] = useState<Id<"classes"> | "">("");
  const [addDayOfWeek, setAddDayOfWeek] = useState<number>(1);
  const [addHour, setAddHour] = useState(9);
  const [addMinute, setAddMinute] = useState(0);
  const [usesPlanificationOverride, setUsesPlanificationOverride] = useState<{
    memberId: string;
    value: boolean;
  } | null>(null);
  const [responsibleOverride, setResponsibleOverride] = useState<{
    memberId: string;
    value: string | null;
  } | null>(null);

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    member && open ? {} : "skip",
  );

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    member && open ? { userId: member.id } : "skip",
  );

  const fixedSlots = useQuery(
    api.fixedClassSlots.listByUser,
    member && open ? { userId: member.id } : "skip",
  );

  const classes = useQuery(api.classes.getByOrganization, {
    activeOnly: false,
  });

  const planifications = useQuery(
    api.planifications.getByOrganization,
    member && open ? {} : "skip",
  );

  // Membership + cuota are derived from already-deployed org-wide queries so the
  // screen works without pushing a dedicated backend function.
  const orgSubscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    member && open ? {} : "skip",
  );

  const orgPayments = useQuery(
    api.planPayments.getByOrganization,
    member && open ? {} : "skip",
  );

  const financeSummary = useMemo(() => {
    if (!member) return undefined;
    if (orgSubscriptions === undefined) return undefined;

    const sub = orgSubscriptions.find(
      (s) => s.userId === member.id && s.status !== "cancelled",
    );
    if (!sub || !sub.plan) return null;

    const billingSubscriptionId = sub.billingSubscriptionId ?? sub._id;
    const now = new Date();
    const billingPeriod = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}`;

    const currentPayment = (orgPayments ?? [])
      .filter(
        (p) =>
          p.subscriptionId === billingSubscriptionId &&
          p.billingPeriod === billingPeriod,
      )
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

    const coveredMemberCount = sub.coveredMemberCount ?? 1;

    return {
      subscriptionId: billingSubscriptionId,
      memberStatus: sub.status,
      activatedAt: sub.activatedAt,
      isFamilyChild: Boolean(sub.familyParentSubscriptionId),
      coveredMemberCount,
      plan: {
        _id: sub.planId,
        name: sub.plan.name,
        weeklyClassLimit: sub.plan.weeklyClassLimit,
      },
      currentPeriod: {
        billingPeriod,
        dueAt: currentPayment?.dueAt ?? null,
        status: currentPayment?.status ?? "none",
        payableAmountArs:
          sub.payableAmountArs ?? sub.plan.priceArs * coveredMemberCount,
      },
    };
  }, [member, orgSubscriptions, orgPayments]);

  const membershipPlans = useQuery(
    api.membershipPlans.getByOrganization,
    member && open ? { activeOnly: true } : "skip",
  );

  const assignablePlanifications = useMemo(
    () =>
      ((planifications ?? []) as Doc<"planifications">[]).filter(
        (p) => !p.isTemplate,
      ),
    [planifications],
  );

  const assignPlanification = useMutation(api.planificationAssignments.assign);
  const extendPlanification = useMutation(api.planificationAssignments.extend);
  const recordPayment = useMutation(api.planPayments.recordPayment);
  const assignPlanToMember = useMutation(
    api.memberPlanSubscriptions.assignToMember,
  );
  const cancelSubscription = useMutation(api.memberPlanSubscriptions.cancel);
  const createFixedSlot = useMutation(api.fixedClassSlots.create);
  const removeFixedSlot = useMutation(api.fixedClassSlots.remove);
  const setMemberUsesPlanification = useMutation(
    api.organizationMemberships.setMemberUsesPlanification,
  );
  const setMemberResponsible = useMutation(
    api.organizationMemberships.setMemberResponsible,
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

  type AssignmentWithPlanification = Doc<"planificationAssignments"> & {
    planification?: { _id: Id<"planifications">; name?: string } | null;
  };

  const visibleAssignments = useMemo(() => {
    const list = ((assignments ?? []) as AssignmentWithPlanification[]).filter(
      (a) => a.status !== "cancelled",
    );

    const getStartTime = (assignment: AssignmentWithPlanification) =>
      safeDate(assignment.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const getEndTime = (assignment: AssignmentWithPlanification) =>
      safeDate(assignment.endDate)?.getTime() ?? 0;
    const isCurrent = (assignment: AssignmentWithPlanification) => {
      const status = getPlanStatus(assignment)?.status;
      return status === "active" || status === "expiring_soon";
    };

    const current = list
      .filter(isCurrent)
      .sort((a, b) => getStartTime(b) - getStartTime(a));
    const upcoming = list
      .filter((a) => getPlanStatus(a)?.status === "not_started")
      .sort((a, b) => getStartTime(a) - getStartTime(b));
    const previous = list
      .filter((a) => getPlanStatus(a)?.status === "expired")
      .sort((a, b) => getEndTime(b) - getEndTime(a));
    const withoutDates = list
      .filter((a) => getPlanStatus(a) == null)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    if (current.length > 0) {
      return [...previous, ...withoutDates, ...current, ...upcoming];
    }

    return [...previous, ...withoutDates, ...upcoming];
  }, [assignments]);

  const defaultAssignmentIndex = Math.max(
    visibleAssignments.findIndex((a) => {
      const status = getPlanStatus(a)?.status;
      return status === "active" || status === "expiring_soon";
    }),
    0,
  );
  const selectedAssignmentIndex =
    selectedAssignment.memberId === member?.id &&
    selectedAssignment.index < visibleAssignments.length
      ? selectedAssignment.index
      : defaultAssignmentIndex;
  const assignment = visibleAssignments[selectedAssignmentIndex] ?? null;

  // "Extender" always acts on the member's current plan, regardless of which
  // block is being viewed: the active/expiring one, or — if none is active —
  // the most recently expired one (extending it brings it back to active).
  const currentPlanAssignment =
    visibleAssignments.find((a) => {
      const status = getPlanStatus(a)?.status;
      return status === "active" || status === "expiring_soon";
    }) ??
    visibleAssignments
      .filter((a) => getPlanStatus(a)?.status === "expired")
      .sort(
        (a, b) =>
          (safeDate(b.endDate)?.getTime() ?? 0) -
          (safeDate(a.endDate)?.getTime() ?? 0),
      )[0] ??
    null;

  if (!member) return null;

  const usesPlanification =
    usesPlanificationOverride?.memberId === member.id
      ? usesPlanificationOverride.value
      : (member.usesPlanification ?? true);

  const responsibleUserId =
    responsibleOverride?.memberId === member.id
      ? responsibleOverride.value
      : (member.responsibleUserId ?? null);

  const handleResponsibleChange = async (nextResponsible: string | null) => {
    if (!member) return;
    const previous = responsibleUserId;
    if (previous === nextResponsible) return;

    setResponsibleOverride({ memberId: member.id, value: nextResponsible });
    try {
      await setMemberResponsible({
        userId: member.id,
        responsibleUserId: nextResponsible,
      });
      toast.success(
        nextResponsible ? "Responsable asignado" : "Responsable quitado",
      );
    } catch (e: unknown) {
      setResponsibleOverride({ memberId: member.id, value: previous });
      toast.error(
        e instanceof Error ? e.message : "Error al asignar responsable",
      );
    }
  };

  const initials =
    member.fullName
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    "?";

  const handleViewPlan = () => {
    if (!assignment?.planification?._id) return;
    router.push(`/dashboard/planifications/${assignment.planification._id}`);
  };

  const toDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

  const handleOpenAssignPlan = () => {
    // Suggest the day after the current plan ends, so a new block picks up
    // where the active one leaves off.
    const suggestedStart = activeEndDate
      ? new Date(activeEndDate.getTime() + 24 * 60 * 60 * 1000)
      : new Date();
    setAssignStartDate(toDateInputValue(suggestedStart));
    setAssignEndDate("");
    setAssignPlanId("");
    setAssignPlanOpen(true);
  };

  const handleAssignPlanification = async () => {
    if (!assignPlanId) {
      toast.error("Seleccioná una planificación");
      return;
    }

    try {
      await assignPlanification({
        planificationId: assignPlanId as Id<"planifications">,
        userId: member.id,
        startDate: assignStartDate
          ? new Date(`${assignStartDate}T00:00:00`).getTime()
          : undefined,
        endDate: assignEndDate
          ? new Date(`${assignEndDate}T00:00:00`).getTime()
          : undefined,
      });

      toast.success("Planificación asignada");
      setAssignPlanOpen(false);
      setAssignPlanId("");
      setAssignStartDate("");
      setAssignEndDate("");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al asignar planificación",
      );
    }
  };

  const handleOpenExtendPlan = () => {
    if (!currentPlanAssignment) return;
    // Pre-fill 30 days past the current end (or from today if it has no end yet).
    const currentEnd = safeDate(currentPlanAssignment.endDate);
    const base = currentEnd ?? new Date();
    const suggestedEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    setExtendAssignmentId(currentPlanAssignment._id);
    setExtendEndDate(toDateInputValue(suggestedEnd));
    setExtendOpen(true);
  };

  const handleExtendPlanification = async () => {
    if (!extendAssignmentId) return;
    if (!extendEndDate) {
      toast.error("Seleccioná una fecha de fin");
      return;
    }

    try {
      await extendPlanification({
        id: extendAssignmentId,
        endDate: new Date(`${extendEndDate}T00:00:00`).getTime(),
      });

      toast.success("Planificación extendida");
      setExtendOpen(false);
      setExtendAssignmentId("");
      setExtendEndDate("");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al extender la planificación",
      );
    }
  };

  const handleOpenRecordPayment = () => {
    if (!financeSummary) return;
    setPaymentMethod("cash");
    setPaymentAmount(String(financeSummary.currentPeriod.payableAmountArs));
    setRecordPaymentOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!financeSummary) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setMembershipBusy(true);
    try {
      await recordPayment({
        subscriptionId: financeSummary.subscriptionId,
        billingPeriod: financeSummary.currentPeriod.billingPeriod,
        paymentMethod,
        amountArs: amount,
      });
      toast.success("Pago registrado");
      setRecordPaymentOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al registrar el pago");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleOpenMembershipPlan = (mode: "assign" | "change") => {
    setMembershipPlanMode(mode);
    setSelectedMembershipPlanId(
      mode === "change" ? (financeSummary?.plan._id ?? "") : "",
    );
    setMembershipPlanOpen(true);
  };

  const handleSaveMembershipPlan = async () => {
    if (!selectedMembershipPlanId) {
      toast.error("Seleccioná un plan");
      return;
    }
    setMembershipBusy(true);
    try {
      // Changing plans = cancel the current subscription, then assign the new
      // one (mirrors how the member-facing changePlan flow works).
      if (membershipPlanMode === "change" && financeSummary) {
        if (selectedMembershipPlanId === financeSummary.plan._id) {
          toast.error("El miembro ya tiene ese plan");
          setMembershipBusy(false);
          return;
        }
        await cancelSubscription({
          subscriptionId: financeSummary.subscriptionId,
        });
      }
      await assignPlanToMember({
        userId: member.id,
        planId: selectedMembershipPlanId as Id<"membershipPlans">,
      });
      toast.success(
        membershipPlanMode === "change" ? "Plan cambiado" : "Plan asignado",
      );
      setMembershipPlanOpen(false);
      setSelectedMembershipPlanId("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar el plan");
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleRemovePlan = async () => {
    if (!financeSummary) return;
    if (
      !window.confirm(
        "¿Quitar el plan de membresía de este miembro? Se cancelará su suscripción.",
      )
    ) {
      return;
    }
    setMembershipBusy(true);
    try {
      await cancelSubscription({ subscriptionId: financeSummary.subscriptionId });
      toast.success("Plan quitado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al quitar el plan");
    } finally {
      setMembershipBusy(false);
    }
  };

  const goToPreviousAssignment = () => {
    if (selectedAssignmentIndex <= 0) return;
    setSelectedAssignment({
      memberId: member.id,
      index: selectedAssignmentIndex - 1,
    });
  };

  const goToNextAssignment = () => {
    if (selectedAssignmentIndex >= visibleAssignments.length - 1) return;
    setSelectedAssignment({
      memberId: member.id,
      index: selectedAssignmentIndex + 1,
    });
  };

  const handleAddFixedSlot = async () => {
    if (!addClassId) {
      toast.error("Seleccioná una clase");
      return;
    }

    const startTimeMinutes = addHour * 60 + addMinute;
    const timezone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined;

    try {
      await createFixedSlot({
        userId: member.id,
        classId: addClassId as Id<"classes">,
        dayOfWeek: addDayOfWeek,
        startTimeMinutes,
        timezone,
      });

      toast.success("Turno fijo agregado");
      setAddFixedSlotOpen(false);
      setAddClassId("");
      setAddDayOfWeek(1);
      setAddHour(9);
      setAddMinute(0);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al agregar turno fijo",
      );
    }
  };

  const handleRemoveFixedSlot = async (id: Id<"fixedClassSlots">) => {
    try {
      await removeFixedSlot({ id });
      toast.success("Turno fijo eliminado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const handleUsesPlanificationChange = async (usesPlanification: boolean) => {
    const currentUsesPlanification =
      usesPlanificationOverride?.memberId === member.id
        ? usesPlanificationOverride.value
        : (member.usesPlanification ?? true);
    if (currentUsesPlanification === usesPlanification) return;

    try {
      await setMemberUsesPlanification({
        userId: member.id,
        usesPlanification,
      });
      setUsesPlanificationOverride({
        memberId: member.id,
        value: usesPlanification,
      });
      toast.success(
        usesPlanification
          ? "El miembro usa planificación"
          : "El miembro no utilizara planificacion.",
      );
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Error al actualizar planificación del miembro",
      );
    }
  };

  const formatSlotTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const birthDate = safeDate(member.birthday);

  const age = (() => {
    if (!birthDate) return null;
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();

    const hasHadBirthdayThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate());

    if (!hasHadBirthdayThisYear) years--;
    return years;
  })();

  const activeAssignment =
    visibleAssignments.find((a) => {
      const status = getPlanStatus(a)?.status;
      return status === "active" || status === "expiring_soon";
    }) ?? null;
  const planStatus = assignment ? getPlanStatus(assignment) : null;
  const activePlanStatus = activeAssignment
    ? getPlanStatus(activeAssignment)
    : null;
  const selectedStartDate = assignment ? safeDate(assignment.startDate) : null;
  const selectedEndDate = assignment ? safeDate(assignment.endDate) : null;
  const activeEndDate = activeAssignment
    ? safeDate(activeAssignment.endDate)
    : null;
  const hasCurrentActiveAssignment =
    activeAssignment != null && activePlanStatus?.status !== "expired";
  const showAssignButton =
    assignments !== undefined &&
    (!activeAssignment || activePlanStatus?.status === "expired");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="top-[max(1rem,env(safe-area-inset-top))] max-h-[88vh] w-[min(96vw,32rem)] translate-y-0 overflow-y-auto rounded-lg p-4 pt-8 sm:top-[50%] sm:max-h-[90vh] sm:w-full sm:max-w-5xl sm:translate-y-[-50%] sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Detalle del miembro</DialogTitle>
        </DialogHeader>

        {/* MEMBERSHIP & CUOTA */}
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Membresía y cuota</span>
            </div>
            {financeSummary && (
              <span className="truncate text-xs text-muted-foreground">
                Plan · {financeSummary.plan.name}
              </span>
            )}
          </div>

          {financeSummary === undefined ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : financeSummary === null ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Este miembro no tiene un plan de membresía asignado.
              </p>
              <Button
                size="sm"
                onClick={() => handleOpenMembershipPlan("assign")}
                disabled={membershipBusy}
              >
                <CreditCard className="mr-1 h-4 w-4" />
                Asignar plan
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Cuota{" "}
                    {billingPeriodLabel(
                      financeSummary.currentPeriod.billingPeriod,
                    )}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {formatArs(financeSummary.currentPeriod.payableAmountArs)}
                  </p>
                  {(() => {
                    const cuota = getCuotaBadge(
                      financeSummary.currentPeriod,
                      financeSummary.memberStatus,
                    );
                    return (
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${cuota.className}`}
                      >
                        {cuota.label}
                        {financeSummary.currentPeriod.dueAt
                          ? ` · vence ${format(
                              new Date(financeSummary.currentPeriod.dueAt),
                              "d MMM",
                              { locale: es },
                            )}`
                          : ""}
                      </span>
                    );
                  })()}
                </div>

                <div className="rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">Suscripción</p>
                  <p
                    className={`mt-0.5 text-lg font-semibold ${
                      financeSummary.memberStatus === "active"
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {financeSummary.memberStatus === "active"
                      ? "Activa"
                      : "Suspendida"}
                  </p>
                  <span className="mt-1 inline-block text-[11px] text-muted-foreground">
                    Desde{" "}
                    {format(
                      new Date(financeSummary.activatedAt),
                      "d MMM yyyy",
                      { locale: es },
                    )}
                  </span>
                </div>

                <div className="rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Clases del plan
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {financeSummary.plan.weeklyClassLimit >=
                    UNLIMITED_WEEKLY_CLASS_LIMIT
                      ? "Ilimitadas"
                      : `${financeSummary.plan.weeklyClassLimit} / semana`}
                  </p>
                  {financeSummary.coveredMemberCount > 1 && (
                    <span className="mt-1 inline-block text-[11px] text-muted-foreground">
                      Grupo familiar · {financeSummary.coveredMemberCount}{" "}
                      miembros
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleOpenRecordPayment}
                  disabled={membershipBusy}
                >
                  <CreditCard className="mr-1 h-4 w-4" />
                  Registrar pago
                </Button>

                {financeSummary.isFamilyChild ||
                financeSummary.coveredMemberCount > 1 ? (
                  <span className="self-center text-xs text-muted-foreground">
                    Plan familiar · gestioná el plan desde finanzas
                  </span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenMembershipPlan("change")}
                      disabled={membershipBusy}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      Cambiar plan
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={handleRemovePlan}
                      disabled={membershipBusy}
                    >
                      <UserMinus className="mr-1 h-4 w-4" />
                      Quitar plan
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
          {/* LEFT */}
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16">
                {member.imageUrl && <AvatarImage src={member.imageUrl} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold sm:text-xl">
                  {member.name}
                </p>

                {member.email && (
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email}
                  </p>
                )}

                {member.username && (
                  <p className="text-xs text-muted-foreground">
                    @{member.username}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Estado</p>
                <StatusBadge
                  status={
                    member.status?.toLowerCase() === "activo"
                      ? "active"
                      : (member.status?.toLowerCase() ?? "inactive")
                  }
                />
              </div>

              <div>
                <p className="text-muted-foreground">Miembro desde</p>
                <p>
                  {safeDate(member.joinedAt)
                    ? format(safeDate(member.joinedAt)!, "d MMM yyyy", {
                        locale: es,
                      })
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Fecha de nacimiento</p>
                <p>
                  {birthDate && age !== null
                    ? `${format(birthDate, "dd/MM/yyyy")} (${age} años)`
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p>{member.phone ?? "-"}</p>
              </div>

              <div>
                <p className="text-muted-foreground">Usa planificación</p>
                <div className="mt-1 inline-flex rounded-md border bg-background p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={usesPlanification ? "default" : "ghost"}
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      void handleUsesPlanificationChange(true);
                    }}
                  >
                    Si
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!usesPlanification ? "default" : "ghost"}
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      void handleUsesPlanificationChange(false);
                    }}
                  >
                    No
                  </Button>
                </div>
              </div>
            </div>

            {/* RESPONSABLE */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Responsable</p>
              <StaffSelect
                staff={staffOptions}
                value={responsibleUserId}
                onChange={(next) => void handleResponsibleChange(next)}
                placeholder="Asignar responsable…"
                noneLabel="Sin responsable"
              />
              <p className="text-xs text-muted-foreground">
                Encargado de mantener la planificación al día.
              </p>
            </div>

            {/* TURNOS */}
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Turnos fijos</p>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 self-start sm:self-auto"
                  onClick={() => setAddFixedSlotOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Agregar turno fijo
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                {fixedSlots === undefined ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : fixedSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin turnos fijos. El miembro se agregará automáticamente a
                    cada clase que coincida con el horario asignado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {fixedSlots.length} turno
                      {fixedSlots.length === 1 ? "" : "s"}
                    </p>

                    <div className="h-[108px] overflow-y-auto pr-1 sm:pr-2">
                      <ul className="space-y-1.5">
                        {fixedSlots.map(
                          (
                            slot: Doc<"fixedClassSlots"> & {
                              className?: string | null;
                            },
                          ) => (
                            <li
                              key={slot._id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2 text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium leading-none">
                                  {slot.className ?? "-"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {DAYS_OF_WEEK.find(
                                    (d) => d.value === slot.dayOfWeek,
                                  )?.label ?? slot.dayOfWeek}{" "}
                                  {formatSlotTime(slot.startTimeMinutes)}
                                </p>
                              </div>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 shrink-0 p-0 text-destructive/80 hover:text-destructive"
                                onClick={() => handleRemoveFixedSlot(slot._id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-4 rounded-lg border p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                {assignments === undefined ? (
                  <div className="text-sm text-muted-foreground">
                    Cargando planificaciones...
                  </div>
                ) : assignment ? (
                  <>
                    <div className="flex min-w-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={goToPreviousAssignment}
                        disabled={selectedAssignmentIndex <= 0}
                        aria-label="Planificación anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          {assignment.planification?.name ??
                            "Planificación sin nombre"}
                        </div>
                        {visibleAssignments.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            {selectedAssignmentIndex + 1} de{" "}
                            {visibleAssignments.length} asignadas
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={goToNextAssignment}
                        disabled={
                          selectedAssignmentIndex >=
                          visibleAssignments.length - 1
                        }
                        aria-label="Planificación siguiente"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {hasCurrentActiveAssignment &&
                    assignment._id !== activeAssignment?._id &&
                    planStatus?.status === "expired" ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">Anterior</Badge>
                      </div>
                    ) : hasCurrentActiveAssignment &&
                      assignment._id !== activeAssignment?._id &&
                      planStatus?.status === "not_started" ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">Próxima</Badge>
                      </div>
                    ) : assignment.status === "completed" ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">Completada</Badge>
                      </div>
                    ) : (
                      planStatus && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {planStatus.status === "active" && (
                            <>
                              <Badge className="bg-green-500/20 text-green-400 border border-green-500/40">
                                Activa
                              </Badge>
                              <Badge variant="secondary">
                                {planStatus.daysLeft} día
                                {planStatus.daysLeft !== 1 && "s"} restantes
                              </Badge>
                            </>
                          )}

                          {planStatus.status === "expiring_soon" && (
                            <>
                              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                                Por vencer
                              </Badge>
                              <Badge variant="secondary">
                                {planStatus.daysLeft} día
                                {planStatus.daysLeft !== 1 && "s"} restantes
                              </Badge>
                            </>
                          )}

                          {planStatus.status === "expired" && (
                            <Badge className="bg-red-500/20 text-red-400 border border-red-500/40">
                              Vencida
                            </Badge>
                          )}

                          {planStatus.status === "not_started" && (
                            <Badge variant="secondary">No iniciada</Badge>
                          )}
                        </div>
                      )
                    )}
                  </>
                ) : (
                  <Badge variant="secondary">Sin planificación</Badge>
                )}
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                {selectedStartDate && selectedEndDate && (
                  <div className="inline-flex self-start rounded-md border bg-background p-0.5 sm:self-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        planViewMode === "calendar" ? "default" : "ghost"
                      }
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setPlanViewMode("calendar")}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Calendario
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={planViewMode === "summary" ? "default" : "ghost"}
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setPlanViewMode("summary")}
                    >
                      <List className="h-3.5 w-3.5" />
                      Resumen
                    </Button>
                  </div>
                )}

                {assignment && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleViewPlan}
                    className="w-full sm:w-auto"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                )}

                {currentPlanAssignment && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenExtendPlan}
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <CalendarClock className="h-4 w-4" />
                    Extender
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAssignPlan}
                  className="flex w-full items-center gap-2 sm:w-auto"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Asignar
                </Button>
              </div>
            </div>

            <div className="flex min-h-[200px] flex-1 items-start justify-center overflow-x-auto rounded-md bg-muted/20 p-2 sm:min-h-[220px] sm:p-3">
              {selectedStartDate && selectedEndDate ? (
                planViewMode === "calendar" ? (
                  <PlanCalendar
                    key={assignment?._id}
                    startDate={selectedStartDate}
                    endDate={selectedEndDate}
                  />
                ) : (
                  <div className="w-full space-y-2 self-stretch">
                    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Inicio</span>
                      <span className="font-medium">
                        {format(selectedStartDate, "d MMM yyyy", { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Fin</span>
                      <span className="font-medium">
                        {format(selectedEndDate, "d MMM yyyy", { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Estado</span>
                      <span className="font-medium">
                        {planStatus?.status === "active"
                          ? `Activa · ${planStatus.daysLeft} día${planStatus.daysLeft !== 1 ? "s" : ""} restantes`
                          : planStatus?.status === "expiring_soon"
                            ? `Por vencer · ${planStatus.daysLeft} día${planStatus.daysLeft !== 1 ? "s" : ""}`
                            : planStatus?.status === "expired"
                              ? "Vencida"
                              : planStatus?.status === "not_started"
                                ? "No iniciada"
                                : "-"}
                      </span>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground">
                  Sin planificación activa
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* ADD FIXED SLOT DIALOG */}
      <Dialog open={addFixedSlotOpen} onOpenChange={setAddFixedSlotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar turno fijo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Clase</Label>
              <Select
                value={addClassId}
                onValueChange={(v) => setAddClassId(v as Id<"classes">)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar clase" />
                </SelectTrigger>

                <SelectContent>
                  {classes?.map((c: Doc<"classes">) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Día</Label>
              <Select
                value={String(addDayOfWeek)}
                onValueChange={(v) => setAddDayOfWeek(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora</Label>
                <Select
                  value={String(addHour)}
                  onValueChange={(v) => setAddHour(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i.toString().padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Minutos</Label>
                <Select
                  value={String(addMinute)}
                  onValueChange={(v) => setAddMinute(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {[0, 15, 30, 45].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        :{m.toString().padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAddFixedSlotOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleAddFixedSlot}>Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ASSIGN PLANIFICATION DIALOG */}
      <Dialog open={assignPlanOpen} onOpenChange={setAssignPlanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Asignar planificación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Planificación</Label>
              <Select
                value={assignPlanId}
                onValueChange={(v) =>
                  setAssignPlanId(v as Id<"planifications">)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar planificación" />
                </SelectTrigger>

                <SelectContent>
                  {assignablePlanifications.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No hay planificaciones disponibles
                    </div>
                  ) : (
                    assignablePlanifications.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={assignEndDate}
                  onChange={(e) => setAssignEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAssignPlanOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleAssignPlanification}>Asignar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EXTEND PLANIFICATION DIALOG */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
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
              <Button variant="outline" onClick={() => setExtendOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleExtendPlanification}>Extender</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* RECORD PAYMENT DIALOG */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {financeSummary && (
              <p className="text-sm text-muted-foreground">
                Cuota de{" "}
                {billingPeriodLabel(financeSummary.currentPeriod.billingPeriod)}
                {financeSummary.coveredMemberCount > 1
                  ? ` · ${financeSummary.coveredMemberCount} miembros`
                  : ""}
              </p>
            )}

            <div className="space-y-2">
              <Label>Método</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(v as "cash" | "bank_transfer")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="bank_transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Monto (ARS)</Label>
              <Input
                type="number"
                min={0}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setRecordPaymentOpen(false)}
                disabled={membershipBusy}
              >
                Cancelar
              </Button>
              <Button onClick={handleRecordPayment} disabled={membershipBusy}>
                Registrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ASSIGN / CHANGE MEMBERSHIP PLAN DIALOG */}
      <Dialog open={membershipPlanOpen} onOpenChange={setMembershipPlanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {membershipPlanMode === "change"
                ? "Cambiar plan"
                : "Asignar plan"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Plan de membresía</Label>
              <Select
                value={selectedMembershipPlanId}
                onValueChange={(v) =>
                  setSelectedMembershipPlanId(v as Id<"membershipPlans">)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  {(membershipPlans ?? []).length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No hay planes disponibles
                    </div>
                  ) : (
                    (membershipPlans ?? []).map((p: Doc<"membershipPlans">) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} · {formatArs(p.priceArs)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {membershipPlanMode === "change" && (
              <p className="text-xs text-muted-foreground">
                Se cancelará la suscripción actual y se asignará el nuevo plan.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setMembershipPlanOpen(false)}
                disabled={membershipBusy}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveMembershipPlan}
                disabled={membershipBusy}
              >
                {membershipPlanMode === "change" ? "Cambiar" : "Asignar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
