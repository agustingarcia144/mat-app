import { internalMutation } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

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
