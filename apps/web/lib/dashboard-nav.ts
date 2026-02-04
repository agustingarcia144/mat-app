import type { LucideIcon } from 'lucide-react'
import { HomeIcon, UsersIcon, Dumbbell, ListChecks } from 'lucide-react'

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
] as const satisfies readonly {
  label: string
  icon: LucideIcon
  url: string
}[]

export type DashboardNavItem = (typeof DASHBOARD_NAV_ITEMS)[number]
