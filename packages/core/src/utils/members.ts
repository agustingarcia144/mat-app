import { Member, MembershipData } from '../types'

/**
 * Maps membership data from Convex to Member type for the table
 *
 * @param membership - Membership data from Convex query
 * @returns Member object formatted for the data table
 */
export function mapMembershipToMember(membership: MembershipData): Member {
  // Use fullName if available, otherwise construct from firstName/lastName, or fallback to userId
  const name =
    membership.fullName ||
    (membership.firstName && membership.lastName
      ? `${membership.firstName} ${membership.lastName}`.trim()
      : membership.firstName || membership.lastName || membership.userId)

  return {
    id: membership.userId,
    name,
    firstName: membership.firstName,
    lastName: membership.lastName,
    fullName: membership.fullName,
    email: membership.email,
    imageUrl: membership.imageUrl,
    username: membership.username,
    role: membership.role,
    status: membership.status,
    createdAt: new Date(membership.createdAt).toLocaleDateString(),
    birthDate: new Date(membership.birthDate as number).toLocaleDateString(),
    joinedAt: new Date(membership.joinedAt as number).toLocaleDateString(),
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
