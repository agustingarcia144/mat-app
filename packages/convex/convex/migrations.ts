import { internalAction, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'

/**
 * Migration: Wrap existing workout days in "Semana 1"
 * This migration should be run once to migrate existing planifications
 * to the new week-based structure.
 */
export const migrateWorkoutDaysToWeeks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()

    // Get all planifications
    const planifications = await ctx.db.query('planifications').collect()

    for (const planification of planifications) {
      // Check if this planification already has weeks
      const existingWeeks = await ctx.db
        .query('workoutWeeks')
        .withIndex('by_planification', (q) =>
          q.eq('planificationId', planification._id)
        )
        .first()

      // Skip if weeks already exist
      if (existingWeeks) {
        continue
      }

      // Create "Semana 1" for this planification
      const weekId = await ctx.db.insert('workoutWeeks', {
        planificationId: planification._id,
        name: 'Semana 1',
        order: 0,
        notes: undefined,
        createdAt: now,
        updatedAt: now,
      })

      // Get all workout days for this planification
      const workoutDays = await ctx.db
        .query('workoutDays')
        .withIndex('by_planification', (q) =>
          q.eq('planificationId', planification._id)
        )
        .collect()

      // Update each day to reference the new week
      for (const day of workoutDays) {
        await ctx.db.patch(day._id, {
          weekId: weekId,
          updatedAt: now,
        })
      }
    }

    return {
      success: true,
      migratedPlanifications: planifications.length,
    }
  },
})

/**
 * Migration: Backfill planification revisions and revision references.
 */
export const backfillPlanificationRevisions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const summary = {
      planificationsPatched: 0,
      revisionsCreated: 0,
      weeksPatched: 0,
      daysPatched: 0,
      blocksPatched: 0,
      dayExercisesPatched: 0,
      assignmentsPatched: 0,
      sessionsPatched: 0,
      logsPatched: 0,
    }

    const planifications = await ctx.db.query('planifications').collect()
    const revisionByPlanification = new Map<
      Id<'planifications'>,
      Id<'planificationRevisions'>
    >()

    for (const planification of planifications) {
      let revisionId = planification.currentRevisionId
      if (!revisionId) {
        const existingLatest = await ctx.db
          .query('planificationRevisions')
          .withIndex('by_planification_revisionNumber', (q) =>
            q.eq('planificationId', planification._id)
          )
          .order('desc')
          .first()

        if (existingLatest) {
          revisionId = existingLatest._id
        } else {
          revisionId = await ctx.db.insert('planificationRevisions', {
            planificationId: planification._id,
            revisionNumber: 1,
            name: planification.name,
            description: planification.description,
            createdBy: planification.createdBy,
            supersedesRevisionId: undefined,
            createdAt: planification.createdAt,
            updatedAt: now,
          })
          summary.revisionsCreated += 1
        }

        await ctx.db.patch(planification._id, {
          currentRevisionId: revisionId,
          hasEverBeenAssigned: planification.hasEverBeenAssigned ?? false,
          updatedAt: now,
        })
        summary.planificationsPatched += 1
      } else if (planification.hasEverBeenAssigned === undefined) {
        await ctx.db.patch(planification._id, {
          hasEverBeenAssigned: false,
          updatedAt: now,
        })
        summary.planificationsPatched += 1
      }

      if (revisionId) {
        revisionByPlanification.set(planification._id, revisionId)
      }
    }

    const weeks = await ctx.db.query('workoutWeeks').collect()
    for (const week of weeks) {
      if (week.revisionId) continue
      const revisionId = revisionByPlanification.get(week.planificationId)
      if (!revisionId) continue
      await ctx.db.patch(week._id, { revisionId, updatedAt: now })
      summary.weeksPatched += 1
    }

    const days = await ctx.db.query('workoutDays').collect()
    for (const day of days) {
      if (day.revisionId) continue
      const revisionId = revisionByPlanification.get(day.planificationId)
      if (!revisionId) continue
      await ctx.db.patch(day._id, { revisionId, updatedAt: now })
      summary.daysPatched += 1
    }

    const blocks = await ctx.db.query('exerciseBlocks').collect()
    for (const block of blocks) {
      if (block.revisionId) continue
      const day = await ctx.db.get(block.workoutDayId)
      if (!day?.revisionId) continue
      await ctx.db.patch(block._id, {
        revisionId: day.revisionId,
        updatedAt: now,
      })
      summary.blocksPatched += 1
    }

    const dayExercises = await ctx.db.query('dayExercises').collect()
    for (const dayExercise of dayExercises) {
      if (dayExercise.revisionId) continue
      const day = await ctx.db.get(dayExercise.workoutDayId)
      if (!day?.revisionId) continue
      await ctx.db.patch(dayExercise._id, {
        revisionId: day.revisionId,
        updatedAt: now,
      })
      summary.dayExercisesPatched += 1
    }

    const assignments = await ctx.db.query('planificationAssignments').collect()
    for (const assignment of assignments) {
      const revisionId = revisionByPlanification.get(assignment.planificationId)
      if (!revisionId) continue
      if (!assignment.revisionId) {
        await ctx.db.patch(assignment._id, { revisionId, updatedAt: now })
        summary.assignmentsPatched += 1
      }

      const planification = await ctx.db.get(assignment.planificationId)
      if (planification && !planification.hasEverBeenAssigned) {
        await ctx.db.patch(assignment.planificationId, {
          hasEverBeenAssigned: true,
          updatedAt: now,
        })
        summary.planificationsPatched += 1
      }
    }

    const sessions = await ctx.db.query('workoutDaySessions').collect()
    for (const session of sessions) {
      if (session.revisionId) continue
      const assignment = await ctx.db.get(session.assignmentId)
      if (!assignment?.revisionId) continue
      await ctx.db.patch(session._id, {
        revisionId: assignment.revisionId,
        updatedAt: now,
      })
      summary.sessionsPatched += 1
    }

    const logs = await ctx.db.query('sessionExerciseLogs').collect()
    for (const log of logs) {
      if (log.revisionId) continue
      const session = await ctx.db.get(log.sessionId)
      if (!session?.revisionId) continue
      await ctx.db.patch(log._id, {
        revisionId: session.revisionId,
        updatedAt: now,
      })
      summary.logsPatched += 1
    }

    return {
      success: true,
      ...summary,
    }
  },
})

