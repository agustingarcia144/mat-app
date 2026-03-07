import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { callClerkApi } from '@/lib/server/clerk-rest'
import {
  clerkRoleToStaffInviteRole,
  getStaffInviteRoleLabel,
} from '@/lib/security/organization-invitations'
import { isOrgAdminRole } from '@/lib/security/roles'
import { normalizeString } from '@/lib/utils'

type ClerkInvitation = {
  id: string
  email_address?: string
  emailAddress?: string
  role: string
  status?: string
  created_at?: number
  createdAt?: number
  updated_at?: number
  updatedAt?: number
}

function mapInvitation(invitation: ClerkInvitation) {
  const role = clerkRoleToStaffInviteRole(invitation.role)

  return {
    id: invitation.id,
    email: invitation.email_address ?? invitation.emailAddress ?? '',
    role: role ?? invitation.role,
    roleLabel: getStaffInviteRoleLabel(role ?? invitation.role),
    status: invitation.status ?? 'revoked',
    createdAt: invitation.created_at ?? invitation.createdAt ?? Date.now(),
    updatedAt: invitation.updated_at ?? invitation.updatedAt ?? Date.now(),
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const { userId, orgId, orgRole } = await auth()

  if (!userId) {
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
      { error: 'Only organization admins can manage invitations' },
      { status: 403 }
    )
  }

  const { invitationId } = await params
  const safeInvitationId = normalizeString(invitationId, 120)

  if (!safeInvitationId) {
    return NextResponse.json(
      { error: 'Invitation ID required' },
      { status: 400 }
    )
  }

  const result = await callClerkApi<ClerkInvitation>(
    `/organizations/${orgId}/invitations/${safeInvitationId}/revoke`,
    { method: 'POST' }
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status >= 400 ? result.status : 502 }
    )
  }

  return NextResponse.json({
    success: true,
    invitation: mapInvitation(result.data),
  })
}
