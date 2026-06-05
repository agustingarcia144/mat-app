"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Gift } from "lucide-react";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

const REASON_LABELS: Record<string, string> = {
  friend_and_family: "Familiar/Amigo",
  trainer: "Entrenador",
  employee: "Empleado",
  sponsor: "Sponsor",
  other: "Otro",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDiscount(discountType: string, discountValue: number): string {
  if (discountType === "full") return "100% gratis";
  if (discountType === "percentage") return `${discountValue}%`;
  return `$${discountValue.toLocaleString("es-AR")}`;
}

export default function BonificationList() {
  const canQuery = useCanQueryCurrentOrganization();
  const bonifications = useQuery(
    api.planBonifications.getByOrganization,
    canQuery ? { status: "active" } : "skip",
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Miembros bonificados</h2>
        <p className="text-sm text-muted-foreground">
          Miembros que tienen una bonificación activa en su plan.
        </p>
      </div>

      {bonifications === undefined ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Cargando bonificaciones...
        </p>
      ) : bonifications.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay miembros con bonificación activa.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium">Miembro</th>
                <th className="p-3 text-left font-medium">Plan</th>
                <th className="p-3 text-left font-medium">Descuento</th>
                <th className="p-3 text-left font-medium">Monto final</th>
                <th className="p-3 text-left font-medium">Motivo</th>
                <th className="p-3 text-left font-medium">Desde</th>
              </tr>
            </thead>
            <tbody>
              {bonifications.map((bonification) => {
                const discountLabel = formatDiscount(
                  bonification.discountType,
                  bonification.discountValue,
                );

                return (
                  <tr
                    key={bonification._id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="p-3">
                      <p className="font-medium">
                        {bonification.userFullName}
                      </p>
                    </td>
                    <td className="p-3">
                      <div>
                        <p>{bonification.planName}</p>
                        <p className="text-xs text-muted-foreground">
                          ${bonification.planPriceArs.toLocaleString("es-AR")}
                          /mes
                        </p>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className="gap-1 border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400"
                      >
                        <Gift className="h-3 w-3" />
                        {discountLabel}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium">
                      ${bonification.effectiveAmountArs.toLocaleString("es-AR")}
                      /mes
                    </td>
                    <td className="p-3">
                      {REASON_LABELS[bonification.reason] ??
                        bonification.reason}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(bonification.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
