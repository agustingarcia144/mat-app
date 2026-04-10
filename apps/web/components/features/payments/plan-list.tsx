"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Edit, Plus, ToggleLeft, ToggleRight } from "lucide-react";
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

  const handleToggle = async (planId: Id<"membershipPlans">) => {
    try {
      await toggleActive({ planId });
      toast.success("Estado del plan actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleEdit = (planId: Id<"membershipPlans">) => {
    setEditingPlanId(planId);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditingPlanId(undefined);
    setFormOpen(true);
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
                          onClick={() => handleEdit(plan._id)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggle(plan._id)}
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
    </>
  );
}
