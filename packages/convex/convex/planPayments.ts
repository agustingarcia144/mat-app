import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from './permissions'

type InterestTier = {
  daysAfterWindowEnd: number
  type: 'percentage' | 'fixed'
  value: number
}

type AppliedTier = InterestTier & { amountArs: number }

function computeInterest(
  baseAmount: number,
  tiers: InterestTier[],
  billingPeriod: string,
  paymentWindowEndDay: number,
  nowMs: number
): { applied: AppliedTier[]; totalArs: number; totalAmount: number } {
  const [yearStr, monthStr] = billingPeriod.split('-')
  const windowEndMs = Date.UTC(
    parseInt(yearStr!, 10),
    parseInt(monthStr!, 10) - 1,
    paymentWindowEndDay
  )
  const daysElapsed = Math.max(0, Math.floor((nowMs - windowEndMs) / 86400000))

  if (daysElapsed === 0 || tiers.length === 0) {
    return { applied: [], totalArs: 0, totalAmount: baseAmount }
  }

  const applied: AppliedTier[] = []
  let totalArs = 0

  for (const tier of tiers) {
    if (daysElapsed >= tier.daysAfterWindowEnd) {
      const amountArs =
        tier.type === 'percentage'
          ? Math.round(baseAmount * (tier.value / 100))
          : Math.round(tier.value)
      applied.push({ ...tier, amountArs })
      totalArs += amountArs
    }
  }

  return { applied, totalArs, totalAmount: baseAmount + totalArs }
}

/**
 * Get the current user's payment for the current billing period.
 */
export const getMyCurrentPeriodPayment = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx)
    if (!orgCtx) return null

    const { identity, membership } = orgCtx

    // Get current subscription
    const subscription = await ctx.db
      .query('memberPlanSubscriptions')
      .withIndex('by_organization_user', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('userId', identity.subject)
      )
      .filter((q) => q.neq(q.field('status'), 'cancelled'))
      .first()

    if (!subscription) return null

    const plan = await ctx.db.get(subscription.planId)

    const d = new Date()
    const billingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const payment = await ctx.db
      .query('planPayments')
      .withIndex('by_subscription_period', (q) =>
        q
          .eq('subscriptionId', subscription._id)
          .eq('billingPeriod', billingPeriod)
      )
      .first()

    if (!payment) return null

    return {
      ...payment,
      planInterestTiers: plan?.interestTiers ?? [],
      planPaymentWindowEndDay: plan?.paymentWindowEndDay ?? 28,
    }
  },
})

/**
 * Get a single payment by ID (admin/trainer or owner).
 */
export const getById = query({
  args: { paymentId: v.id('planPayments') },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.organizationId !== membership.organizationId) return null
    return payment
  },
})

/**
 * Get the current user's payment history.
 */
export const getMyPayments = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx)
    if (!orgCtx) return []

    const { identity, membership } = orgCtx

    const payments = await ctx.db
      .query('planPayments')
      .withIndex('by_organization_user', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('userId', identity.subject)
      )
      .collect()

    // Sort newest first
    return payments.sort((a, b) => b.createdAt - a.createdAt)
  },
})

/**
 * Get all payments pending review (admin/trainer).
 */
export const getPendingByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const payments = await ctx.db
      .query('planPayments')
      .withIndex('by_organization_status', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('status', 'in_review')
      )
      .collect()

    return await enrichPayments(ctx, payments)
  },
})

/**
 * Get all payments for the org, optionally filtered by status (admin/trainer).
 */
export const getByOrganization = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('in_review'),
        v.literal('approved'),
        v.literal('declined')
      )
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const payments = args.status
      ? await ctx.db
          .query('planPayments')
          .withIndex('by_organization_status', (q) =>
            q
              .eq('organizationId', membership.organizationId)
              .eq('status', args.status!)
          )
          .collect()
      : await ctx.db
          .query('planPayments')
          .withIndex('by_organization', (q) =>
            q.eq('organizationId', membership.organizationId)
          )
          .collect()

    const enriched = await enrichPayments(ctx, payments)
    return enriched.sort((a, b) => b.createdAt - a.createdAt)
  },
})

