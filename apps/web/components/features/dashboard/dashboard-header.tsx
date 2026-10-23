"use client";

import { useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { getOrgRoleLabel } from "@/lib/security/roles";
import { Badge } from "@/components/ui/badge";
import DashboardScopeToggle from "./dashboard-scope-toggle";
import { useDashboardScope } from "./dashboard-scope-context";

export default function DashboardHeader({ action }: { action?: ReactNode }) {
  const { user } = useUser();
  const { organizationName, role, isLoading } = useDashboardScope();

  const [today] = useState(() =>
    format(new Date(), "EEEE d 'de' MMMM", { locale: es }),
  );
  const firstName =
    user?.firstName?.trim() || user?.fullName?.trim().split(" ")[0] || null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-bold md:text-3xl">
          {firstName ? `Hola, ${firstName} 👋` : "Inicio"}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground md:text-base">
          <span className="inline-block first-letter:uppercase">{today}</span>
          <span aria-hidden>·</span>
          <span className="truncate">
            {organizationName ?? "Tu organización"}
          </span>
          {!isLoading && role && (
            <Badge variant="secondary" className="px-2 py-0.5 text-xs">
              {getOrgRoleLabel(role)}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DashboardScopeToggle />
        {action}
      </div>
    </div>
  );
}
