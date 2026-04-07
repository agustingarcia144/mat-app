import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireOrganizationMembership,
} from './permissions'
import {
  ensureCurrentRevisionForPlanification,
  getLatestRevisionForPlanification,
  resolveRevisionIdForPlanification,
} from './planificationRevisionHelpers'

/**
 * Create a new planification
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const membership = await requireCurrentOrganizationMembership(ctx)

    await requireAdminOrTrainer(ctx, membership.organizationId)

    const now = Date.now()

    // Templates must not belong to any folder
    const folderId = args.isTemplate ? undefined : args.folderId

    const planificationId = await ctx.db.insert('planifications', {
      organizationId: membership.organizationId,
      name: args.name,
      description: args.description,
      folderId,
      isTemplate: args.isTemplate,
      hasEverBeenAssigned: false,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    const revisionId = await ctx.db.insert('planificationRevisions', {
      planificationId,
      revisionNumber: 1,
      name: args.name,
      description: args.description,
      createdBy: identity.subject,
      supersedesRevisionId: undefined,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(planificationId, {
      currentRevisionId: revisionId,
      updatedAt: now,
    })

    return planificationId
  },
})

/**
 * Update a planification
 */
export const update = mutation({
  args: {
    id: v.id('planifications'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const { id, ...updates } = args

    // Templates must not belong to any folder
    const patch: Record<string, unknown> = { ...updates, updatedAt: Date.now() }
    const isTemplate = updates.isTemplate ?? planification.isTemplate
    if (isTemplate) {
      patch.folderId = undefined
    }

    await ctx.db.patch(id, patch)
  },
})

/**
 * Create a new immutable revision for a planification.
 */
export const createRevision = mutation({
  args: {
    id: v.id('planifications'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const now = Date.now()
    const isTemplate = args.isTemplate ?? planification.isTemplate
    const name = args.name ?? planification.name
    const description =
      args.description !== undefined ? args.description : planification.description
    const folderId = isTemplate ? undefined : (args.folderId ?? planification.folderId)

    const supersedesRevisionId = await ensureCurrentRevisionForPlanification(
      ctx,
      args.id,
      identity.subject
    )
    const latestRevision = await getLatestRevisionForPlanification(ctx, args.id)
    const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1

    const revisionId = await ctx.db.insert('planificationRevisions', {
      planificationId: args.id,
      revisionNumber,
      name,
      description,
      createdBy: identity.subject,
      supersedesRevisionId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.id, {
      name,
      description,
      folderId,
      isTemplate,
      currentRevisionId: revisionId,
      updatedAt: now,
    })

    // Active assignments should follow the latest revision so members receive
    // updated planification fields (weeks/days/exercises/notes/comments).
    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()
    for (const assignment of assignments) {
      if (assignment.status !== 'active') continue
      if (assignment.revisionId === revisionId) continue
      await ctx.db.patch(assignment._id, {
        revisionId,
        updatedAt: now,
      })
    }

    return revisionId
  },
})

/**
 * Delete a planification and all related data
 */
export const remove = mutation({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const hasAssignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .first()
    if (hasAssignments) {
      throw new Error(
        'Cannot delete planification with assignment history. Archive it instead.'
      )
    }

    // Delete all workout weeks
    const workoutWeeks = await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()

    for (const week of workoutWeeks) {
      // Delete all workout days in this week
      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_week', (q) => q.eq('weekId', week._id))
        .collect()

      for (const day of workoutDays) {
        // Delete day exercises
        const dayExercises = await ctx.db
          .query('dayExercises')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()

        for (const exercise of dayExercises) {
          await ctx.db.delete(exercise._id)
        }

        await ctx.db.delete(day._id)
      }

      await ctx.db.delete(week._id)
    }

    // Delete assignments
    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()

    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id)
    }

    const revisions = await ctx.db
      .query('planificationRevisions')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()
    for (const revision of revisions) {
      await ctx.db.delete(revision._id)
    }

    // Delete the planification
    await ctx.db.delete(args.id)
  },
})

