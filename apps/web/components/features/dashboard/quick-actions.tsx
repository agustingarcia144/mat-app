"use client";

import Link from "next/link";
import { CalendarPlus, Dumbbell, UserPlus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useOrganizationEntitlement } from "@/hooks/use-organization-entitlement";
import { isOrgAdminRole } from "@/lib/security/roles";
import { useDashboardScope } from "./dashboard-scope-context";

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Entitlement module required to show the action. */
  module: string;
  adminOnly?: boolean;
};

const ACTIONS: QuickAction[] = [
  {
    label: "Nuevo miembro",
    href: "/dashboard/members",
    icon: UserPlus,
    module: "members",
  },
  {
    label: "Planificación",
    href: "/dashboard/planifications",
    icon: Dumbbell,
    module: "planifications",
  },
  {
    label: "Registrar pago",
    href: "/dashboard/payments",
    icon: Wallet,
    module: "payments",
    adminOnly: true,
  },
  {
    label: "Nueva clase",
    href: "/dashboard/classes",
    icon: CalendarPlus,
    module: "classes",
  },
];

export default function QuickActions() {
  const entitlement = useOrganizationEntitlement();
  const { role } = useDashboardScope();

  if (!entitlement) return null;

  const isAdmin = isOrgAdminRole(role);
  const actions = ACTIONS.filter(
    (action) =>
      entitlement.modules.includes(action.module) &&
      (!action.adminOnly || isAdmin),
  );

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm transition-colors hover:bg-accent/40"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}
