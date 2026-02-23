import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { callClerkApi } from '@/lib/server/clerk-rest'
import { isOrgAdminRole } from '@/lib/security/roles'

/**
 * DELETE /api/secure/organization/members/[userId]
 * Removes a user from the current organization (revokes membership).
 * Clerk will send a webhook and Convex will sync the deletion.
 * Only org admins can call this. Cannot remove yourself.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: currentUserId, orgId, orgRole } = await auth()
  if (!currentUserId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!orgId) {
    return NextResponse.json(
      { error: 'No active organization selected' },
      { status: 400 }
    )
  }
  if (!isOrgAdminRole(orgRole)) {
    return NextResponse.json(
      { error: 'Only organization admins can remove members' },
      { status: 403 }
    )
  }

  const { userId: targetUserId } = await params
  if (!targetUserId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  if (targetUserId === currentUserId) {
    return NextResponse.json(
      { error: 'You cannot remove yourself from the organization' },
      { status: 400 }
    )
  }

  const result = await callClerkApi<unknown>(
    `/organizations/${orgId}/memberships/${targetUserId}`,
    { method: 'DELETE' }
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status >= 400 ? result.status : 502 }
    )
  }

  return NextResponse.json({ success: true })
}