/**
 * Archive a planification. Hides it from trainer lists but preserves all
 * assignment and session data so members keep access to their workout history.
 */
export const archive = mutation({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const now = Date.now()
    await ctx.db.patch(args.id, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    })

    // Cancel any active assignments so nobody is currently assigned to an archived plan
    const assignments = await ctx.db
      .query('planificationAssignments')
      .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
      .collect()
    for (const assignment of assignments) {
      if (assignment.status === 'active') {
        await ctx.db.patch(assignment._id, { status: 'cancelled', updatedAt: now })
      }
    }
  },
})

/**
 * Unarchive a planification so it appears again in trainer lists.
 */
export const unarchive = mutation({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, planification.organizationId)

    const now = Date.now()
    await ctx.db.patch(args.id, {
      isArchived: false,
      archivedAt: undefined,
      updatedAt: now,
    })
  },
})

/**
 * Duplicate a planification
 */
export const duplicate = mutation({
  args: {
    id: v.id('planifications'),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const original = await ctx.db.get(args.id)
    if (!original) {
      throw new Error('Planification not found')
    }

    await requireAdminOrTrainer(ctx, original.organizationId)

    const now = Date.now()

    // Create new planification
    const newPlanificationId = await ctx.db.insert('planifications', {
      organizationId: original.organizationId,
      name: args.name || `${original.name} (copia)`,
      description: original.description,
      folderId: original.folderId,
      isTemplate: original.isTemplate,
      hasEverBeenAssigned: false,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    const revisionId = await ctx.db.insert('planificationRevisions', {
      planificationId: newPlanificationId,
      revisionNumber: 1,
      name: args.name || `${original.name} (copia)`,
      description: original.description,
      createdBy: identity.subject,
      supersedesRevisionId: undefined,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(newPlanificationId, {
      currentRevisionId: revisionId,
      updatedAt: now,
    })

    const sourceRevisionId = await resolveRevisionIdForPlanification(ctx, args.id)

    // Duplicate workout weeks
    let workoutWeeks = await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification_revision', (q) =>
        q.eq('planificationId', args.id).eq('revisionId', sourceRevisionId)
      )
      .collect()
    if (workoutWeeks.length === 0) {
      workoutWeeks = await ctx.db
        .query('workoutWeeks')
        .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
        .collect()
    }

    for (const week of workoutWeeks) {
      const newWeekId = await ctx.db.insert('workoutWeeks', {
        planificationId: newPlanificationId,
        revisionId,
        name: week.name,
        order: week.order,
        notes: week.notes,
        createdAt: now,
        updatedAt: now,
      })

      // Duplicate workout days
      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_week', (q) => q.eq('weekId', week._id))
        .collect()

      for (const day of workoutDays) {
        const newDayId = await ctx.db.insert('workoutDays', {
          weekId: newWeekId,
          planificationId: newPlanificationId,
          revisionId,
          name: day.name,
          order: day.order,
          dayOfWeek: day.dayOfWeek,
          notes: day.notes,
          createdAt: now,
          updatedAt: now,
        })

        // Duplicate exercise blocks for this day (so blockId on dayExercises can be mapped)
        const blocks = await ctx.db
          .query('exerciseBlocks')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()
        const oldBlockIdToNew = new Map<Id<'exerciseBlocks'>, Id<'exerciseBlocks'>>()
        for (const block of blocks) {
          const newBlockId = await ctx.db.insert('exerciseBlocks', {
            workoutDayId: newDayId,
            revisionId,
            name: block.name,
            order: block.order,
            notes: block.notes,
            createdAt: now,
            updatedAt: now,
          })
          oldBlockIdToNew.set(block._id, newBlockId)
        }

        // Duplicate day exercises (with blockId mapped to new blocks when set)
        const dayExercises = await ctx.db
          .query('dayExercises')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()

        for (const exercise of dayExercises) {
          const newBlockId = exercise.blockId
            ? oldBlockIdToNew.get(exercise.blockId)
            : undefined
          await ctx.db.insert('dayExercises', {
            workoutDayId: newDayId,
            revisionId,
            exerciseId: exercise.exerciseId,
            blockId: newBlockId,
            order: exercise.order,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
            prPercentage: exercise.prPercentage,
            timeSeconds: exercise.timeSeconds,
            notes: exercise.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    return newPlanificationId
  },
})

/**
 * Create a new planification from a template (copies full content, creates planification not template)
 */
export const createFromTemplate = mutation({
  args: {
    templateId: v.id('planifications'),
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const template = await ctx.db.get(args.templateId)
    if (!template) {
      throw new Error('Plantilla no encontrada')
    }
    if (!template.isTemplate) {
      throw new Error('Solo se pueden usar plantillas como base')
    }

    await requireAdminOrTrainer(ctx, template.organizationId)

    const now = Date.now()

    const newPlanificationId = await ctx.db.insert('planifications', {
      organizationId: template.organizationId,
      name: args.name,
      description: args.description ?? template.description,
      folderId: args.folderId,
      isTemplate: false,
      hasEverBeenAssigned: false,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    })

    const revisionId = await ctx.db.insert('planificationRevisions', {
      planificationId: newPlanificationId,
      revisionNumber: 1,
      name: args.name,
      description: args.description ?? template.description,
      createdBy: identity.subject,
      supersedesRevisionId: undefined,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(newPlanificationId, {
      currentRevisionId: revisionId,
      updatedAt: now,
    })

    const sourceRevisionId = await resolveRevisionIdForPlanification(
      ctx,
      args.templateId
    )

    let workoutWeeks = await ctx.db
      .query('workoutWeeks')
      .withIndex('by_planification_revision', (q) =>
        q
          .eq('planificationId', args.templateId)
          .eq('revisionId', sourceRevisionId)
      )
      .collect()
    if (workoutWeeks.length === 0) {
      workoutWeeks = await ctx.db
        .query('workoutWeeks')
        .withIndex('by_planification', (q) =>
          q.eq('planificationId', args.templateId)
        )
        .collect()
    }

    for (const week of workoutWeeks) {
      const newWeekId = await ctx.db.insert('workoutWeeks', {
        planificationId: newPlanificationId,
        revisionId,
        name: week.name,
        order: week.order,
        notes: week.notes,
        createdAt: now,
        updatedAt: now,
      })

      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_week', (q) => q.eq('weekId', week._id))
        .collect()

      for (const day of workoutDays) {
        const newDayId = await ctx.db.insert('workoutDays', {
          weekId: newWeekId,
          planificationId: newPlanificationId,
          revisionId,
          name: day.name,
          order: day.order,
          dayOfWeek: day.dayOfWeek,
          notes: day.notes,
          createdAt: now,
          updatedAt: now,
        })

        const blocks = await ctx.db
          .query('exerciseBlocks')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()
        const oldBlockIdToNew = new Map<Id<'exerciseBlocks'>, Id<'exerciseBlocks'>>()
        for (const block of blocks) {
          const newBlockId = await ctx.db.insert('exerciseBlocks', {
            workoutDayId: newDayId,
            revisionId,
            name: block.name,
            order: block.order,
            notes: block.notes,
            createdAt: now,
            updatedAt: now,
          })
          oldBlockIdToNew.set(block._id, newBlockId)
        }

        const dayExercises = await ctx.db
          .query('dayExercises')
          .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
          .collect()

        for (const exercise of dayExercises) {
          const newBlockId = exercise.blockId
            ? oldBlockIdToNew.get(exercise.blockId)
            : undefined
          await ctx.db.insert('dayExercises', {
            workoutDayId: newDayId,
            revisionId,
            exerciseId: exercise.exerciseId,
            blockId: newBlockId,
            order: exercise.order,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
            prPercentage: exercise.prPercentage,
            timeSeconds: exercise.timeSeconds,
            notes: exercise.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    return newPlanificationId
  },
})

/**
 * Save an entire planification (metadata + weeks/days/blocks/exercises) in a
 * single server-side transaction.  Replaces the previous approach of ~100
 * sequential round-trip mutations from the browser.
 *
 * When the planification has been assigned (`hasEverBeenAssigned`), a new
 * immutable revision is created and active assignments are pointed to it.
 * Otherwise the existing content is replaced in-place.
 */
export const saveFull = mutation({
  args: {
    id: v.id('planifications'),
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id('folders')),
    isTemplate: v.boolean(),
    workoutWeeks: v.array(
      v.object({
        name: v.string(),
        workoutDays: v.array(
          v.object({
            name: v.string(),
            dayOfWeek: v.optional(v.number()),
            blocks: v.array(
              v.object({
                clientId: v.string(), // temporary client-side ID for mapping exercises
                name: v.string(),
                notes: v.optional(v.string()),
              })
            ),
            exercises: v.array(
              v.object({
                exerciseId: v.id('exercises'),
                blockClientId: v.optional(v.string()), // matches blocks[].clientId
                sets: v.number(),
                reps: v.optional(v.string()),
                weight: v.optional(v.string()),
                prPercentage: v.optional(v.number()),
                timeSeconds: v.optional(v.number()),
                notes: v.optional(v.string()),
              })
            ),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx)

    const planification = await ctx.db.get(args.id)
    if (!planification) throw new Error('Planification not found')
    await requireAdminOrTrainer(ctx, planification.organizationId)

    const now = Date.now()
    const shouldCreateRevision = !!planification.hasEverBeenAssigned
    const isTemplate = args.isTemplate
    const folderId = isTemplate ? undefined : args.folderId
    let revisionId: Id<'planificationRevisions'> | undefined

    if (shouldCreateRevision) {
      // ── Create a new immutable revision ──────────────────────────────
      const supersedesRevisionId = await ensureCurrentRevisionForPlanification(
        ctx,
        args.id,
        identity.subject
      )
      const latestRevision = await getLatestRevisionForPlanification(ctx, args.id)
      const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1

      revisionId = await ctx.db.insert('planificationRevisions', {
        planificationId: args.id,
        revisionNumber,
        name: args.name,
        description: args.description,
        createdBy: identity.subject,
        supersedesRevisionId,
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db.patch(args.id, {
        name: args.name,
        description: args.description,
        folderId,
        isTemplate,
        currentRevisionId: revisionId,
        updatedAt: now,
      })

      // Point active assignments to the new revision
      const assignments = await ctx.db
        .query('planificationAssignments')
        .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
        .collect()
      for (const assignment of assignments) {
        if (assignment.status !== 'active') continue
        if (assignment.revisionId === revisionId) continue
        await ctx.db.patch(assignment._id, { revisionId, updatedAt: now })
      }
    } else {
      // ── Update in-place: patch metadata, delete old content ─────────
      await ctx.db.patch(args.id, {
        name: args.name,
        description: args.description,
        folderId,
        isTemplate,
        updatedAt: now,
      })

      const oldWeeks = await ctx.db
        .query('workoutWeeks')
        .withIndex('by_planification', (q) => q.eq('planificationId', args.id))
        .collect()

      for (const week of oldWeeks) {
        const days = await ctx.db
          .query('workoutDays')
          .withIndex('by_week', (q) => q.eq('weekId', week._id))
          .collect()
        for (const day of days) {
          const exercises = await ctx.db
            .query('dayExercises')
            .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
            .collect()
          for (const ex of exercises) await ctx.db.delete(ex._id)

          const blocks = await ctx.db
            .query('exerciseBlocks')
            .withIndex('by_workout_day', (q) => q.eq('workoutDayId', day._id))
            .collect()
          for (const block of blocks) await ctx.db.delete(block._id)

          await ctx.db.delete(day._id)
        }
        await ctx.db.delete(week._id)
      }

      revisionId = await resolveRevisionIdForPlanification(ctx, args.id)
    }

    // ── Create all weeks / days / blocks / exercises ─────────────────
    for (let i = 0; i < args.workoutWeeks.length; i++) {
      const week = args.workoutWeeks[i]
      const weekId = await ctx.db.insert('workoutWeeks', {
        planificationId: args.id,
        revisionId,
        name: week.name,
        order: i,
        notes: undefined,
        createdAt: now,
        updatedAt: now,
      })

      for (let j = 0; j < week.workoutDays.length; j++) {
        const day = week.workoutDays[j]
        const dayId = await ctx.db.insert('workoutDays', {
          weekId,
          planificationId: args.id,
          revisionId,
          name: day.name,
          order: j,
          dayOfWeek: day.dayOfWeek,
          notes: undefined,
          createdAt: now,
          updatedAt: now,
        })

        // Create blocks and build clientId → real ID map
        const blockIdMap = new Map<string, Id<'exerciseBlocks'>>()
        for (let b = 0; b < day.blocks.length; b++) {
          const block = day.blocks[b]
          const blockId = await ctx.db.insert('exerciseBlocks', {
            workoutDayId: dayId,
            revisionId,
            name: block.name,
            order: b,
            notes: block.notes,
            createdAt: now,
            updatedAt: now,
          })
          blockIdMap.set(block.clientId, blockId)
        }

        // Create exercises (already ordered by the client)
        for (let e = 0; e < day.exercises.length; e++) {
          const ex = day.exercises[e]
          await ctx.db.insert('dayExercises', {
            workoutDayId: dayId,
            revisionId,
            exerciseId: ex.exerciseId,
            blockId: ex.blockClientId
              ? blockIdMap.get(ex.blockClientId)
              : undefined,
            order: e,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            prPercentage: ex.prPercentage,
            timeSeconds: ex.timeSeconds,
            notes: ex.notes,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  },
})

/**
 * Get planification by ID
 */
export const getById = query({
  args: {
    id: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const planification = await ctx.db.get(args.id)
    if (!planification) {
      return null
    }

    await requireOrganizationMembership(ctx, planification.organizationId)
    return planification
  },
})

export const getRevisions = query({
  args: {
    planificationId: v.id('planifications'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const planification = await ctx.db.get(args.planificationId)
    if (!planification) return []

    await requireOrganizationMembership(ctx, planification.organizationId)

    return await ctx.db
      .query('planificationRevisions')
      .withIndex('by_planification_revisionNumber', (q) =>
        q.eq('planificationId', args.planificationId)
      )
      .order('desc')
      .collect()
  },
})

/**
 * Get all planifications for the current user's organization
 */
export const getByOrganization = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)

    return await ctx.db
      .query('planifications')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', membership.organizationId)
      )
      .filter((q) => q.neq(q.field('isArchived'), true))
      .collect()
  },
})

/**
 * Get planifications by folder for the current user's organization.
 * When folderId is undefined (root "Todas" selected), returns all planifications.
 */
export const getByFolder = query({
  args: {
    folderId: v.optional(v.id('folders')),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)

    // Root level (Todas): return only non-template planifications
    if (args.folderId === undefined) {
      return await ctx.db
        .query('planifications')
        .withIndex('by_organization_isTemplate', (q) =>
          q
            .eq('organizationId', membership.organizationId)
            .eq('isTemplate', false)
        )
        .filter((q) => q.neq(q.field('isArchived'), true))
        .collect()
    }

    return await ctx.db
      .query('planifications')
      .withIndex('by_organization_folder', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('folderId', args.folderId)
      )
      .filter((q) => q.neq(q.field('isArchived'), true))
      .collect()
  },
})

/**
 * Get all templates for the current user's organization.
 * Templates are planifications with isTemplate: true and no folder.
 */
export const getTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx)
    const membership = await requireCurrentOrganizationMembership(ctx)

    const templates = await ctx.db
      .query('planifications')
      .withIndex('by_organization_isTemplate', (q) =>
        q
          .eq('organizationId', membership.organizationId)
          .eq('isTemplate', true)
      )
      .filter((q) => q.neq(q.field('isArchived'), true))
      .collect()

    // Sort by updatedAt descending (most recently updated first)
    return templates.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})
