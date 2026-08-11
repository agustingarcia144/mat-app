"use client";

import { Building2, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useDashboardScope,
  type DashboardScope,
} from "./dashboard-scope-context";

const OPTIONS: Array<{
  value: DashboardScope;
  label: string;
  icon: typeof Building2;
}> = [
  { value: "all", label: "Toda la organización", icon: Building2 },
  { value: "mine", label: "Mis miembros", icon: UserCheck },
];

export default function DashboardScopeToggle() {
  const { scope, setScope, canToggle, isLoading } = useDashboardScope();

  if (isLoading) return null;

  if (!canToggle) {
    return (
      <Badge variant="outline" className="gap-2 px-3 py-1.5">
        <UserCheck className="h-4 w-4 text-muted-foreground" />
        Mis miembros
      </Badge>
    );
  }

  return (
    <div
      role="group"
      aria-label="Alcance del dashboard"
      className="inline-flex items-center gap-1 rounded-lg border bg-background/60 p-1"
    >
      {OPTIONS.map((option) => {
        const isActive = scope === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setScope(option.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/40",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
