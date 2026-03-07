export function isOrgAdminRole(role: string | null | undefined) {
  if (!role) return false
  return role.toLowerCase().includes('admin')
}

export function getOrgRoleLabel(role: string | null | undefined) {
  if (!role) return '—'

  const normalized = role.toLowerCase()

  if (normalized.includes('admin')) {
    return 'Admin'
  }

  if (
    normalized.includes('trainer') ||
    normalized.includes('teacher') ||
    normalized.includes('instructor')
  ) {
    return 'Entrenador'
  }

  if (normalized.includes('member') || normalized.includes('miembro')) {
    return 'Miembro'
  }

  return role
}

export function isOrgStaffRole(role: string | null | undefined) {
  if (!role) return false
  const normalized = role.toLowerCase()
  return normalized.includes('admin') || normalized.includes('trainer')
}

export function isWebStaffGuardEnabled() {
  return process.env.ENABLE_STAFF_WEB_GUARD !== 'false'
}
