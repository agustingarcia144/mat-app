"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { AlertTriangle, Edit, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import PlanFormDialog from "./dialogs/plan-form-dialog";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

export default function PlanList() {
  const canQuery = useCanQueryCurrentOrganization();
  const plans = useQuery(
    api.membershipPlans.getByOrganization,
    canQuery ? { activeOnly: false } : "skip",
  );
  const toggleActive = useMutation(api.membershipPlans.toggleActive);

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

  const handleToggle = async (planId: Id<"membershipPlans">) => {
    try {
      await toggleActive({ planId });
      toast.success("Estado del plan actualizado");
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
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando planes...
          </p>
        ) : plans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay planes creados. Crea tu primer plan para que los miembros
            puedan suscribirse.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Nombre</th>
                  <th className="p-3 text-left font-medium">Precio</th>
                  <th className="p-3 text-left font-medium">Clases/semana</th>
                  <th className="p-3 text-left font-medium">Ventana de pago</th>
                  <th className="p-3 text-left font-medium">Estado</th>
                  <th className="w-24 p-3" />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan._id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{plan.name}</p>
                        {plan.description && (
                          <p className="text-xs text-muted-foreground">
                            {plan.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      ${plan.priceArs.toLocaleString("es-AR")}
                    </td>
                    <td className="p-3">
                      {plan.weeklyClassLimit >= 9999
                        ? "Sin límite"
                        : plan.weeklyClassLimit}
                    </td>
                    <td className="p-3">
                      Día {plan.paymentWindowStartDay} al{" "}
                      {plan.paymentWindowEndDay}
                    </td>
                    <td className="p-3">
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(plan._id, plan.name)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleToggleClick(plan._id, plan.isActive, plan.name)
                          }
                          title={plan.isActive ? "Desactivar" : "Activar"}
                        >
                          {plan.isActive ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
