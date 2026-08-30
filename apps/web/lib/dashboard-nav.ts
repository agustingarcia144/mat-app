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
  ShieldCheck,
  CreditCard,
  TrendingUp,
  UserCheck,
  UserMinus,
  Wallet,
  QrCode,
  Gift,
  BadgeCheck,
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
  | "payments"
  | "finance"
  | "metrics"
  | "metrics_exercises"
  | "users"
  | "settings"
  | "rewards";

/**
 * A child entry of a nav item. Its `url` is a full dashboard-relative path and
 * does not have to live under the parent's `url` — e.g. "Pagos" hangs under
 * "Finanzas" in the menu but is routed at /dashboard/payments.
 */
export type DashboardNavSubItem = {
  label: string;
  icon: LucideIcon;
  url: string;
  /** Defaults to the parent item's admin restriction when omitted. */
  adminOnly?: boolean;
  featureFlag?: FeatureFlag;
  /** Defaults to the parent item's module when omitted. */
  billingModule?: BillingModule;
};

export type DashboardNavItem = {
  label: string;
  icon: LucideIcon;
  url: string;
  billingModule: BillingModule;
  adminOnly?: boolean;
  /** Only visible to platform super admins (users.isSuperAdmin). */
  superAdminOnly?: boolean;
  featureFlag?: FeatureFlag;
  children?: readonly DashboardNavSubItem[];
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
    label: "Membresías",
    icon: BadgeCheck,
    url: "/memberships",
    billingModule: "payments",
    adminOnly: true,
    children: [
      // Rewards and QR check-in share one module and are sold together, so
      // they are tagged explicitly instead of inheriting "payments".
      {
        label: "Recompensas",
        icon: Gift,
        url: "/rewards",
        billingModule: "rewards",
      },
      {
        label: "Ingreso QR",
        icon: QrCode,
        url: "/check-in",
        adminOnly: false,
        billingModule: "rewards",
      },
    ],
  },
  {
    label: "Finanzas",
    icon: Landmark,
    url: "/finance",
    billingModule: "finance",
    adminOnly: true,
    children: [
      {
        label: "Pagos",
        icon: CreditCard,
        url: "/payments",
      },
      {
        label: "Ingresos y egresos",
        icon: Wallet,
        url: "/income-expenses",
        featureFlag: "financeEnabled",
      },
      {
        label: "Balance financiero",
        icon: TrendingUp,
        url: "/metrics/payments",
      },
    ],
  },
  {
    label: "Metricas",
    icon: BarChart3,
    url: "/metrics",
    billingModule: "metrics",
    children: [
      {
        label: "Ejercicios",
        icon: Dumbbell,
        url: "/metrics/exercises",
        billingModule: "metrics_exercises",
      },
      {
        label: "Clases",
        icon: CalendarDays,
        url: "/metrics/classes",
        adminOnly: true,
      },
      {
        label: "Asistencia",
        icon: UserCheck,
        url: "/metrics/attendance",
      },
      {
        label: "Churn",
        icon: UserMinus,
        url: "/metrics/churn",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Mi Equipo",
    icon: UserCog,
    url: "/users",
    billingModule: "users",
    adminOnly: true,
  },
  {
    label: "Plataforma",
    icon: ShieldCheck,
    url: "/platform",
    billingModule: "dashboard",
    superAdminOnly: true,
  },
];
