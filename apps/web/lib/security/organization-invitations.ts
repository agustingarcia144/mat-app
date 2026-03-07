export const INVITABLE_STAFF_ROLES = ['admin', 'trainer'] as const

export type StaffInviteRole = (typeof INVITABLE_STAFF_ROLES)[number]
export type StaffInvitation = {
  id: string
  email: string
  role: StaffInviteRole | string
  roleLabel: string
  status: string
  createdAt: number
  updatedAt: number
}

const STAFF_INVITE_ROLE_LABELS: Record<StaffInviteRole, string> = {
  admin: 'Admin',
  trainer: 'Entrenador',
}

export function isStaffInviteRole(value: unknown): value is StaffInviteRole {
  return (
    typeof value === 'string' &&
    INVITABLE_STAFF_ROLES.includes(value as StaffInviteRole)
  )
}

export function getStaffInviteRoleLabel(role: StaffInviteRole | string) {
  return STAFF_INVITE_ROLE_LABELS[role as StaffInviteRole] ?? role
}

export function appRoleToClerkRole(role: StaffInviteRole) {
  return role === 'admin' ? 'org:admin' : 'org:trainer'
}

export function clerkRoleToStaffInviteRole(role: string): StaffInviteRole | null {
  const normalized = role.toLowerCase()

  if (normalized.includes('admin')) {
    return 'admin'
  }

  if (
    normalized.includes('trainer') ||
    normalized.includes('teacher') ||
    normalized.includes('instructor')
  ) {
    return 'trainer'
  }

  return null
}
