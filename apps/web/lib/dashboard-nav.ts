import type { LucideIcon } from 'lucide-react'
import {
  HomeIcon,
  UsersIcon,
  Dumbbell,
  ListChecks,
  CalendarDays,
  BarChart3,
  CreditCard,
  UserCog,
} from 'lucide-react'

export const DASHBOARD_NAV_ITEMS = [
  {
    label: 'Inicio',
    icon: HomeIcon,
    url: '/',
  },
  {
    label: 'Miembros',
    icon: UsersIcon,
    url: '/members',
  },
  {
    label: 'Planificaciones',
    icon: Dumbbell,
    url: '/planifications',
  },
  {
    label: 'Ejercicios',
    icon: ListChecks,
    url: '/exercises',
  },
  {
    label: 'Clases',
    icon: CalendarDays,
    url: '/classes',
  },
  {
    label: 'Pagos',
    icon: CreditCard,
    url: '/payments',
    adminOnly: true,
  },
  {
    label: 'Metricas',
    icon: BarChart3,
    url: '/metrics',
  },
  {
    label: 'Usuarios',
    icon: UserCog,
    url: '/users',
    adminOnly: true,
  },
] as const satisfies readonly {
  label: string
  icon: LucideIcon
  url: string
  adminOnly?: boolean
}[]

export type DashboardNavItem = (typeof DASHBOARD_NAV_ITEMS)[number]
