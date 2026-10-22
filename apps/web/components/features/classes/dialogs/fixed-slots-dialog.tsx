"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mapMembershipsToMembers } from "@repo/core/utils";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

const DAYS_OF_WEEK = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

/** Monday-first initials for the day chips. */
const DAY_CHIPS = [
  { value: 1, short: "L" },
  { value: 2, short: "M" },
  { value: 3, short: "M" },
  { value: 4, short: "J" },
  { value: 5, short: "V" },
  { value: 6, short: "S" },
  { value: 0, short: "D" },
];

type FixedSlotRow = Doc<"fixedClassSlots"> & {
  className: string | null;
  userFullName: string;
};

/** One member on one class at one time, across every weekday they come. */
type FixedSlotGroup = {
  key: string;
  userName: string;
  className: string;
  startTimeMinutes: number;
  slots: FixedSlotRow[];
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

const normalize = (v?: string) =>
  v
    ?.toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";

function formatSlotTime(startTimeMinutes: number) {
  const h = Math.floor(startTimeMinutes / 60);
  const m = startTimeMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function FixedSlotsDialog({ open, onOpenChange }: Props) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [studentNameFilter, setStudentNameFilter] = useState("");
  const deferredStudentNameFilter = useDeferredValue(studentNameFilter);
  const [addOpen, setAddOpen] = useState(false);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [addClassId, setAddClassId] = useState<Id<"classes"> | "">("");
  const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([1]);
  const [addHour, setAddHour] = useState(9);
  const [addMinute, setAddMinute] = useState(0);

  const fixedSlots = useQuery(
    api.fixedClassSlots.listByOrganizationAndClass,
    open && canQueryCurrentOrganization
      ? {
          classId:
            classFilter === "all" ? undefined : (classFilter as Id<"classes">),
        }
      : "skip",
  );
  const classes = useQuery(
    api.classes.getByOrganization,
    open && canQueryCurrentOrganization ? { activeOnly: false } : "skip",
  );
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQueryCurrentOrganization ? {} : "skip",
  );
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    open && canQueryCurrentOrganization ? {} : "skip",
  );
  const createFixedSlot = useMutation(api.fixedClassSlots.create);
  const removeFixedSlot = useMutation(api.fixedClassSlots.remove);
  const backfillToExisting = useMutation(
    api.fixedClassSlots.backfillToExistingSchedules,
  );
  const [backfilling, setBackfilling] = useState(false);

  const members = useMemo(
    () =>
      memberships
        ? mapMembershipsToMembers(memberships).filter(
            (m) =>
              normalize(m.role) === "member" || normalize(m.role) === "miembro",
          )
        : [],
    [memberships],
  );

  // Members whose plan does not include the class being assigned. The backend
  // rejects these too; flagging them here avoids a failed bulk add.
  const membersNotAllowedForClass = useMemo(() => {
    const blocked = new Set<string>();
    if (!addClassId || !subscriptions) return blocked;

    for (const sub of subscriptions) {
      if (sub.status === "cancelled") continue;
      if (sub.plan?.classesEnabled === false) {
        blocked.add(sub.userId);
        continue;
      }
      const allowed = sub.plan?.allowedClassIds;
      if (allowed?.length && !allowed.includes(addClassId as Id<"classes">)) {
        blocked.add(sub.userId);
      }
    }
    return blocked;
  }, [subscriptions, addClassId]);

  const filteredFixedSlots = useMemo(() => {
    if (!fixedSlots) return fixedSlots;

    const query = normalize(deferredStudentNameFilter);
    if (!query) return fixedSlots;

    return fixedSlots.filter(
      (
        slot: Doc<"fixedClassSlots"> & {
          className: string | null;
          userFullName: string;
        },
      ) => normalize(slot.userFullName ?? slot.userId).includes(query),
    );
  }, [fixedSlots, deferredStudentNameFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, FixedSlotGroup>();
    for (const slot of (filteredFixedSlots ?? []) as FixedSlotRow[]) {
      const key = `${slot.userId}|${slot.classId}|${slot.startTimeMinutes}`;
      const group = map.get(key) ?? {
        key,
        userName: slot.userFullName ?? slot.userId,
        className: slot.className ?? "Clase",
        startTimeMinutes: slot.startTimeMinutes,
        slots: [],
      };
      group.slots.push(slot);
      map.set(key, group);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.userName.localeCompare(b.userName, "es") ||
        a.startTimeMinutes - b.startTimeMinutes,
    );
  }, [filteredFixedSlots]);

  const [groupToRemove, setGroupToRemove] = useState<FixedSlotGroup | null>(
    null,
  );
  const [removingGroup, setRemovingGroup] = useState(false);

  const handleRemoveGroup = async () => {
    if (!groupToRemove) return;
    setRemovingGroup(true);
    try {
      for (const slot of groupToRemove.slots) {
        await removeFixedSlot({ id: slot._id });
      }
      toast.success("Turno fijo eliminado");
      setGroupToRemove(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setRemovingGroup(false);
    }
  };

  const handleAdd = async () => {
    if (selectedUserIds.length === 0 || !addClassId) {
      toast.error("Seleccioná miembro y clase");
      return;
    }
    if (addDaysOfWeek.length === 0) {
      toast.error("Seleccioná al menos un día");
      return;
    }

    const startTimeMinutes = addHour * 60 + addMinute;
    const timezone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined;

    // One member failing (e.g. their plan doesn't include the class) must not
    // abort the rest of the bulk add.
    let totalCreated = 0;
    const failures: string[] = [];

    for (const userId of selectedUserIds) {
      for (const dayOfWeek of addDaysOfWeek) {
        try {
          await createFixedSlot({
            userId,
            classId: addClassId as Id<"classes">,
            dayOfWeek,
            startTimeMinutes,
            timezone,
          });
          totalCreated += 1;
        } catch (e: unknown) {
          const memberName =
            members.find((m) => m.id === userId)?.name ?? userId;
          const reason =
            e instanceof Error ? e.message : "Error al agregar turno fijo";
          failures.push(`${memberName}: ${reason}`);
        }
      }
    }

    if (totalCreated > 0) {
      toast.success(
        totalCreated === 1
          ? "Turno fijo agregado"
          : `${totalCreated} turnos fijos agregados`,
      );
    }

    if (failures.length > 0) {
      toast.error(failures.join(" · "));
      return;
    }

    setAddOpen(false);
    setSelectedUserIds([]);
    setMemberSearchOpen(false);
    setAddClassId("");
    setAddDaysOfWeek([1]);
    setAddHour(9);
    setAddMinute(0);
  };

  const handleRemove = async (id: Id<"fixedClassSlots">) => {
    try {
      await removeFixedSlot({ id });
      toast.success("Día quitado; se cancelaron sus reservas de ese día");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const timezone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      const result = await backfillToExisting({ timezone });
      toast.success(
        result.processedSlots === 0
          ? "No hay turnos fijos para aplicar"
          : `Se aplicaron los turnos fijos a los horarios existentes (${result.processedSlots} turno${result.processedSlots === 1 ? "" : "s"} fijo${result.processedSlots === 1 ? "" : "s"})`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(90dvh,760px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-1 border-b p-5 pr-12 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <DialogTitle>Turnos fijos</DialogTitle>
                <DialogDescription>
                  Miembros que se reservan solos cada semana.
                </DialogDescription>
              </div>
              <Button
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                Agregar
              </Button>
            </div>
          </DialogHeader>

          <div className="flex gap-2 border-b px-5 py-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentNameFilter}
                onChange={(event) => setStudentNameFilter(event.target.value)}
                placeholder="Buscar miembro..."
                className="h-9 pl-9"
                aria-label="Buscar miembro"
              />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger
                className="h-9 w-[150px] shrink-0 sm:w-[190px]"
                aria-label="Filtrar por clase"
              >
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las clases</SelectItem>
                {classes?.map((c: Doc<"classes">) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {fixedSlots === undefined ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : fixedSlots.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <Repeat2 className="size-5 text-muted-foreground" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Todavía no hay turnos fijos
                  </p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Un turno fijo reserva al miembro en cada turno de esa clase
                    que coincida con el día y la hora.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  Agregar turno fijo
                </Button>
              </div>
            ) : groups.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Ningún miembro coincide con la búsqueda.
              </p>
            ) : (
              <ul className="divide-y">
                {groups.map((group) => {
                  const slotByDay = new Map(
                    group.slots.map((slot) => [slot.dayOfWeek, slot]),
                  );
                  return (
                    <li
                      key={group.key}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
                    >
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          {initials(group.userName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {group.userName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {group.className} ·{" "}
                          <span className="tabular-nums">
                            {formatSlotTime(group.startTimeMinutes)}
                          </span>
                        </p>
                      </div>
                      <div className="ml-11 flex items-center gap-2 sm:ml-0">
                        <div
                          className="flex gap-0.5"
                          aria-label={`Días: ${group.slots
                            .map(
                              (s) =>
                                DAYS_OF_WEEK.find(
                                  (d) => d.value === s.dayOfWeek,
                                )?.label,
                            )
                            .join(", ")}`}
                        >
                          {DAY_CHIPS.map((day) => {
                            const slot = slotByDay.get(day.value);
                            return (
                              <span
                                key={day.value}
                                className={cn(
                                  "flex size-6 items-center justify-center rounded-md text-[11px] font-medium",
                                  slot
                                    ? "bg-foreground text-background"
                                    : "bg-muted text-muted-foreground/60",
                                )}
                                aria-hidden
                              >
                                {day.short}
                              </span>
                            );
                          })}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Acciones para ${group.userName}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {group.slots.length > 1 &&
                              DAYS_OF_WEEK.filter((d) =>
                                slotByDay.has(d.value),
                              ).map((d) => (
                                <DropdownMenuItem
                                  key={d.value}
                                  onClick={() =>
                                    handleRemove(slotByDay.get(d.value)!._id)
                                  }
                                >
                                  <X className="mr-2 size-4" />
                                  Quitar {d.label.toLowerCase()}
                                </DropdownMenuItem>
                              ))}
                            {group.slots.length > 1 && (
                              <DropdownMenuSeparator />
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setGroupToRemove(group)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Quitar turno fijo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Se aplican solos a los turnos nuevos.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleBackfill}
              disabled={backfilling || (fixedSlots?.length ?? 0) === 0}
            >
              <RefreshCw
                className={cn("size-4", backfilling && "animate-spin")}
                aria-hidden
              />
              Aplicar a turnos ya creados
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={groupToRemove !== null}
        onOpenChange={(next) =>
          !next && !removingGroup && setGroupToRemove(null)
        }
      >
        <AlertDialogContent className="w-[calc(100%-1.5rem)] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el turno fijo?</AlertDialogTitle>
            <AlertDialogDescription>
              {groupToRemove?.userName} deja de reservarse solo en{" "}
              {groupToRemove?.className} a las{" "}
              {groupToRemove
                ? formatSlotTime(groupToRemove.startTimeMinutes)
                : ""}
              . También se cancelan sus reservas confirmadas en esos turnos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingGroup}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={removingGroup}
              onClick={(e) => {
                e.preventDefault();
                handleRemoveGroup();
              }}
            >
              {removingGroup ? "Quitando..." : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={addOpen}
        onOpenChange={(nextOpen) => {
          setAddOpen(nextOpen);
          if (!nextOpen) {
            setMemberSearchOpen(false);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar turno fijo</DialogTitle>
            <DialogDescription>
              Se van a reservar solos en cada turno que coincida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Miembros</Label>
              <Popover
                open={memberSearchOpen}
                onOpenChange={setMemberSearchOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={memberSearchOpen}
                    className={cn(
                      "w-full justify-between",
                      selectedUserIds.length === 0 && "text-muted-foreground",
                    )}
                    type="button"
                  >
                    {selectedUserIds.length === 0
                      ? "Seleccionar miembros"
                      : selectedUserIds.length === 1
                        ? (members.find(
                            (member) => member.id === selectedUserIds[0],
                          )?.name ?? "1 miembro seleccionado")
                        : `${selectedUserIds.length} miembros seleccionados`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-2rem)] p-0 sm:w-[320px]"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Buscar miembro..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron miembros.</CommandEmpty>
                      <CommandGroup>
                        {members.map((member) => {
                          const isSelected = selectedUserIds.includes(
                            member.id,
                          );
                          const isNotAllowed = membersNotAllowedForClass.has(
                            member.id,
                          );

                          return (
                            <CommandItem
                              key={member.id}
                              value={`${member.name} ${member.email ?? ""}`}
                              disabled={isNotAllowed}
                              onSelect={() => {
                                if (isNotAllowed) return;
                                setSelectedUserIds((prev) =>
                                  isSelected
                                    ? prev.filter((id) => id !== member.id)
                                    : [...prev, member.id],
                                );
                              }}
                            >
                              <Checkbox
                                checked={isSelected}
                                className="pointer-events-none mr-2"
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium">
                                  {member.name}
                                </span>
                                {isNotAllowed ? (
                                  <span className="truncate text-xs text-muted-foreground">
                                    Su plan no habilita esta clase
                                  </span>
                                ) : (
                                  member.email && (
                                    <span className="truncate text-xs text-muted-foreground">
                                      {member.email}
                                    </span>
                                  )
                                )}
                              </div>
                              <Check
                                className={cn(
                                  "ml-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Clase</Label>
              <Select
                value={addClassId}
                onValueChange={(v) => {
                  const nextClassId = v as Id<"classes">;
                  setAddClassId(nextClassId);
                  // Drop members whose plan doesn't include the new class
                  const blocked = new Set(
                    (subscriptions ?? [])
                      .filter(
                        (sub) =>
                          sub.status !== "cancelled" &&
                          (sub.plan?.classesEnabled === false ||
                            (sub.plan?.allowedClassIds?.length &&
                              !sub.plan.allowedClassIds.includes(nextClassId))),
                      )
                      .map((sub) => sub.userId),
                  );
                  setSelectedUserIds((prev) =>
                    prev.filter((id) => !blocked.has(id)),
                  );
                }}
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
              <Label>Días</Label>
              <div className="flex gap-1">
                {DAY_CHIPS.map((day) => {
                  const active = addDaysOfWeek.includes(day.value);
                  const label =
                    DAYS_OF_WEEK.find((d) => d.value === day.value)?.label ??
                    "";
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={active}
                      aria-label={label}
                      title={label}
                      onClick={() =>
                        setAddDaysOfWeek((prev) =>
                          active
                            ? prev.filter((d) => d !== day.value)
                            : [...prev, day.value].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        "flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent/60",
                      )}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
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
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddOpen(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleAdd}>
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
