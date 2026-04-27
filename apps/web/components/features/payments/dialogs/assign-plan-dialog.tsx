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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

interface AssignPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function AssignPlanDialog({
  open,
  onOpenChange,
  onSuccess,
}: AssignPlanDialogProps) {
  const canQuery = useCanQueryCurrentOrganization();

  const members = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQuery ? {} : "skip",
  );
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    open && canQuery ? {} : "skip",
  );
  const plans = useQuery(
    api.membershipPlans.getByOrganization,
    open && canQuery ? { activeOnly: true } : "skip",
  );

  const assignPlan = useMutation(api.memberPlanSubscriptions.assignToMember);
  const cancelSubscription = useMutation(api.memberPlanSubscriptions.cancel);

  // Assign state
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignMemberOpen, setAssignMemberOpen] = useState(false);
  const [familyMemberOpen, setFamilyMemberOpen] = useState(false);
  const [familyMemberUserIds, setFamilyMemberUserIds] = useState<string[]>([]);

  // Unassign state
  const [unassignSubscriptionId, setUnassignSubscriptionId] = useState("");
  const [unassignMemberOpen, setUnassignMemberOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Members without an active/suspended subscription (for assign)
  const membersWithoutPlan = useMemo(() => {
    if (!members || !subscriptions) return [];
    const subscribedUserIds = new Set(
      subscriptions
        .filter((s) => s.status === "active" || s.status === "suspended")
        .map((s) => s.userId),
    );
    return members.filter(
      (m) => m.role === "member" && !subscribedUserIds.has(m.userId),
    );
  }, [members, subscriptions]);

  // Active/suspended subscriptions (for unassign), with member display name
  const subscriptionsWithPlan = useMemo(() => {
    if (!subscriptions) return [];
    return subscriptions
      .filter((s) => s.status === "active" || s.status === "suspended")
      .map((s) => ({
        ...s,
        displayName: s.userFullName,
      }));
  }, [subscriptions]);

  const selectedAssignMember = useMemo(
    () => membersWithoutPlan.find((m) => m.userId === assignUserId),
    [membersWithoutPlan, assignUserId],
  );
  const selectedAssignPlan = useMemo(
    () => plans?.find((p) => p._id === assignPlanId),
    [plans, assignPlanId],
  );
  const familyCandidates = useMemo(() => {
    if (!selectedAssignPlan?.isFamilyPlan) return [];
    return membersWithoutPlan.filter((member) => member.userId !== assignUserId);
  }, [membersWithoutPlan, selectedAssignPlan, assignUserId]);
  const selectedFamilyMembers = useMemo(
    () =>
      familyCandidates.filter((member) => familyMemberUserIds.includes(member.userId)),
    [familyCandidates, familyMemberUserIds],
  );
  const selectedUnassignSub = useMemo(
    () => subscriptionsWithPlan.find((s) => s._id === unassignSubscriptionId),
    [subscriptionsWithPlan, unassignSubscriptionId],
  );

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) return;
    setAssignUserId("");
    setAssignPlanId("");
    setFamilyMemberUserIds([]);
    setUnassignSubscriptionId("");
  }, [open]);

  useEffect(() => {
    setFamilyMemberUserIds([]);
  }, [assignPlanId, assignUserId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId || !assignPlanId) return;
    setIsSubmitting(true);
    try {
      await assignPlan({
        userId: assignUserId,
        planId: assignPlanId as Id<"membershipPlans">,
        familyMemberUserIds:
          selectedAssignPlan?.isFamilyPlan && familyMemberUserIds.length > 0
            ? familyMemberUserIds
            : undefined,
      });
      toast.success("Plan asignado correctamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al asignar plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unassignSubscriptionId) return;
    setIsSubmitting(true);
    try {
      await cancelSubscription({
        subscriptionId: unassignSubscriptionId as Id<"memberPlanSubscriptions">,
      });
      toast.success("Plan desasignado correctamente");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al desasignar plan",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Gestionar plan de miembro</SheetTitle>
          <SheetDescription>
            Asigná o desasigná un plan de membresía a un miembro.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="assign" className="pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="assign" className="flex-1">
              Asignar plan
            </TabsTrigger>
            <TabsTrigger value="unassign" className="flex-1">
              Desasignar plan
            </TabsTrigger>
          </TabsList>

          {/* -- ASSIGN TAB -- */}
          <TabsContent value="assign">
            <form onSubmit={handleAssign} className="space-y-4 pt-2">
              <Field>
                <FieldLabel>Miembro</FieldLabel>
                <Popover
                  open={assignMemberOpen}
                  onOpenChange={setAssignMemberOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={assignMemberOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedAssignMember
                        ? (selectedAssignMember.fullName ??
                          selectedAssignMember.email ??
                          selectedAssignMember.userId)
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
                        <CommandEmpty>No hay miembros sin plan.</CommandEmpty>
                        <CommandGroup>
                          {membersWithoutPlan.map((member) => (
                            <CommandItem
                              key={member.userId}
                              value={`${member.fullName ?? ""} ${member.email ?? ""}`}
                              onSelect={() => {
                                setAssignUserId(member.userId);
                                setAssignMemberOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  assignUserId === member.userId
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span>
                                  {member.fullName ??
                                    member.email ??
                                    member.userId}
                                </span>
                                {member.email && member.fullName && (
                                  <span className="text-xs text-muted-foreground">
                                    {member.email}
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
                <FieldDescription>
                  Solo se muestran miembros sin plan activo o suspendido.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Plan</FieldLabel>
                <Select value={assignPlanId} onValueChange={setAssignPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).map((plan) => (
                      <SelectItem key={plan._id} value={plan._id}>
                        {plan.name} — ${plan.priceArs.toLocaleString("es-AR")}
                        /mes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selectedAssignPlan?.isFamilyPlan ? (
                <Field>
                  <FieldLabel>Miembros asociados</FieldLabel>
                  <Popover
                    open={familyMemberOpen}
                    onOpenChange={setFamilyMemberOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={familyMemberOpen}
                        className="w-full justify-between font-normal"
                      >
                        {selectedFamilyMembers.length > 0
                          ? `${selectedFamilyMembers.length} miembro(s) seleccionados`
                          : "Seleccionar miembros asociados..."}
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
                          <CommandEmpty>
                            No hay miembros disponibles para asociar.
                          </CommandEmpty>
                          <CommandGroup>
                            {familyCandidates.map((member) => {
                              const isSelected = familyMemberUserIds.includes(
                                member.userId,
                              );
                              return (
                                <CommandItem
                                  key={member.userId}
                                  value={`${member.fullName ?? ""} ${member.email ?? ""}`}
                                  onSelect={() => {
                                    setFamilyMemberUserIds((current) =>
                                      current.includes(member.userId)
                                        ? current.filter(
                                            (userId) => userId !== member.userId,
                                          )
                                        : [...current, member.userId],
                                    );
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>
                                      {member.fullName ??
                                        member.email ??
                                        member.userId}
                                    </span>
                                    {member.email && member.fullName && (
                                      <span className="text-xs text-muted-foreground">
                                        {member.email}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FieldDescription>
                    Seleccioná los familiares que quedarán asociados al titular
                    de este plan.
                  </FieldDescription>
                  {selectedFamilyMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedFamilyMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="rounded-full border px-3 py-1 text-xs"
                        >
                          {member.fullName ?? member.email ?? member.userId}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Field>
              ) : null}

              {selectedAssignPlan && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                  <p className="font-medium">{selectedAssignPlan.name}</p>
                  <p className="text-muted-foreground">
                    ${selectedAssignPlan.priceArs.toLocaleString("es-AR")}/mes
                    {" · "}
                    {selectedAssignPlan.weeklyClassLimit >= 9999
                      ? "Sin límite de clases"
                      : `${selectedAssignPlan.weeklyClassLimit} clases/semana`}
                  </p>
                  <p className="text-muted-foreground">
                    Ventana de pago: día{" "}
                    {selectedAssignPlan.paymentWindowStartDay} al{" "}
                    {selectedAssignPlan.paymentWindowEndDay}
                  </p>
                  {selectedAssignPlan.isFamilyPlan ? (
                    <p className="text-muted-foreground">
                      Plan familiar para titular y miembros asociados.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !assignUserId || !assignPlanId}
                >
                  {isSubmitting ? "Asignando..." : "Asignar plan"}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* -- UNASSIGN TAB -- */}
          <TabsContent value="unassign">
            <form onSubmit={handleUnassign} className="space-y-4 pt-2">
              <Field>
                <FieldLabel>Miembro</FieldLabel>
                <Popover
                  open={unassignMemberOpen}
                  onOpenChange={setUnassignMemberOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={unassignMemberOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedUnassignSub
                        ? `${selectedUnassignSub.displayName} — ${selectedUnassignSub.plan?.name ?? "Plan"}`
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
                        <CommandEmpty>
                          No hay miembros con plan activo.
                        </CommandEmpty>
                        <CommandGroup>
                          {subscriptionsWithPlan.map((sub) => (
                            <CommandItem
                              key={sub._id}
                              value={`${sub.displayName} ${sub.plan?.name ?? ""}`}
                              onSelect={() => {
                                setUnassignSubscriptionId(sub._id);
                                setUnassignMemberOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  unassignSubscriptionId === sub._id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{sub.displayName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {sub.plan?.name ?? "Plan"}
                                  {sub.status === "suspended" &&
                                    " (suspendido)"}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FieldDescription>
                  Solo se muestran miembros con plan activo o suspendido.
                </FieldDescription>
              </Field>

              {selectedUnassignSub && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
                  <p className="font-medium">
                    {selectedUnassignSub.displayName}
                  </p>
                  <p className="text-muted-foreground">
                    {selectedUnassignSub.plan?.name ?? "Plan desconocido"}
                    {" · "}
                    Estado:{" "}
                    {selectedUnassignSub.status === "active"
                      ? "activo"
                      : "suspendido"}
                  </p>
                  <p className="text-destructive/80 text-xs">
                    El miembro perderá acceso al plan y sus clases asociadas.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isSubmitting || !unassignSubscriptionId}
                >
                  {isSubmitting ? "Desasignando..." : "Desasignar plan"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