const BATCH_SIZE = 500

/**
 * Migration: Delete every class and all related records (classSchedules, classReservations).
 * Processes in batches of 500 to avoid limits. Run once from the Convex dashboard.
 * If you have more than 500 schedules, run the function again until it returns 0 deleted.
 */
export const deleteAllClassesAndRelated = internalMutation({
  args: {},
  handler: async (ctx) => {
    let reservationsDeleted = 0
    let schedulesDeleted = 0
    let classesDeleted = 0

    // Batch: schedules + their reservations (500 schedules per run)
    const schedules = await ctx.db.query('classSchedules').take(BATCH_SIZE)
    for (const schedule of schedules) {
      // Delete reservations for this schedule in batches (in case one schedule has many)
      let reservations: { _id: Id<'classReservations'> }[]
      do {
        reservations = await ctx.db
          .query('classReservations')
          .withIndex('by_schedule', (q) => q.eq('scheduleId', schedule._id))
          .take(BATCH_SIZE)
        for (const res of reservations) {
          await ctx.db.delete(res._id)
          reservationsDeleted += 1
        }
      } while (reservations.length === BATCH_SIZE)
      await ctx.db.delete(schedule._id)
      schedulesDeleted += 1
    }

    // Batch: classes (500 per run)
    const classes = await ctx.db.query('classes').take(BATCH_SIZE)
    for (const c of classes) {
      await ctx.db.delete(c._id)
      classesDeleted += 1
    }

    return {
      success: true,
      classesDeleted,
      schedulesDeleted,
      reservationsDeleted,
      remaining:
        schedules.length === BATCH_SIZE || classes.length === BATCH_SIZE
          ? 'Run again to delete more'
          : 'Done',
    }
  },
})

