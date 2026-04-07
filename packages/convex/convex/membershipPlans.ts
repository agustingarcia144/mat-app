import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdmin,
  requireCurrentOrganizationMembership,
  requireActiveOrgContext,
} from './permissions'

/**
 * List plans for the organization.
 * Members see only active plans; admins/trainers see all.
 */
export const getByOrganization = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireActiveOrgContext(ctx)

    const plans = await ctx.db
      .query('membershipPlans')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .collect()

    const isAdmin =
      membership.role === 'admin' || membership.role === 'trainer'

    if (!isAdmin || args.activeOnly) {
      return plans.filter((p) => p.isActive)
    }

    return plans
  },
})

/**
 * Get a single plan by ID.
 */
export const getById = query({
  args: {
    planId: v.id('membershipPlans'),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    const plan = await ctx.db.get(args.planId)
    if (!plan || plan.organizationId !== membership.organizationId) {
      return null
    }

    return plan
  },
})

/**
 * Create a new membership plan (admin only).
 */
const interestTierV = v.object({
  daysAfterWindowEnd: v.number(),
  type: v.union(v.literal('percentage'), v.literal('fixed')),
  value: v.number(),
})

const advancePaymentDiscountV = v.object({
  months: v.number(),
  discountPercentage: v.number(),
})

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    priceArs: v.number(),
    weeklyClassLimit: v.number(),
    paymentWindowStartDay: v.number(),
    paymentWindowEndDay: v.number(),
    interestTiers: v.optional(v.array(interestTierV)),
    advancePaymentDiscounts: v.optional(v.array(advancePaymentDiscountV)),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    validatePlanFields(args)

    const now = Date.now()
    return await ctx.db.insert('membershipPlans', {
      organizationId: membership.organizationId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      priceArs: args.priceArs,
      weeklyClassLimit: args.weeklyClassLimit,
      paymentWindowStartDay: args.paymentWindowStartDay,
      paymentWindowEndDay: args.paymentWindowEndDay,
      interestTiers: args.interestTiers?.length ? args.interestTiers : undefined,
      advancePaymentDiscounts: args.advancePaymentDiscounts?.length ? args.advancePaymentDiscounts : undefined,
      isActive: true,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update an existing membership plan (admin only).
 */
export const update = mutation({
  args: {
    planId: v.id('membershipPlans'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceArs: v.optional(v.number()),
    weeklyClassLimit: v.optional(v.number()),
    paymentWindowStartDay: v.optional(v.number()),
    paymentWindowEndDay: v.optional(v.number()),
    interestTiers: v.optional(v.array(interestTierV)),
    advancePaymentDiscounts: v.optional(v.array(advancePaymentDiscountV)),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    const plan = await ctx.db.get(args.planId)
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error('Plan no encontrado')
    }

    const merged = {
      name: args.name ?? plan.name,
      description: args.description ?? plan.description,
      priceArs: args.priceArs ?? plan.priceArs,
      weeklyClassLimit: args.weeklyClassLimit ?? plan.weeklyClassLimit,
      paymentWindowStartDay:
        args.paymentWindowStartDay ?? plan.paymentWindowStartDay,
      paymentWindowEndDay:
        args.paymentWindowEndDay ?? plan.paymentWindowEndDay,
    }

    validatePlanFields(merged)

    const patch: Record<string, unknown> = { updatedAt: Date.now() }
    if (args.name !== undefined) patch.name = args.name.trim()
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined
    if (args.priceArs !== undefined) patch.priceArs = args.priceArs
    if (args.weeklyClassLimit !== undefined)
      patch.weeklyClassLimit = args.weeklyClassLimit
    if (args.paymentWindowStartDay !== undefined)
      patch.paymentWindowStartDay = args.paymentWindowStartDay
    if (args.paymentWindowEndDay !== undefined)
      patch.paymentWindowEndDay = args.paymentWindowEndDay
    if (args.interestTiers !== undefined)
      patch.interestTiers = args.interestTiers.length ? args.interestTiers : undefined
    if (args.advancePaymentDiscounts !== undefined)
      patch.advancePaymentDiscounts = args.advancePaymentDiscounts.length ? args.advancePaymentDiscounts : undefined

    await ctx.db.patch(args.planId, patch)
  },
})

/**
 * Toggle a plan's active status (admin only).
 */
export const toggleActive = mutation({
  args: {
    planId: v.id('membershipPlans'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdmin(ctx, membership.organizationId)

    const plan = await ctx.db.get(args.planId)
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error('Plan no encontrado')
    }

    await ctx.db.patch(args.planId, {
      isActive: !plan.isActive,
      updatedAt: Date.now(),
    })
  },
})

function validatePlanFields(fields: {
  name?: string
  priceArs?: number
  weeklyClassLimit?: number
  paymentWindowStartDay?: number
  paymentWindowEndDay?: number
}) {
  if (fields.name !== undefined && fields.name.trim().length === 0) {
    throw new Error('El nombre es requerido')
  }
  if (fields.priceArs !== undefined && fields.priceArs < 1) {
    throw new Error('El precio debe ser al menos $1')
  }
  if (fields.weeklyClassLimit !== undefined && fields.weeklyClassLimit < 1) {
    throw new Error('El límite semanal debe ser al menos 1')
  }
  if (fields.paymentWindowStartDay !== undefined) {
    if (
      fields.paymentWindowStartDay < 1 ||
      fields.paymentWindowStartDay > 28
    ) {
      throw new Error('El día de apertura debe ser entre 1 y 28')
    }
  }
  if (fields.paymentWindowEndDay !== undefined) {
    if (fields.paymentWindowEndDay < 1 || fields.paymentWindowEndDay > 28) {
      throw new Error('El día de cierre debe ser entre 1 y 28')
    }
  }
  if (
    fields.paymentWindowStartDay !== undefined &&
    fields.paymentWindowEndDay !== undefined &&
    fields.paymentWindowEndDay < fields.paymentWindowStartDay
  ) {
    throw new Error(
      'El día de cierre debe ser igual o posterior al día de apertura'
    )
  }
}
