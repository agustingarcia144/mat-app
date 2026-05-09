import type { LucideIcon } from "lucide-react";
import {
  HomeIcon,
  UsersIcon,
  Dumbbell,
  ListChecks,
  CalendarDays,
  BarChart3,
  CreditCard,
  UserCog,
  Wallet,
  Settings,
} from "lucide-react";

export type FeatureFlag =
  | "planificationsEnabled"
  | "classesEnabled"
  | "financeEnabled";

export type DashboardNavItem = {
  label: string;
  icon: LucideIcon;
  url: string;
  adminOnly?: boolean;
  featureFlag?: FeatureFlag;
};

export const DASHBOARD_NAV_ITEMS: readonly DashboardNavItem[] = [
  {
    label: "Inicio",
    icon: HomeIcon,
    url: "/",
  },
  {
    label: "Miembros",
    icon: UsersIcon,
    url: "/members",
  },
  {
    label: "Planificaciones",
    icon: Dumbbell,
    url: "/planifications",
    featureFlag: "planificationsEnabled",
  },
  {
    label: "Ejercicios",
    icon: ListChecks,
    url: "/exercises",
    featureFlag: "planificationsEnabled",
  },
  {
    label: "Clases",
    icon: CalendarDays,
    url: "/classes",
    featureFlag: "classesEnabled",
  },
  {
    label: "Pagos",
    icon: CreditCard,
    url: "/payments",
    adminOnly: true,
  },
  {
    label: "Ingresos y egresos",
    icon: Wallet,
    url: "/income-expenses",
    adminOnly: true,
    featureFlag: "financeEnabled",
  },
  {
    label: "Metricas",
    icon: BarChart3,
    url: "/metrics",
  },
  {
    label: "Usuarios",
    icon: UserCog,
    url: "/users",
    adminOnly: true,
  },
  {
    label: "Configuracion",
    icon: Settings,
    url: "/settings",
    adminOnly: true,
  },
];
