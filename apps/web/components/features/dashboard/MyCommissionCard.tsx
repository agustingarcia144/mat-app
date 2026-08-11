"use client";

import { useQuery } from "convex/react";
import { Percent, Users } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

function formatArs(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function MyCommissionCard() {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const summary = useQuery(
    api.payroll.getMyCommissionSummary,
    canQueryCurrentOrganization ? {} : "skip",
  );

  // null = no commission configured for this staff member.
  if (!summary) return null;

  return (
    <Card className="flex min-h-[220px] w-full max-w-none flex-col rounded-2xl border bg-background/60 p-4 md:h-[220px] md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-foreground">
            Mi comisión
          </div>
          <p className="text-sm capitalize text-muted-foreground">
            {summary.periodLabel}
          </p>
        </div>
        <Badge variant="outline" className="gap-2 px-3">
          <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
          {summary.commissionPercentage}%
        </Badge>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-4xl font-semibold leading-none md:text-5xl">
          {formatArs(summary.commissionAmount)}
        </p>
        <p className="text-sm text-muted-foreground">
          sobre {formatArs(summary.base)} cobrados
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {summary.assignedMemberCount} miembro
        {summary.assignedMemberCount === 1 ? "" : "s"} a cargo
      </div>
    </Card>
  );
}
