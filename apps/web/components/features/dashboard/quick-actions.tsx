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
    // Phones scroll the shortcuts sideways instead of wrapping into rows.
    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border bg-card py-1.5 pl-1.5 pr-3 text-sm font-medium transition-colors hover:bg-accent/40"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-muted">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            </span>
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}
