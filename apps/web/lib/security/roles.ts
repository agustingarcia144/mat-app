export function isOrgAdminRole(role: string | null | undefined) {
  if (!role) return false
  return role.toLowerCase().includes('admin')
}

export function isOrgStaffRole(role: string | null | undefined) {
  if (!role) return false
  const normalized = role.toLowerCase()
  return normalized.includes('admin') || normalized.includes('trainer')
}