/**
 * Get the download URL for a proof file.
 */
export const getProofUrl = query({
  args: {
    paymentId: v.id('planPayments'),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)

    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.organizationId !== membership.organizationId) {
      return null
    }

    if (!payment.proofStorageId) return null

    try {
      const url = await ctx.storage.getUrl(payment.proofStorageId)
      if (!url) return null
      return { url, contentType: payment.proofContentType ?? null }
    } catch {
      return null
    }
  },
})

/**
 * Generate an upload URL for proof of payment.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Upload proof of payment. Sets the payment status to in_review.
 * Allowed when status is 'pending' or 'declined' (re-upload).
 */
export const uploadProof = mutation({
  args: {
    paymentId: v.id('planPayments'),
    storageId: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const payment = await ctx.db.get(args.paymentId)
    if (!payment) {
      throw new Error('Pago no encontrado')
    }
    if (payment.userId !== identity.subject) {
      throw new Error('No podés subir comprobante para otro usuario')
    }
    if (payment.status !== 'pending' && payment.status !== 'declined') {
      throw new Error('No se puede subir comprobante en este estado')
    }

    // Delete old proof file if re-uploading
    if (payment.proofStorageId) {
      try {
        await ctx.storage.delete(payment.proofStorageId)
      } catch {
        // Ignore if file already deleted
      }
    }

    // Calculate interest at upload time
    const subscription = await ctx.db.get(payment.subscriptionId)
    const plan = subscription ? await ctx.db.get(subscription.planId) : null

    const now = Date.now()
    const interest =
      plan?.interestTiers?.length
        ? computeInterest(
            payment.amountArs,
            plan.interestTiers as InterestTier[],
            payment.billingPeriod,
            plan.paymentWindowEndDay,
            now
          )
        : { applied: [], totalArs: 0, totalAmount: payment.amountArs }

    await ctx.db.patch(args.paymentId, {
      proofStorageId: args.storageId,
      proofFileName: args.fileName,
      proofContentType: args.contentType,
      proofUploadedAt: now,
      status: 'in_review',
      interestApplied: interest.applied.length ? interest.applied : undefined,
      interestTotalArs: interest.totalArs > 0 ? interest.totalArs : undefined,
      totalAmountArs: interest.totalAmount,
      // Clear previous review data on re-upload
      reviewedBy: undefined,
      reviewedAt: undefined,
      reviewNotes: undefined,
      updatedAt: now,
    })
  },
})

/**
 * Admin approves a payment. Reactivates suspended subscriptions.
 */
export const approve = mutation({
  args: {
    paymentId: v.id('planPayments'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error('Pago no encontrado')
    }
    if (payment.status !== 'in_review') {
      throw new Error('Este pago no está en revisión')
    }

    const now = Date.now()
    await ctx.db.patch(args.paymentId, {
      status: 'approved',
      reviewedBy: identity.subject,
      reviewedAt: now,
      reviewNotes: args.notes?.trim() || undefined,
      updatedAt: now,
    })

    // Reactivate subscription if it was suspended
    const subscription = await ctx.db.get(payment.subscriptionId)
    if (subscription && subscription.status === 'suspended') {
      await ctx.db.patch(subscription._id, {
        status: 'active',
        suspendedAt: undefined,
        updatedAt: now,
      })
    }
  },
})

/**
 * Admin declines a payment. Member can re-upload.
 */
export const decline = mutation({
  args: {
    paymentId: v.id('planPayments'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error('Pago no encontrado')
    }
    if (payment.status !== 'in_review') {
      throw new Error('Este pago no está en revisión')
    }

    const now = Date.now()
    await ctx.db.patch(args.paymentId, {
      status: 'declined',
      reviewedBy: identity.subject,
      reviewedAt: now,
      reviewNotes: args.notes?.trim() || undefined,
      updatedAt: now,
    })
  },
})

/**
 * Admin deletes a payment record (e.g. approved by mistake).
 * Removes the associated proof file from storage if present.
 */
