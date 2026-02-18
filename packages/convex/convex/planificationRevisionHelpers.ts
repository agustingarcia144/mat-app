import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

type DbCtx = MutationCtx | QueryCtx

export async function getLatestRevisionForPlanification(
  ctx: DbCtx,
  planificationId: Id<'planifications'>
) {
  return await ctx.db
    .query('planificationRevisions')
    .withIndex('by_planification_revisionNumber', (q) =>
      q.eq('planificationId', planificationId)
    )
    .order('desc')
    .first()
}

export async function resolveRevisionIdForPlanification(
  ctx: DbCtx,
  planificationId: Id<'planifications'>,
  revisionId?: Id<'planificationRevisions'>
) {
  if (revisionId) {
    const revision = await ctx.db.get(revisionId)
    if (!revision || revision.planificationId !== planificationId) {
      throw new Error('Revision does not belong to planification')
    }
    return revision._id
  }

  const planification = await ctx.db.get(planificationId)
  if (!planification) throw new Error('Planification not found')
  if (planification.currentRevisionId) return planification.currentRevisionId

  const latest = await getLatestRevisionForPlanification(ctx, planificationId)
  return latest?._id
}

export async function ensureCurrentRevisionForPlanification(
  ctx: MutationCtx,
  planificationId: Id<'planifications'>,
  createdBy: string
) {
  const planification = await ctx.db.get(planificationId)
  if (!planification) throw new Error('Planification not found')
  if (planification.currentRevisionId) return planification.currentRevisionId

  const latest = await getLatestRevisionForPlanification(ctx, planificationId)
  const now = Date.now()
  if (latest) {
    await ctx.db.patch(planificationId, {
      currentRevisionId: latest._id,
      updatedAt: now,
    })
    return latest._id
  }

  const initialRevisionId = await ctx.db.insert('planificationRevisions', {
    planificationId,
    revisionNumber: 1,
    name: planification.name,
    description: planification.description,
    createdBy,
    supersedesRevisionId: undefined,
    createdAt: now,
    updatedAt: now,
  })

  await ctx.db.patch(planificationId, {
    currentRevisionId: initialRevisionId,
    updatedAt: now,
  })

  return initialRevisionId
}

