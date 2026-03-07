import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { callClerkApi } from '@/lib/server/clerk-rest'
import {
  appRoleToClerkRole,
  clerkRoleToStaffInviteRole,
  getStaffInviteRoleLabel,
  isStaffInviteRole,
} from '@/lib/security/organization-invitations'
import { isOrgAdminRole } from '@/lib/security/roles'
import { normalizeString } from '@/lib/utils'

type InvitationPayload = {
  email?: unknown
  role?: unknown
}

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

type ClerkInvitationListResponse =
  | ClerkInvitation[]
  | {
      data?: ClerkInvitation[]
    }

function getPendingInvitations(
  payload: ClerkInvitationListResponse | null | undefined
): ClerkInvitation[] {
  const rawItems = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems.filter((item) => {
    const status = (item.status ?? 'pending').toLowerCase()
    return status === 'pending' && clerkRoleToStaffInviteRole(item.role) !== null
  })
}

function mapInvitation(invitation: ClerkInvitation) {
  const role = clerkRoleToStaffInviteRole(invitation.role)

  return {
    id: invitation.id,
    email: invitation.email_address ?? invitation.emailAddress ?? '',
    role: role ?? invitation.role,
    roleLabel: getStaffInviteRoleLabel(role ?? invitation.role),
    status: invitation.status ?? 'pending',
    createdAt: invitation.created_at ?? invitation.createdAt ?? Date.now(),
    updatedAt: invitation.updated_at ?? invitation.updatedAt ?? Date.now(),
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function requireAdminSession() {
  const session = await auth()

  if (!session.userId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    }
  }

  if (!session.orgId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'No active organization selected' },
        { status: 400 }
      ),
    }
  }

  if (!isOrgAdminRole(session.orgRole)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Only organization admins can manage invitations' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true as const,
    session,
  }
}

export async function GET() {
  const guard = await requireAdminSession()
  if (!guard.ok) {
    return guard.response
  }

  const result = await callClerkApi<ClerkInvitationListResponse>(
    `/organizations/${guard.session.orgId}/invitations`,
    { method: 'GET' }
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  const invitations = getPendingInvitations(result.data)
    .map(mapInvitation)
    .sort((a, b) => b.createdAt - a.createdAt)

  return NextResponse.json({ invitations })
}

export async function POST(request: Request) {
  const guard = await requireAdminSession()
  if (!guard.ok) {
    return guard.response
  }

  const body = (await request.json().catch(() => null)) as InvitationPayload | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const email = normalizeString(body.email, 120)?.toLowerCase() ?? ''
  const role = normalizeString(body.role, 32)

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Ingresa un email válido para enviar la invitación.' },
      { status: 400 }
    )
  }

  if (!isStaffInviteRole(role)) {
    return NextResponse.json(
      { error: 'Solo puedes invitar administradores o entrenadores.' },
      { status: 400 }
    )
  }

  const redirectUrl = new URL('/dashboard', request.url).toString()
  const result = await callClerkApi<ClerkInvitation>(
    `/organizations/${guard.session.orgId}/invitations`,
    {
      method: 'POST',
      body: JSON.stringify({
        inviter_user_id: guard.session.userId,
        email_address: email,
        role: appRoleToClerkRole(role),
        redirect_url: redirectUrl,
        public_metadata: {
          invitedRole: role,
        },
      }),
    }
  )

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message.includes('org:trainer')
          ? 'La organización no tiene habilitado el rol de Entrenador en Clerk. Configúralo y vuelve a intentar.'
          : result.message,
      },
      { status: result.status >= 400 ? result.status : 502 }
    )
  }

  return NextResponse.json(
    {
      invitation: mapInvitation(result.data),
      message: `Invitación enviada como ${getStaffInviteRoleLabel(role).toLowerCase()}.`,
    },
    { status: 201 }
  )
}