/**
 * Migration: remove legacy Clerk-organization fields from existing documents.
 *
 * It strips:
 * - users.activeOrganizationExternalId
 * - organizations.externalId
 * - organizationMemberships.externalMembershipId
 *
 * It also migrates users.activeOrganizationExternalId -> users.activeOrganizationId
 * when a matching organization can be found.
 */
export const cleanupLegacyOrganizationExternalFields = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true

    const organizations = await ctx.db.query('organizations').collect()
    const users = await ctx.db.query('users').collect()
    const memberships = await ctx.db.query('organizationMemberships').collect()

    const orgIdByExternalId = new Map<string, Id<'organizations'>>()
    for (const org of organizations as Array<
      (typeof organizations)[number] & { externalId?: string }
    >) {
      if (typeof org.externalId === 'string' && org.externalId.length > 0) {
        orgIdByExternalId.set(org.externalId, org._id)
      }
    }

    let organizationsUpdated = 0
    let usersUpdated = 0
    let membershipsUpdated = 0
    let usersMappedFromLegacyExternalId = 0

    if (!dryRun) {
      for (const organization of organizations as Array<
        (typeof organizations)[number] & { externalId?: string }
      >) {
        const { _id, _creationTime, externalId, ...rest } = organization
        await ctx.db.replace(_id, rest)
        if (externalId !== undefined) {
          organizationsUpdated += 1
        }
      }

      for (const user of users as Array<
        (typeof users)[number] & { activeOrganizationExternalId?: string }
      >) {
        let nextActiveOrganizationId = user.activeOrganizationId
        if (!nextActiveOrganizationId && user.activeOrganizationExternalId) {
          const mapped = orgIdByExternalId.get(user.activeOrganizationExternalId)
          if (mapped) {
            nextActiveOrganizationId = mapped
            usersMappedFromLegacyExternalId += 1
          }
        }

        const { _id, _creationTime, activeOrganizationExternalId, ...rest } = user
        await ctx.db.replace(_id, {
          ...rest,
          activeOrganizationId: nextActiveOrganizationId,
        })
        if (activeOrganizationExternalId !== undefined) {
          usersUpdated += 1
        }
      }

      for (const membership of memberships as Array<
        (typeof memberships)[number] & { externalMembershipId?: string }
      >) {
        const { _id, _creationTime, externalMembershipId, ...rest } = membership
        await ctx.db.replace(_id, rest)
        if (externalMembershipId !== undefined) {
          membershipsUpdated += 1
        }
      }
    } else {
      for (const organization of organizations as Array<
        (typeof organizations)[number] & { externalId?: string }
      >) {
        if (organization.externalId !== undefined) {
          organizationsUpdated += 1
        }
      }

      for (const user of users as Array<
        (typeof users)[number] & { activeOrganizationExternalId?: string }
      >) {
        if (user.activeOrganizationExternalId !== undefined) {
          usersUpdated += 1
        }
      }

      for (const membership of memberships as Array<
        (typeof memberships)[number] & { externalMembershipId?: string }
      >) {
        if (membership.externalMembershipId !== undefined) {
          membershipsUpdated += 1
        }
      }

      for (const user of users as Array<
        (typeof users)[number] & { activeOrganizationExternalId?: string }
      >) {
        if (
          !user.activeOrganizationId &&
          user.activeOrganizationExternalId &&
          orgIdByExternalId.has(user.activeOrganizationExternalId)
        ) {
          usersMappedFromLegacyExternalId += 1
        }
      }
    }

    return {
      success: true,
      dryRun,
      scanned: {
        organizations: organizations.length,
        users: users.length,
        memberships: memberships.length,
      },
      updated: {
        organizations: organizationsUpdated,
        users: usersUpdated,
        memberships: membershipsUpdated,
      },
      usersMappedFromLegacyExternalId,
    }
  },
})

