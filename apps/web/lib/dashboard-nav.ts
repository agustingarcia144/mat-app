import type { LucideIcon } from "lucide-react";
import {
  HomeIcon,
  UsersIcon,
  Dumbbell,
  ListChecks,
  CalendarDays,
  BarChart3,
  UserCog,
  Settings,
  Landmark,
} from "lucide-react";

export type FeatureFlag =
  | "planificationsEnabled"
  | "classesEnabled"
  | "financeEnabled";

export type BillingModule =
  | "dashboard"
  | "members"
  | "planifications"
  | "exercises"
  | "classes"
  | "finance"
  | "metrics"
  | "users"
  | "settings";

export type DashboardNavItem = {
  label: string;
  icon: LucideIcon;
  url: string;
  billingModule: BillingModule;
  adminOnly?: boolean;
  featureFlag?: FeatureFlag;
};

export const DASHBOARD_NAV_ITEMS: readonly DashboardNavItem[] = [
  {
    label: "Inicio",
    icon: HomeIcon,
    url: "/",
    billingModule: "dashboard",
  },
  {
    label: "Miembros",
    icon: UsersIcon,
    url: "/members",
    billingModule: "members",
  },
  {
    label: "Planificaciones",
    icon: Dumbbell,
    url: "/planifications",
    billingModule: "planifications",
    featureFlag: "planificationsEnabled",
  },
  {
    label: "Ejercicios",
    icon: ListChecks,
    url: "/exercises",
    billingModule: "exercises",
    featureFlag: "planificationsEnabled",
  },
  {
    label: "Clases",
    icon: CalendarDays,
    url: "/classes",
    billingModule: "classes",
    featureFlag: "classesEnabled",
  },
  {
    label: "Finanzas",
    icon: Landmark,
    url: "/finance",
    billingModule: "finance",
    adminOnly: true,
  },
  {
    label: "Metricas",
    icon: BarChart3,
    url: "/metrics",
    billingModule: "metrics",
  },
  {
    label: "Mi Equipo",
    icon: UserCog,
    url: "/users",
    billingModule: "users",
    adminOnly: true,
  },
];