export const remove = mutation({
  args: { paymentId: v.id('planPayments') },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.organizationId !== membership.organizationId) {
      throw new Error('Pago no encontrado')
    }

    // Delete the proof file from storage if one was uploaded
    if (payment.proofStorageId) {
      try {
        await ctx.storage.delete(payment.proofStorageId)
      } catch {
        // Ignore if already deleted
      }
    }

    await ctx.db.delete(args.paymentId)
  },
})

/**
 * Admin/trainer records a payment on behalf of a member (cash or bank transfer).
 * The payment is created as approved immediately — no review step needed.
 * For bank transfers the admin may optionally attach proof.
 */
export const recordPayment = mutation({
  args: {
    subscriptionId: v.id('memberPlanSubscriptions'),
    billingPeriod: v.string(), // "YYYY-MM"
    paymentMethod: v.union(v.literal('cash'), v.literal('bank_transfer')),
    amountArs: v.optional(v.number()), // Override; defaults to plan price
    notes: v.optional(v.string()),
    // Optional proof (bank transfer only)
    proofStorageId: v.optional(v.id('_storage')),
    proofFileName: v.optional(v.string()),
    proofContentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)
    await requireAdminOrTrainer(ctx, membership.organizationId)

    const subscription = await ctx.db.get(args.subscriptionId)
    if (
      !subscription ||
      subscription.organizationId !== membership.organizationId
    ) {
      throw new Error('Suscripción no encontrada')
    }

    const plan = await ctx.db.get(subscription.planId)
    if (!plan) throw new Error('Plan no encontrado')

    // Validate billing period format
    if (!/^\d{4}-\d{2}$/.test(args.billingPeriod)) {
      throw new Error('Período de facturación inválido (esperado YYYY-MM)')
    }

    // Check for duplicate payment in the same period
    const existing = await ctx.db
      .query('planPayments')
      .withIndex('by_subscription_period', (q) =>
        q
          .eq('subscriptionId', args.subscriptionId)
          .eq('billingPeriod', args.billingPeriod)
      )
      .first()
    if (existing && existing.status === 'approved') {
      throw new Error('Ya existe un pago aprobado para este período')
    }

    const now = Date.now()
    const amountArs = args.amountArs ?? plan.priceArs

    if (existing) {
      // Update the existing pending/declined/in_review payment
      await ctx.db.patch(existing._id, {
        status: 'approved',
        amountArs,
        totalAmountArs: amountArs,
        paymentMethod: args.paymentMethod,
        recordedBy: identity.subject,
        reviewedBy: identity.subject,
        reviewedAt: now,
        reviewNotes: args.notes?.trim() || undefined,
        proofStorageId: args.proofStorageId,
        proofFileName: args.proofFileName,
        proofContentType: args.proofContentType,
        proofUploadedAt: args.proofStorageId ? now : undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('planPayments', {
        organizationId: membership.organizationId,
        userId: subscription.userId,
        subscriptionId: args.subscriptionId,
        planId: subscription.planId,
        billingPeriod: args.billingPeriod,
        amountArs,
        totalAmountArs: amountArs,
        paymentMethod: args.paymentMethod,
        recordedBy: identity.subject,
        status: 'approved',
        reviewedBy: identity.subject,
        reviewedAt: now,
        reviewNotes: args.notes?.trim() || undefined,
        proofStorageId: args.proofStorageId,
        proofFileName: args.proofFileName,
        proofContentType: args.proofContentType,
        proofUploadedAt: args.proofStorageId ? now : undefined,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Reactivate subscription if it was suspended
    if (subscription.status === 'suspended') {
      await ctx.db.patch(subscription._id, {
        status: 'active',
        suspendedAt: undefined,
        updatedAt: now,
      })
    }
  },
})

/**
 * Enrich payments with user and plan details.
 */
async function enrichPayments(
  ctx: { db: any },
  payments: any[]
) {
  return await Promise.all(
    payments.map(async (payment) => {
      const [plan, user] = await Promise.all([
        ctx.db.get(payment.planId),
        ctx.db
          .query('users')
          .withIndex('by_externalId', (q: any) =>
            q.eq('externalId', payment.userId)
          )
          .first(),
      ])
      return {
        ...payment,
        planName: plan?.name ?? 'Plan eliminado',
        userFullName: user?.fullName ?? user?.email ?? payment.userId,
      }
    })
  )
}
