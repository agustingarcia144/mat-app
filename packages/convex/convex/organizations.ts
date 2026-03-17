import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { requireAdmin, requireCurrentOrganizationMembership } from './permissions'

type StaffInviteRole = 'admin' | 'trainer'

function normalizeRole(value: string): StaffInviteRole | null {
  if (value === 'admin' || value === 'trainer') {
    return value
  }
  return null
}

async function resolveLogoUrl(
  ctx: any,
  logoStorageId: unknown,
  logoUrl: string | undefined
) {
  if (logoStorageId) {
    try {
      const storageUrl = await ctx.storage.getUrl(logoStorageId)
      if (storageUrl) return storageUrl
    } catch {
      // Ignore stale storage references and use legacy value.
    }
  }
  return logoUrl ?? ''
}

export const getCurrentOrganization = query({
  args: {},
  handler: async (ctx) => {
    try {
      const membership = await requireCurrentOrganizationMembership(ctx)
      const organization = await ctx.db.get(membership.organizationId)
      if (!organization) {
        return null
      }
      const resolvedLogoUrl = await resolveLogoUrl(
        ctx,
        organization.logoStorageId,
        organization.logoUrl
      )
      return {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        address: organization.address ?? '',
        phone: organization.phone ?? '',
        email: organization.email ?? '',
        logoUrl: resolvedLogoUrl,
        logoStorageId: organization.logoStorageId ?? null,
        role: membership.role,
      }
    } catch {
      return null
    }
  },
})

export const generateOrganizationLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)
    return await ctx.storage.generateUploadUrl()
  },
})

export const updateCurrentOrganization = mutation({
  args: {
    name: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        address: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        logoStorageId: v.optional(v.id('_storage')),
      })
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    const organization = await ctx.db.get(membership.organizationId)
    if (!organization) {
      throw new Error('Organization not found')
    }

    const patch: {
      name?: string
      address?: string
      phone?: string
      email?: string
      logoStorageId?: Id<'_storage'>
      updatedAt: number
    } = {
      updatedAt: Date.now(),
    }

    if (typeof args.name === 'string') {
      patch.name = args.name.trim()
    }
    if (args.metadata?.address !== undefined) {
      patch.address = args.metadata.address.trim()
    }
    if (args.metadata?.phone !== undefined) {
      patch.phone = args.metadata.phone.trim()
    }
    if (args.metadata?.email !== undefined) {
      patch.email = args.metadata.email.trim()
    }
    if (args.metadata?.logoStorageId !== undefined) {
      patch.logoStorageId = args.metadata.logoStorageId
      if (
        organization.logoStorageId &&
        organization.logoStorageId !== args.metadata.logoStorageId
      ) {
        await ctx.storage.delete(organization.logoStorageId)
      }
    }

    await ctx.db.patch(organization._id, patch)
    return { success: true }
  },
})

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    if (membership.role !== 'admin') {
      return []
    }

    const invitations = await ctx.db
      .query('organizationInvitations')
      .withIndex('by_organization_status', (q) =>
        q.eq('organizationId', membership.organizationId).eq('status', 'pending')
      )
      .collect()

    return invitations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((invitation) => ({
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        roleLabel: invitation.role === 'admin' ? 'Admin' : 'Entrenador',
        status: invitation.status,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
      }))
  },
})

export const createInvitation = mutation({
  args: {
    email: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    const role = normalizeRole(args.role)
    if (!role) {
      throw new Error('Invalid role')
    }

    const normalizedEmail = args.email.trim().toLowerCase()
    const now = Date.now()

    const existingPending = await ctx.db
      .query('organizationInvitations')
      .withIndex('by_organization_email', (q) =>
        q.eq('organizationId', membership.organizationId).eq('email', normalizedEmail)
      )
      .filter((q) => q.eq(q.field('status'), 'pending'))
      .first()

    if (existingPending) {
      throw new Error('Ya existe una invitacion pendiente para este email')
    }

    const invitationId = await ctx.db.insert('organizationInvitations', {
      organizationId: membership.organizationId,
      email: normalizedEmail,
      role,
      status: 'pending',
      invitedBy: membership.userId,
      createdAt: now,
      updatedAt: now,
    })

    return {
      invitation: {
        id: invitationId,
        email: normalizedEmail,
        role,
        roleLabel: role === 'admin' ? 'Admin' : 'Entrenador',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    }
  },
})

export const revokeInvitation = mutation({
  args: {
    invitationId: v.id('organizationInvitations'),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.organizationId !== membership.organizationId) {
      throw new Error('Invitation not found')
    }
    if (invitation.status !== 'pending') {
      throw new Error('Invitation is no longer pending')
    }

    await ctx.db.patch(invitation._id, {
      status: 'revoked',
      updatedAt: Date.now(),
    })

    return { success: true }
  },
})
