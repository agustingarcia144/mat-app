import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'

type CodeValidationReason = 'invalid' | 'expired' | 'revoked' | 'consumed'

function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function getValidationReason(
  code: Doc<'organizationCreationInviteCodes'> | null,
  now: number
): CodeValidationReason | null {
  if (!code) return 'invalid'
  if (code.status === 'revoked') return 'revoked'
  if (typeof code.expiresAt === 'number' && code.expiresAt < now) return 'expired'
  if (code.status === 'consumed' || code.usedCount >= code.maxUses) return 'consumed'
  if (code.status !== 'active') return 'invalid'
  return null
}

function getValidationMessage(reason: Exclude<CodeValidationReason, 'invalid'>): string {
  if (reason === 'expired') return 'El codigo de invitacion vencio'
  if (reason === 'revoked') return 'El codigo de invitacion fue revocado'
  return 'El codigo de invitacion ya fue utilizado'
}

function slugifyOrganizationName(name: string): string {
  const withoutAccents = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const slug = withoutAccents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return slug || 'organizacion'
}

async function ensureUniqueOrganizationSlug(
  ctx: any,
  baseSlug: string
): Promise<string> {
  let candidate = baseSlug
  let counter = 2
  while (true) {
    const exists = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q: any) => q.eq('slug', candidate))
      .first()
    if (!exists) return candidate
    candidate = `${baseSlug}-${counter}`
    counter += 1
  }
}

export const getOrgCreationCodeByHashInternal = internalQuery({
  args: {
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('organizationCreationInviteCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', args.codeHash))
      .first()
  },
})

export const validateOrgCreationCode = action({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedCode = normalizeInviteCode(args.code)
    if (!normalizedCode) {
      return { valid: false, reason: 'invalid' as const }
    }

    const codeHash = await ctx.runAction(internal.orgCreationCodesNode.hashInviteCode, {
      code: normalizedCode,
    })

    const code = await ctx.runQuery(internal.orgCreationCodes.getOrgCreationCodeByHashInternal, {
      codeHash,
    })

    const reason = getValidationReason(code, Date.now())
    if (reason) {
      return {
        valid: false,
        reason,
      }
    }

    return {
      valid: true,
      reason: null,
    }
  },
})

