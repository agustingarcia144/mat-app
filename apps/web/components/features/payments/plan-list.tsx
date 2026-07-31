"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
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
  AlertTriangle,
  Ban,
  CreditCard,
  Edit,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FinanceStatePanel,
  TableShell,
  tableHeadClassName,
  tableRowClassName,
} from "@/components/features/finance/finance-display";
import PlanFormDialog from "./dialogs/plan-form-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";
import { cn } from "@/lib/utils";

export default function PlanList() {
  const canQuery = useCanQueryCurrentOrganization();
  const plans = useQuery(
    api.membershipPlans.getByOrganization,
    canQuery ? { activeOnly: false } : "skip",
  );
  const orgClasses = useQuery(
    api.classes.getByOrganization,
    canQuery ? { activeOnly: false } : "skip",
  );
  const classNameById = new Map(
    (orgClasses ?? []).map((classItem) => [
      classItem._id as string,
      classItem.name,
    ]),
  );
  const toggleActive = useMutation(api.membershipPlans.toggleActive);
  const toggleVisibility = useMutation(api.membershipPlans.toggleVisibility);
  const deletePlan = useMutation(api.membershipPlans.softDelete);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<
    Id<"membershipPlans"> | undefined
  >();
  const [planPendingEdit, setPlanPendingEdit] = useState<{
    id: Id<"membershipPlans">;
    name: string;
  } | null>(null);
  const [planPendingDeactivation, setPlanPendingDeactivation] = useState<{
    id: Id<"membershipPlans">;
    name: string;
  } | null>(null);
  const [isSubmittingDeactivation, setIsSubmittingDeactivation] =
    useState(false);
  const [planPendingDeletion, setPlanPendingDeletion] = useState<{
    id: Id<"membershipPlans">;
    name: string;
  } | null>(null);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);

  const handleToggle = async (planId: Id<"membershipPlans">) => {
    try {
      await toggleActive({ planId });
      toast.success("Estado del plan actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleToggleVisibility = async (
    planId: Id<"membershipPlans">,
    isHidden: boolean,
  ) => {
    try {
      await toggleVisibility({ planId });
      toast.success(
        isHidden ? "Plan visible en la app" : "Plan oculto en la app",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleEdit = (planId: Id<"membershipPlans">, name: string) => {
    setPlanPendingEdit({ id: planId, name });
  };

  const handleNew = () => {
    setEditingPlanId(undefined);
    setFormOpen(true);
  };

  const handleToggleClick = (planId: Id<"membershipPlans">, isActive: boolean, name: string) => {
    if (isActive) {
      setPlanPendingDeactivation({ id: planId, name });
      return;
    }

    void handleToggle(planId);
  };

  const confirmDeactivation = async () => {
    if (!planPendingDeactivation) return;

    setIsSubmittingDeactivation(true);
    try {
      await toggleActive({ planId: planPendingDeactivation.id });
      toast.success("Plan desactivado correctamente");
      setPlanPendingDeactivation(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setIsSubmittingDeactivation(false);
    }
  };

  const confirmEdit = () => {
    if (!planPendingEdit) return;

    setEditingPlanId(planPendingEdit.id);
    setFormOpen(true);
    setPlanPendingEdit(null);
  };

  const confirmDelete = async () => {
    if (!planPendingDeletion) return;

    setIsSubmittingDeletion(true);
    try {
      const result = await deletePlan({ planId: planPendingDeletion.id });
      const unassignedCount = result?.unassignedCount ?? 0;
      toast.success(
        unassignedCount > 0
          ? `Plan eliminado. Se desasignaron ${unassignedCount} miembros.`
          : "Plan eliminado correctamente",
      );
      setPlanPendingDeletion(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Planes de membresía</h2>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo plan
          </Button>
        </div>

        {plans === undefined ? (
          <FinanceStatePanel
            icon={Loader2}
            iconClassName="animate-spin"
            title="Cargando planes..."
          />
        ) : plans.length === 0 ? (
          <FinanceStatePanel
            icon={CreditCard}
            title="Todavía no hay planes"
            description="Creá tu primer plan para que los miembros puedan suscribirse."
          />
        ) : (
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className={tableHeadClassName}>Nombre</TableHead>
                  <TableHead className={cn(tableHeadClassName, "text-right")}>
                    Precio
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClassName, "hidden md:table-cell")}
                  >
                    Clases/semana
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClassName, "hidden lg:table-cell")}
                  >
                    Ventana de pago
                  </TableHead>
                  <TableHead className={tableHeadClassName}>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan._id} className={tableRowClassName}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{plan.name}</p>
                          {plan.isFamilyPlan ? (
                            <Badge variant="outline">Familiar</Badge>
                          ) : null}
                          {plan.hiddenFromSelfAssignment ? (
                            <Badge variant="outline" className="gap-1">
                              <EyeOff className="size-3" />
                              Oculto
                            </Badge>
                          ) : null}
                          {plan.classesEnabled === false ? (
                            <Badge variant="outline" className="gap-1">
                              <Ban className="size-3" />
                              Sin clases
                            </Badge>
                          ) : plan.allowedClassIds?.length ? (
                            <Badge
                              variant="outline"
                              title={plan.allowedClassIds
                                .map((id) => classNameById.get(id) ?? id)
                                .join(", ")}
                            >
                              {plan.allowedClassIds.length} clase
                              {plan.allowedClassIds.length === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </div>
                        {plan.description && (
                          <p className="text-xs text-muted-foreground">
                            {plan.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                      ${plan.priceArs.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {plan.classesEnabled === false
                        ? "—"
                        : plan.weeklyClassLimit >= 9999
                          ? "Sin límite"
                          : plan.weeklyClassLimit}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(plan.billingMode ?? "calendar") === "join_date"
                        ? "Por ingreso"
                        : `Día ${plan.paymentWindowStartDay} al ${plan.paymentWindowEndDay}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground"
                            title="Acciones"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEdit(plan._id, plan.name)}
                          >
                            <Edit className="mr-2 size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleToggleClick(
                                plan._id,
                                plan.isActive,
                                plan.name,
                              )
                            }
                          >
                            {plan.isActive ? (
                              <ToggleRight className="mr-2 size-4" />
                            ) : (
                              <ToggleLeft className="mr-2 size-4" />
                            )}
                            {plan.isActive ? "Desactivar" : "Activar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleToggleVisibility(
                                plan._id,
                                Boolean(plan.hiddenFromSelfAssignment),
                              )
                            }
                          >
                            {plan.hiddenFromSelfAssignment ? (
                              <Eye className="mr-2 size-4" />
                            ) : (
                              <EyeOff className="mr-2 size-4" />
                            )}
                            {plan.hiddenFromSelfAssignment
                              ? "Mostrar en la app"
                              : "Ocultar en la app"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setPlanPendingDeletion({
                                id: plan._id,
                                name: plan.name,
                              })
                            }
                          >
                            <Trash2 className="mr-2 size-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        )}
      </div>

      <PlanFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingPlanId(undefined);
        }}
        planId={editingPlanId}
      />

      <AlertDialog
        open={planPendingDeactivation !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmittingDeactivation) {
            setPlanPendingDeactivation(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-[760px] border-[#2B2B2B] bg-[#0A0A0A] px-8 py-7 text-white sm:rounded-[28px]">
          <AlertDialogHeader className="space-y-4 text-left">
            <div className="flex items-center gap-2 text-[#C56A2D]">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-[15px] font-medium">Advertencia</span>
            </div>

            <AlertDialogTitle className="text-left text-3xl font-semibold leading-tight tracking-[-0.02em] text-white">
              Estas seguro de que quieres desactivar el plan?
            </AlertDialogTitle>

            <AlertDialogDescription asChild>
              <div className="rounded-[22px] border border-[#F0C75A] bg-[#FFF9E8] p-6 text-[#8B6A1E]">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#E3A126]" />
                  <p className="text-lg leading-9">
                    Se recomienda desactivar los planes dias antes de finalizar
                    el mes para evitar superposiciones en las clases de los
                    alumnos, teniendo en cuenta que se modificarian sus
                    frecuencias y limitaciones.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-2 gap-3 sm:justify-end">
            <AlertDialogCancel
              disabled={isSubmittingDeactivation}
              className="mt-0 min-w-40 rounded-2xl border-[#4A4A4A] bg-transparent px-7 py-6 text-lg text-white hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivation}
              disabled={isSubmittingDeactivation}
              className={buttonVariants({
                variant: "destructive",
                className:
                  "min-w-52 rounded-2xl border-0 bg-[#FF6B74] px-7 py-6 text-lg font-medium text-white hover:bg-[#ff5c67]",
              })}
            >
              {isSubmittingDeactivation ? "Desactivando..." : "Desactivar plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={planPendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmittingDeletion) {
            setPlanPendingDeletion(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plan</AlertDialogTitle>
            <AlertDialogDescription>
              El plan {planPendingDeletion?.name} se eliminará de la lista de
              planes y quedará guardado para auditoría. Los miembros que
              todavía tengan este plan serán desasignados automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingDeletion}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isSubmittingDeletion}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isSubmittingDeletion ? "Eliminando..." : "Eliminar plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={planPendingEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPlanPendingEdit(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-[760px] border-[#2B2B2B] bg-[#0A0A0A] px-8 py-7 text-white sm:rounded-[28px]">
          <AlertDialogHeader className="space-y-4 text-left">
            <div className="flex items-center gap-2 text-[#C56A2D]">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-[15px] font-medium">Advertencia</span>
            </div>

            <AlertDialogTitle className="text-left text-3xl font-semibold leading-tight tracking-[-0.02em] text-white">
              Estas seguro de que quieres editar el plan?
            </AlertDialogTitle>

            <AlertDialogDescription asChild>
              <div className="rounded-[22px] border border-[#F0C75A] bg-[#FFF9E8] p-6 text-[#8B6A1E]">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#E3A126]" />
                  <p className="text-lg leading-9">
                    Se recomienda editar los planes dias antes de finalizar el
                    mes para evitar superposiciones en las clases de los
                    alumnos, teniendo en cuenta que se modificarian sus
                    frecuencias y limitaciones.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-2 gap-3 sm:justify-end">
            <AlertDialogCancel className="mt-0 min-w-40 rounded-2xl border-[#4A4A4A] bg-transparent px-7 py-6 text-lg text-white hover:bg-white/5 hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEdit}
              className={buttonVariants({
                variant: "destructive",
                className:
                  "min-w-52 rounded-2xl border-0 bg-[#FF6B74] px-7 py-6 text-lg font-medium text-white hover:bg-[#ff5c67]",
              })}
            >
              Editar Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
