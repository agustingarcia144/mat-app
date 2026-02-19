import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { callClerkApi } from '@/lib/server/clerk-rest'
import { isOrgAdminRole } from '@/lib/security/roles'

type OrganizationPayload = {
  name?: string
  metadata?: {
    address?: string
    phone?: string
    email?: string
    logoUrl?: string
  }
}

type ClerkOrganization = {
  id: string
  name: string
  slug: string | null
  image_url?: string
  logo_url?: string
  public_metadata?: Record<string, unknown>
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? '' : normalized.slice(0, maxLength)
}

export async function PATCH(request: Request) {
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
      { error: 'Only organization admins can update organization settings' },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => null)) as OrganizationPayload | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const safeName = normalizeString(body.name, 80)
  if (safeName !== undefined && safeName.length > 0 && safeName.length < 2) {
    return NextResponse.json(
      { error: 'Organization name must be at least 2 characters long' },
      { status: 400 }
    )
  }

  const metadataInput = body.metadata ?? {}
  const nextMetadata: Record<string, string | null> = {}

  const address = normalizeString(metadataInput.address, 200)
  if (address !== undefined) nextMetadata.address = address || null

  const phone = normalizeString(metadataInput.phone, 30)
  if (phone !== undefined) nextMetadata.phone = phone || null

  const email = normalizeString(metadataInput.email, 120)
  if (email !== undefined) nextMetadata.email = email || null

  const logoUrl = normalizeString(metadataInput.logoUrl, 500)
  if (logoUrl !== undefined) nextMetadata.logoUrl = logoUrl || null

  if (safeName === undefined && Object.keys(nextMetadata).length === 0) {
    return NextResponse.json(
      { error: 'No valid organization updates were provided' },
      { status: 400 }
    )
  }

  const currentOrg = await callClerkApi<ClerkOrganization>(
    `/organizations/${orgId}`,
    { method: 'GET' }
  )
  if (!currentOrg.ok) {
    return NextResponse.json({ error: currentOrg.message }, { status: 502 })
  }

  const mergedMetadata = {
    ...(currentOrg.data.public_metadata ?? {}),
    ...nextMetadata,
  }

  const payload: Record<string, unknown> = {
    public_metadata: mergedMetadata,
  }
  if (safeName !== undefined && safeName.length > 0) {
    payload.name = safeName
  }

  const result = await callClerkApi<ClerkOrganization>(`/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  return NextResponse.json({
    organization: {
      id: result.data.id,
      name: result.data.name,
      slug: result.data.slug,
      imageUrl: result.data.image_url || result.data.logo_url || null,
      publicMetadata: result.data.public_metadata ?? {},
    },
  })
}
