import { mutation } from './_generated/server'
import { v } from 'convex/values'

/**
 * Migration: Wrap existing workout days in "Semana 1"
 * This migration should be run once to migrate existing planifications
 * to the new week-based structure.
 */
export const migrateWorkoutDaysToWeeks = mutation({
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
