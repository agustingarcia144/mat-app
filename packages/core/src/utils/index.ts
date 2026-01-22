// Shared utility functions
// Example: export const formatCurrency = (amount: number) => { ... }

import type { Member } from '../types'

/**
 * Type for membership data returned from Convex query
 */
export type MembershipData = {
  userId: string
  role: string
  status: string
  createdAt: number
  joinedAt: number
}

/**
 * Maps membership data from Convex to Member type for the table
 *
 * @param membership - Membership data from Convex query
 * @returns Member object formatted for the data table
 */
export function mapMembershipToMember(membership: MembershipData): Member {
  return {
    id: membership.userId,
    name: membership.userId, // TODO: Fetch user name from Clerk API or users table
    email: '', // TODO: Fetch user email from Clerk API or users table
    role: membership.role,
    status: membership.status,
    createdAt: new Date(membership.createdAt).toLocaleDateString(),
  }
}

/**
 * Maps an array of membership data to Member array
 */
export function mapMembershipsToMembers(
  memberships: MembershipData[]
): Member[] {
  return memberships.map(mapMembershipToMember)
}
