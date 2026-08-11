"use client";

import { useUser } from "@clerk/nextjs";

import { getOrgRoleLabel } from "@/lib/security/roles";
import { Badge } from "@/components/ui/badge";
import DashboardScopeToggle from "./dashboard-scope-toggle";
import { useDashboardScope } from "./dashboard-scope-context";

export default function DashboardHeader() {
  const { user } = useUser();
  const { organizationName, role, isLoading } = useDashboardScope();

  const firstName =
    user?.firstName?.trim() || user?.fullName?.trim().split(" ")[0] || null;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold md:text-3xl">
          {firstName ? `Hola, ${firstName} 👋` : "Dashboard"}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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

      <DashboardScopeToggle />
    </div>
  );
}