/**
 * Migration: clear legacy Clerk-hosted organization logos.
 *
 * Manual reupload strategy:
 * - removes `logoUrl` when it points to `img.clerk.com`
 * - keeps Convex storage-backed logos (`logoStorageId`) intact
 */
export const clearClerkOrganizationLogos = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true
    const organizations = await ctx.db.query('organizations').collect()

    const shouldClear = (logoUrl: string | undefined) => {
      if (!logoUrl) return false
      try {
        return new URL(logoUrl).hostname === 'img.clerk.com'
      } catch {
        return logoUrl.includes('img.clerk.com')
      }
    }

    let cleared = 0
    const sampleOrganizationIds: Id<'organizations'>[] = []

    for (const org of organizations) {
      if (!shouldClear(org.logoUrl)) continue
      cleared += 1
      if (sampleOrganizationIds.length < 50) {
        sampleOrganizationIds.push(org._id)
      }

      if (!dryRun) {
        await ctx.db.patch(org._id, {
          logoUrl: undefined,
          updatedAt: Date.now(),
        })
      }
    }

    return {
      success: true,
      dryRun,
      scannedOrganizations: organizations.length,
      clearedOrganizations: cleared,
      sampleOrganizationIds,
    }
  },
})

const CLERK_API_BASE = 'https://api.clerk.com/v1'
const CLERK_PAGE_SIZE = 100

type ClerkUser = { id?: string }
type ClerkUserListResponse =
  | ClerkUser[]
  | {
      data?: ClerkUser[]
    }

function extractClerkUsers(payload: ClerkUserListResponse | null): ClerkUser[] {
  if (!payload) return []
  return Array.isArray(payload) ? payload : payload.data ?? []
}

/**
 * Migration: delete Convex users that no longer exist in Clerk.
 * Useful when webhook delivery missed `user.deleted` events.
 */
export const deleteUsersMissingInClerk = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const secret = process.env.CLERK_SECRET_KEY
    if (!secret) {
      throw new Error('Missing CLERK_SECRET_KEY')
    }

    const dryRun = args.dryRun ?? true
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 200, 500))

    const clerkUserIds = new Set<string>()
    let offset = 0

    while (true) {
      const response = await fetch(
        `${CLERK_API_BASE}/users?limit=${CLERK_PAGE_SIZE}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message =
          body?.errors?.[0]?.long_message ??
          body?.errors?.[0]?.message ??
          body?.message ??
          `Clerk API request failed with status ${response.status}`
        throw new Error(message)
      }

      const body = (await response.json().catch(() => null)) as ClerkUserListResponse | null
      const users = extractClerkUsers(body)
      if (users.length === 0) break

      for (const user of users) {
        if (typeof user.id === 'string' && user.id.length > 0) {
          clerkUserIds.add(user.id)
        }
      }

      if (users.length < CLERK_PAGE_SIZE) break
      offset += CLERK_PAGE_SIZE
    }

    let scanned = 0
    let deleted = 0
    const missingExternalIds: string[] = []
    let afterExternalId: string | undefined = undefined

    while (true) {
      const userBatch: Array<{ externalId: string }> = await ctx.runQuery(
        internal.users.listExternalIdsBatch,
        {
        afterExternalId,
        limit: batchSize,
        }
      )

      if (userBatch.length === 0) break
      scanned += userBatch.length

      for (const user of userBatch) {
        if (!clerkUserIds.has(user.externalId)) {
          missingExternalIds.push(user.externalId)
          if (!dryRun) {
            await ctx.runMutation(internal.users.deleteFromClerk, {
              clerkUserId: user.externalId,
            })
            deleted += 1
          }
        }
      }

      afterExternalId = userBatch[userBatch.length - 1].externalId
      if (userBatch.length < batchSize) break
    }

    return {
      success: true,
      dryRun,
      scannedUsers: scanned,
      missingInClerk: missingExternalIds.length,
      deletedUsers: deleted,
      sampleMissingExternalIds: missingExternalIds.slice(0, 50),
    }
  },
})
