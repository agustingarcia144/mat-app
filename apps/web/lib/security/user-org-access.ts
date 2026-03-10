import { callClerkApi } from '@/lib/server/clerk-rest'
import { isOrgStaffRole } from './roles'

type ClerkOrganizationMembership = {
  role: string
  organization?: { id: string }
}

type ClerkUserOrganizationMembershipsResponse = {
  data: ClerkOrganizationMembership[]
  total_count?: number
}

/**
 * Returns true if the user has at least one organization where they have a staff role (admin or trainer).
 * Used to redirect users to org selection when they're in an org where they're only a member
 * but have another org where they're staff.
 */
export async function hasUserStaffOrganization(userId: string): Promise<boolean> {
  const result = await callClerkApi<ClerkUserOrganizationMembershipsResponse>(
    `/users/${userId}/organization_memberships?limit=50`
  )
  if (!result.ok || !result.data?.data) {
    return false
  }
  return result.data.data.some((m) => isOrgStaffRole(m.role))
}