export const redeemCodeAndCreateOrganizationInternal = internalMutation({
  args: {
    codeHash: v.string(),
    userId: v.string(),
    user: v.object({
      email: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      fullName: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      username: v.optional(v.string()),
    }),
    organization: v.object({
      name: v.string(),
      address: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      timezone: v.optional(v.string()),
    }),
    profile: v.object({
      phone: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query('organizationCreationInviteCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', args.codeHash))
      .first()

    const reason = getValidationReason(code, Date.now())
    if (reason) {
      if (reason === 'invalid') {
        throw new Error('Codigo de invitacion invalido')
      }
      throw new Error(getValidationMessage(reason))
    }

    const now = Date.now()
    const organizationName = args.organization.name.trim()
    if (!organizationName) {
      throw new Error('El nombre de la organizacion es obligatorio')
    }

    const baseSlug = slugifyOrganizationName(organizationName)
    const slug = await ensureUniqueOrganizationSlug(ctx, baseSlug)

    const organizationId = await ctx.db.insert('organizations', {
      name: organizationName,
      slug,
      address: args.organization.address?.trim() || undefined,
      phone: args.organization.phone?.trim() || undefined,
      email: args.organization.email?.trim() || undefined,
      timezone: args.organization.timezone?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('organizationMemberships', {
      organizationId,
      userId: args.userId,
      role: 'admin',
      status: 'active',
      joinedAt: now,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', args.userId))
      .first()

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        firstName: existingUser.firstName ?? args.user.firstName,
        lastName: existingUser.lastName ?? args.user.lastName,
        fullName: existingUser.fullName ?? args.user.fullName,
        email: existingUser.email ?? args.user.email,
        imageUrl: existingUser.imageUrl ?? args.user.imageUrl,
        username: existingUser.username ?? args.user.username,
        phone: args.profile.phone?.trim() || existingUser.phone,
        activeOrganizationId: organizationId,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('users', {
        externalId: args.userId,
        firstName: args.user.firstName,
        lastName: args.user.lastName,
        fullName: args.user.fullName,
        email: args.user.email,
        imageUrl: args.user.imageUrl,
        username: args.user.username,
        phone: args.profile.phone?.trim() || undefined,
        onboardingCompleted: false,
        activeOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      })
    }

    const nextUsedCount = code!.usedCount + 1
    await ctx.db.patch(code!._id, {
      usedCount: nextUsedCount,
      consumedAt: now,
      consumedByUserId: args.userId,
      consumedOrganizationId: organizationId,
      status: nextUsedCount >= code!.maxUses ? 'consumed' : 'active',
      updatedAt: now,
    })

    return {
      organizationId,
      organizationSlug: slug,
    }
  },
})

export const redeemCodeAndCreateOrganization: ReturnType<typeof action> = action({
  args: {
    code: v.string(),
    organizationName: v.string(),
    organizationAddress: v.optional(v.string()),
    organizationPhone: v.optional(v.string()),
    organizationEmail: v.optional(v.string()),
    organizationTimezone: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const normalizedCode = normalizeInviteCode(args.code)
    if (!normalizedCode) {
      throw new Error('Codigo de invitacion invalido')
    }

    const codeHash = await ctx.runAction(internal.orgCreationCodesNode.hashInviteCode, {
      code: normalizedCode,
    })

    return await ctx.runMutation(
      internal.orgCreationCodes.redeemCodeAndCreateOrganizationInternal,
      {
        codeHash,
        userId: identity.subject,
        user: {
          email: identity.email ?? undefined,
          firstName: identity.givenName ?? undefined,
          lastName: identity.familyName ?? undefined,
          fullName: identity.name ?? undefined,
          imageUrl: identity.pictureUrl ?? undefined,
          username: identity.nickname ?? undefined,
        },
        organization: {
          name: args.organizationName,
          address: args.organizationAddress,
          phone: args.organizationPhone,
          email: args.organizationEmail,
          timezone: args.organizationTimezone,
        },
        profile: {
          phone: args.phone,
        },
      }
    )
  },
})

export const createOrgCreationCodeInternal = internalMutation({
  args: {
    codeHash: v.string(),
    maxUses: v.number(),
    expiresAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert('organizationCreationInviteCodes', {
      codeHash: args.codeHash,
      status: 'active',
      expiresAt: args.expiresAt,
      maxUses: Math.max(1, args.maxUses),
      usedCount: 0,
      createdBy: args.createdBy,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Create an org creation code from a plain code string. Use this when you have
 * a specific code value (e.g. from dashboard). The code is normalized and hashed
 * the same way as during validation, so the same string (any casing/spaces) will
 * validate successfully.
 * Do NOT pass the raw code to createOrgCreationCodeInternal as codeHash — that
 * stores the plain string and validation will fail (it looks up by hash).
 */
export const createOrgCreationCodeFromPlainCodeInternal = internalAction({
  args: {
    code: v.string(),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const normalizedCode = normalizeInviteCode(args.code)
    if (!normalizedCode) {
      throw new Error('El codigo no puede estar vacio despues de normalizar')
    }
    const codeHash = await ctx.runAction(internal.orgCreationCodesNode.hashInviteCode, {
      code: normalizedCode,
    })
    const codeId = await ctx.runMutation(internal.orgCreationCodes.createOrgCreationCodeInternal, {
      codeHash,
      maxUses: Math.max(1, args.maxUses ?? 1),
      expiresAt: args.expiresAt,
      createdBy: args.createdBy,
      metadata: args.metadata,
    })
    return {
      codeId,
      code: normalizedCode,
    }
  },
})

export const issueOrgCreationCode: ReturnType<typeof internalAction> = internalAction({
  args: {
    maxUses: v.optional(v.number()),
    expiresInDays: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const generatedCode = await ctx.runAction(
      internal.orgCreationCodesNode.generateInviteCode,
      {}
    )
    const codeHash = await ctx.runAction(internal.orgCreationCodesNode.hashInviteCode, {
      code: normalizeInviteCode(generatedCode),
    })

    const expiresAt =
      typeof args.expiresInDays === 'number'
        ? Date.now() + Math.max(1, args.expiresInDays) * 24 * 60 * 60 * 1000
        : undefined

    const codeId = await ctx.runMutation(internal.orgCreationCodes.createOrgCreationCodeInternal, {
      codeHash,
      maxUses: args.maxUses ?? 1,
      expiresAt,
      createdBy: args.createdBy,
      metadata: args.metadata,
    })

    return {
      codeId,
      code: generatedCode,
      expiresAt: expiresAt ?? null,
    }
  },
})
