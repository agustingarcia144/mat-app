import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { computePaymentInterest, getInterestFields } from "./planPayments";

/**
 * Migration: Wrap existing workout days in "Semana 1"
 * This migration should be run once to migrate existing planifications
 * to the new week-based structure.
 */
export const migrateWorkoutDaysToWeeks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all planifications
    const planifications = await ctx.db.query("planifications").collect();

    for (const planification of planifications) {
      // Check if this planification already has weeks
      const existingWeeks = await ctx.db
        .query("workoutWeeks")
        .withIndex("by_planification", (q) =>
          q.eq("planificationId", planification._id),
        )
        .first();

      // Skip if weeks already exist
      if (existingWeeks) {
        continue;
      }

      // Create "Semana 1" for this planification
      const weekId = await ctx.db.insert("workoutWeeks", {
        planificationId: planification._id,
        name: "Semana 1",
        order: 0,
        notes: undefined,
        createdAt: now,
        updatedAt: now,
      });

      // Get all workout days for this planification
      const workoutDays = await ctx.db
        .query("workoutDays")
        .withIndex("by_planification", (q) =>
          q.eq("planificationId", planification._id),
        )
        .collect();

      // Update each day to reference the new week
      for (const day of workoutDays) {
        await ctx.db.patch(day._id, {
          weekId: weekId,
          updatedAt: now,
        });
      }
    }

    return {
      success: true,
      migratedPlanifications: planifications.length,
    };
  },
});

/**
 * Migration: Backfill planification revisions and revision references.
 */
export const backfillPlanificationRevisions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
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
    };

    const planifications = await ctx.db.query("planifications").collect();
    const revisionByPlanification = new Map<
      Id<"planifications">,
      Id<"planificationRevisions">
    >();

    for (const planification of planifications) {
      let revisionId = planification.currentRevisionId;
      if (!revisionId) {
        const existingLatest = await ctx.db
          .query("planificationRevisions")
          .withIndex("by_planification_revisionNumber", (q) =>
            q.eq("planificationId", planification._id),
          )
          .order("desc")
          .first();

        if (existingLatest) {
          revisionId = existingLatest._id;
        } else {
          revisionId = await ctx.db.insert("planificationRevisions", {
            planificationId: planification._id,
            revisionNumber: 1,
            name: planification.name,
            description: planification.description,
            createdBy: planification.createdBy,
            supersedesRevisionId: undefined,
            createdAt: planification.createdAt,
            updatedAt: now,
          });
          summary.revisionsCreated += 1;
        }

        await ctx.db.patch(planification._id, {
          currentRevisionId: revisionId,
          hasEverBeenAssigned: planification.hasEverBeenAssigned ?? false,
          updatedAt: now,
        });
        summary.planificationsPatched += 1;
      } else if (planification.hasEverBeenAssigned === undefined) {
        await ctx.db.patch(planification._id, {
          hasEverBeenAssigned: false,
          updatedAt: now,
        });
        summary.planificationsPatched += 1;
      }

      if (revisionId) {
        revisionByPlanification.set(planification._id, revisionId);
      }
    }

    const weeks = await ctx.db.query("workoutWeeks").collect();
    for (const week of weeks) {
      if (week.revisionId) continue;
      const revisionId = revisionByPlanification.get(week.planificationId);
      if (!revisionId) continue;
      await ctx.db.patch(week._id, { revisionId, updatedAt: now });
      summary.weeksPatched += 1;
    }

    const days = await ctx.db.query("workoutDays").collect();
    for (const day of days) {
      if (day.revisionId) continue;
      const revisionId = revisionByPlanification.get(day.planificationId);
      if (!revisionId) continue;
      await ctx.db.patch(day._id, { revisionId, updatedAt: now });
      summary.daysPatched += 1;
    }

    const blocks = await ctx.db.query("exerciseBlocks").collect();
    for (const block of blocks) {
      if (block.revisionId) continue;
      const day = await ctx.db.get(block.workoutDayId);
      if (!day?.revisionId) continue;
      await ctx.db.patch(block._id, {
        revisionId: day.revisionId,
        updatedAt: now,
      });
      summary.blocksPatched += 1;
    }

    const dayExercises = await ctx.db.query("dayExercises").collect();
    for (const dayExercise of dayExercises) {
      if (dayExercise.revisionId) continue;
      const day = await ctx.db.get(dayExercise.workoutDayId);
      if (!day?.revisionId) continue;
      await ctx.db.patch(dayExercise._id, {
        revisionId: day.revisionId,
        updatedAt: now,
      });
      summary.dayExercisesPatched += 1;
    }

    const assignments = await ctx.db
      .query("planificationAssignments")
      .collect();
    for (const assignment of assignments) {
      const revisionId = revisionByPlanification.get(
        assignment.planificationId,
      );
      if (!revisionId) continue;
      if (!assignment.revisionId) {
        await ctx.db.patch(assignment._id, { revisionId, updatedAt: now });
        summary.assignmentsPatched += 1;
      }

      const planification = await ctx.db.get(assignment.planificationId);
      if (planification && !planification.hasEverBeenAssigned) {
        await ctx.db.patch(assignment.planificationId, {
          hasEverBeenAssigned: true,
          updatedAt: now,
        });
        summary.planificationsPatched += 1;
      }
    }

    const sessions = await ctx.db.query("workoutDaySessions").collect();
    for (const session of sessions) {
      if (session.revisionId) continue;
      const assignment = await ctx.db.get(session.assignmentId);
      if (!assignment?.revisionId) continue;
      await ctx.db.patch(session._id, {
        revisionId: assignment.revisionId,
        updatedAt: now,
      });
      summary.sessionsPatched += 1;
    }

    const logs = await ctx.db.query("sessionExerciseLogs").collect();
    for (const log of logs) {
      if (log.revisionId) continue;
      const session = await ctx.db.get(log.sessionId);
      if (!session?.revisionId) continue;
      await ctx.db.patch(log._id, {
        revisionId: session.revisionId,
        updatedAt: now,
      });
      summary.logsPatched += 1;
    }

    return {
      success: true,
      ...summary,
    };
  },
});

const BATCH_SIZE = 500;

type DeleteOldOrganizationsSummary = {
  organizationsRequested: number;
  organizationsFound: number;
  organizationsDeleted: number;
  usersActiveOrganizationCleared: number;
  creationInviteCodesCleared: number;
  storageObjectsDeleted: number;
  storageDeleteFailures: number;
  deleted: Record<string, number>;
};

function incrementDeleted(
  summary: DeleteOldOrganizationsSummary,
  table: string,
  count = 1,
) {
  summary.deleted[table] = (summary.deleted[table] ?? 0) + count;
}

/**
 * Maintenance: hard-delete old organizations that are no longer in use.
 *
 * This removes the organization row and all known Convex-owned data attached to
 * it. Run with dryRun first to inspect counts, then dryRun false.
 */
export const deleteOldUnusedOrganizations = internalMutation({
  args: {
    organizationIds: v.array(v.id("organizations")),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const summary: DeleteOldOrganizationsSummary = {
      organizationsRequested: args.organizationIds.length,
      organizationsFound: 0,
      organizationsDeleted: 0,
      usersActiveOrganizationCleared: 0,
      creationInviteCodesCleared: 0,
      storageObjectsDeleted: 0,
      storageDeleteFailures: 0,
      deleted: {},
    };

    for (const organizationId of args.organizationIds) {
      const organization = await ctx.db.get(organizationId);
      if (!organization) continue;
      summary.organizationsFound += 1;

      const planifications = await ctx.db
        .query("planifications")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const workoutWeeks = [];
      const workoutDays = [];
      const planificationRevisions = [];
      for (const planification of planifications) {
        workoutWeeks.push(
          ...(await ctx.db
            .query("workoutWeeks")
            .withIndex("by_planification", (q) =>
              q.eq("planificationId", planification._id),
            )
            .collect()),
        );
        workoutDays.push(
          ...(await ctx.db
            .query("workoutDays")
            .withIndex("by_planification", (q) =>
              q.eq("planificationId", planification._id),
            )
            .collect()),
        );
        planificationRevisions.push(
          ...(await ctx.db
            .query("planificationRevisions")
            .withIndex("by_planification", (q) =>
              q.eq("planificationId", planification._id),
            )
            .collect()),
        );
      }

      const exerciseBlocks = [];
      const dayExercises = [];
      for (const workoutDay of workoutDays) {
        exerciseBlocks.push(
          ...(await ctx.db
            .query("exerciseBlocks")
            .withIndex("by_workout_day", (q) =>
              q.eq("workoutDayId", workoutDay._id),
            )
            .collect()),
        );
        dayExercises.push(
          ...(await ctx.db
            .query("dayExercises")
            .withIndex("by_workout_day", (q) =>
              q.eq("workoutDayId", workoutDay._id),
            )
            .collect()),
        );
      }

      const assignments = await ctx.db
        .query("planificationAssignments")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const workoutSessions = await ctx.db
        .query("workoutDaySessions")
        .withIndex("by_organization_performedOn", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const workoutSessionIds = new Set(workoutSessions.map((row) => row._id));

      const sessionExerciseLogs = [];
      for (const workoutSession of workoutSessions) {
        sessionExerciseLogs.push(
          ...(await ctx.db
            .query("sessionExerciseLogs")
            .withIndex("by_session", (q) =>
              q.eq("sessionId", workoutSession._id),
            )
            .collect()),
        );
      }

      const classes = await ctx.db
        .query("classes")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const scheduleBatches = await ctx.db
        .query("scheduleBatches")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const classSchedules = await ctx.db
        .query("classSchedules")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const classScheduleIds = new Set(classSchedules.map((row) => row._id));

      const classReservations = await ctx.db
        .query("classReservations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const fixedClassSlots = await ctx.db
        .query("fixedClassSlots")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const modelWeekSlots = await ctx.db
        .query("modelWeekSlots")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const classAlerts = await ctx.db
        .query("classAlerts")
        .filter((q) => q.eq(q.field("organizationId"), organizationId))
        .collect();

      const organizationBillingSubscriptions = await ctx.db
        .query("organizationBillingSubscriptions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const membershipPlans = await ctx.db
        .query("membershipPlans")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const memberPlanSubscriptions = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const planPayments = await ctx.db
        .query("planPayments")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();
      const planPaymentIds = new Set(planPayments.map((row) => row._id));

      const financeRecurringRules = await ctx.db
        .query("financeRecurringRules")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const financeTransactions = await ctx.db
        .query("financeTransactions")
        .filter((q) => q.eq(q.field("organizationId"), organizationId))
        .collect();

      const planBonifications = await ctx.db
        .query("planBonifications")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect();

      const directOrgTables = {
        organizationMemberships: await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        organizationJoinRequests: await ctx.db
          .query("organizationJoinRequests")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        organizationSettings: await ctx.db
          .query("organizationSettings")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        organizationInvitations: await ctx.db
          .query("organizationInvitations")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        organizationMemberInviteCodes: await ctx.db
          .query("organizationMemberInviteCodes")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        exercises: await ctx.db
          .query("exercises")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
        folders: await ctx.db
          .query("folders")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId),
          )
          .collect(),
      };

      const allNotificationEvents = await ctx.db
        .query("notificationEvents")
        .collect();
      const notificationEvents = allNotificationEvents.filter(
        (event) =>
          (event.scheduleId && classScheduleIds.has(event.scheduleId)) ||
          (event.workoutSessionId &&
            workoutSessionIds.has(event.workoutSessionId)) ||
          (event.paymentId && planPaymentIds.has(event.paymentId)),
      );

      const usersWithActiveOrganization = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("activeOrganizationId"), organizationId))
        .collect();

      const creationInviteCodes = await ctx.db
        .query("organizationCreationInviteCodes")
        .filter((q) => q.eq(q.field("consumedOrganizationId"), organizationId))
        .collect();

      const deleteRows = async (
        table: string,
        rows: Array<{ _id: Id<any> }>,
      ) => {
        incrementDeleted(summary, table, rows.length);
        if (dryRun) return;
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      };

      const proofStorageIds = planPayments
        .map((payment) => payment.proofStorageId)
        .filter((storageId): storageId is Id<"_storage"> => Boolean(storageId));

      await deleteRows("notificationEvents", notificationEvents);
      await deleteRows("sessionExerciseLogs", sessionExerciseLogs);
      await deleteRows("workoutDaySessions", workoutSessions);
      await deleteRows("planificationAssignments", assignments);
      await deleteRows("dayExercises", dayExercises);
      await deleteRows("exerciseBlocks", exerciseBlocks);
      await deleteRows("workoutDays", workoutDays);
      await deleteRows("workoutWeeks", workoutWeeks);
      await deleteRows("planificationRevisions", planificationRevisions);
      await deleteRows("planifications", planifications);
      await deleteRows("classAlerts", classAlerts);
      await deleteRows("classReservations", classReservations);
      await deleteRows("classSchedules", classSchedules);
      await deleteRows("fixedClassSlots", fixedClassSlots);
      await deleteRows("modelWeekSlots", modelWeekSlots);
      await deleteRows("scheduleBatches", scheduleBatches);
      await deleteRows("classes", classes);
      await deleteRows(
        "organizationBillingSubscriptions",
        organizationBillingSubscriptions,
      );
      await deleteRows("planPayments", planPayments);
      await deleteRows("planBonifications", planBonifications);
      await deleteRows("memberPlanSubscriptions", memberPlanSubscriptions);
      await deleteRows("membershipPlans", membershipPlans);
      await deleteRows("financeTransactions", financeTransactions);
      await deleteRows("financeRecurringRules", financeRecurringRules);

      for (const [table, rows] of Object.entries(directOrgTables)) {
        await deleteRows(table, rows);
      }

      summary.usersActiveOrganizationCleared +=
        usersWithActiveOrganization.length;
      summary.creationInviteCodesCleared += creationInviteCodes.length;

      if (!dryRun) {
        for (const user of usersWithActiveOrganization) {
          await ctx.db.patch(user._id, {
            activeOrganizationId: undefined,
            updatedAt: Date.now(),
          });
        }
        for (const code of creationInviteCodes) {
          await ctx.db.patch(code._id, {
            consumedOrganizationId: undefined,
            updatedAt: Date.now(),
          });
        }
        for (const storageId of [
          ...proofStorageIds,
          ...(organization.logoStorageId ? [organization.logoStorageId] : []),
        ]) {
          try {
            await ctx.storage.delete(storageId);
            summary.storageObjectsDeleted += 1;
          } catch {
            summary.storageDeleteFailures += 1;
          }
        }
        await ctx.db.delete(organizationId);
        summary.organizationsDeleted += 1;
      }

      incrementDeleted(summary, "organizations");
    }

    return {
      success: true,
      dryRun,
      ...summary,
    };
  },
});

/**
 * Migration: Delete every class and all related records (classSchedules, classReservations).
 * Processes in batches of 500 to avoid limits. Run once from the Convex dashboard.
 * If you have more than 500 schedules, run the function again until it returns 0 deleted.
 */
export const deleteAllClassesAndRelated = internalMutation({
  args: {},
  handler: async (ctx) => {
    let reservationsDeleted = 0;
    let schedulesDeleted = 0;
    let classesDeleted = 0;

    // Batch: schedules + their reservations (500 schedules per run)
    const schedules = await ctx.db.query("classSchedules").take(BATCH_SIZE);
    for (const schedule of schedules) {
      // Delete reservations for this schedule in batches (in case one schedule has many)
      let reservations: { _id: Id<"classReservations"> }[];
      do {
        reservations = await ctx.db
          .query("classReservations")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .take(BATCH_SIZE);
        for (const res of reservations) {
          await ctx.db.delete(res._id);
          reservationsDeleted += 1;
        }
      } while (reservations.length === BATCH_SIZE);
      await ctx.db.delete(schedule._id);
      schedulesDeleted += 1;
    }

    // Batch: classes (500 per run)
    const classes = await ctx.db.query("classes").take(BATCH_SIZE);
    for (const c of classes) {
      await ctx.db.delete(c._id);
      classesDeleted += 1;
    }

    return {
      success: true,
      classesDeleted,
      schedulesDeleted,
      reservationsDeleted,
      remaining:
        schedules.length === BATCH_SIZE || classes.length === BATCH_SIZE
          ? "Run again to delete more"
          : "Done",
    };
  },
});

/**
 * Migration: initialize users.isSuperAdmin for existing rows.
 */
export const backfillUsersIsSuperAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let patched = 0;
    const now = Date.now();

    for (const user of users) {
      if (user.isSuperAdmin !== undefined) continue;
      await ctx.db.patch(user._id, {
        isSuperAdmin: false,
        updatedAt: now,
      });
      patched += 1;
    }

    return {
      success: true,
      scanned: users.length,
      patched,
    };
  },
});

/**
 * Migration: mark existing billing subscription rows with their source.
 */
export const backfillOrganizationBillingSources = internalMutation({
  args: {},
  handler: async (ctx) => {
    const subscriptions = await ctx.db
      .query("organizationBillingSubscriptions")
      .collect();
    let patched = 0;
    const now = Date.now();

    for (const subscription of subscriptions) {
      if (subscription.source !== undefined) continue;
      await ctx.db.patch(subscription._id, {
        source: subscription.mercadoPagoPreapprovalId
          ? ("mercadopago" as const)
          : ("legacy" as const),
        updatedAt: now,
      });
      patched += 1;
    }

    return {
      success: true,
      scanned: subscriptions.length,
      patched,
    };
  },
});

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
    const dryRun = args.dryRun ?? true;

    const organizations = await ctx.db.query("organizations").collect();
    const users = await ctx.db.query("users").collect();
    const memberships = await ctx.db.query("organizationMemberships").collect();

    const orgIdByExternalId = new Map<string, Id<"organizations">>();
    for (const org of organizations as Array<
      (typeof organizations)[number] & { externalId?: string }
    >) {
      if (typeof org.externalId === "string" && org.externalId.length > 0) {
        orgIdByExternalId.set(org.externalId, org._id);
      }
    }

    let organizationsUpdated = 0;
    let usersUpdated = 0;
    let membershipsUpdated = 0;
    let usersMappedFromLegacyExternalId = 0;

    if (!dryRun) {
      for (const organization of organizations as Array<
        (typeof organizations)[number] & { externalId?: string }
      >) {
        const { _id, _creationTime, externalId, ...rest } = organization;
        await ctx.db.replace(_id, rest);
        if (externalId !== undefined) {
          organizationsUpdated += 1;
        }
      }

      for (const user of users as Array<
        (typeof users)[number] & { activeOrganizationExternalId?: string }
      >) {
        let nextActiveOrganizationId = user.activeOrganizationId;
        if (!nextActiveOrganizationId && user.activeOrganizationExternalId) {
          const mapped = orgIdByExternalId.get(
            user.activeOrganizationExternalId,
          );
          if (mapped) {
            nextActiveOrganizationId = mapped;
            usersMappedFromLegacyExternalId += 1;
          }
        }

        const { _id, _creationTime, activeOrganizationExternalId, ...rest } =
          user;
        await ctx.db.replace(_id, {
          ...rest,
          activeOrganizationId: nextActiveOrganizationId,
        });
        if (activeOrganizationExternalId !== undefined) {
          usersUpdated += 1;
        }
      }

      for (const membership of memberships as Array<
        (typeof memberships)[number] & { externalMembershipId?: string }
      >) {
        const { _id, _creationTime, externalMembershipId, ...rest } =
          membership;
        await ctx.db.replace(_id, rest);
        if (externalMembershipId !== undefined) {
          membershipsUpdated += 1;
        }
      }
    } else {
      for (const organization of organizations as Array<
        (typeof organizations)[number] & { externalId?: string }
      >) {
        if (organization.externalId !== undefined) {
          organizationsUpdated += 1;
        }
      }

      for (const user of users as Array<
        (typeof users)[number] & { activeOrganizationExternalId?: string }
      >) {
        if (user.activeOrganizationExternalId !== undefined) {
          usersUpdated += 1;
        }
      }

      for (const membership of memberships as Array<
        (typeof memberships)[number] & { externalMembershipId?: string }
      >) {
        if (membership.externalMembershipId !== undefined) {
          membershipsUpdated += 1;
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
          usersMappedFromLegacyExternalId += 1;
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
    };
  },
});

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
    const dryRun = args.dryRun ?? true;
    const organizations = await ctx.db.query("organizations").collect();

    const shouldClear = (logoUrl: string | undefined) => {
      if (!logoUrl) return false;
      try {
        return new URL(logoUrl).hostname === "img.clerk.com";
      } catch {
        return logoUrl.includes("img.clerk.com");
      }
    };

    let cleared = 0;
    const sampleOrganizationIds: Id<"organizations">[] = [];

    for (const org of organizations) {
      if (!shouldClear(org.logoUrl)) continue;
      cleared += 1;
      if (sampleOrganizationIds.length < 50) {
        sampleOrganizationIds.push(org._id);
      }

      if (!dryRun) {
        await ctx.db.patch(org._id, {
          logoUrl: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    return {
      success: true,
      dryRun,
      scannedOrganizations: organizations.length,
      clearedOrganizations: cleared,
      sampleOrganizationIds,
    };
  },
});

/**
 * Migration: backfill classReservations.scheduleStartTime from their schedule.
 * Run with dryRun first, then dryRun false until remaining is 0.
 */
export const backfillClassReservationScheduleStartTime = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 500, 500));

    const reservations = await ctx.db.query("classReservations").collect();
    const missingScheduleStartTime = reservations.filter(
      (reservation) => reservation.scheduleStartTime === undefined,
    );

    let missingSchedule = 0;
    const batch: Array<{
      reservationId: Id<"classReservations">;
      scheduleStartTime: number;
    }> = [];

    for (const reservation of missingScheduleStartTime) {
      const schedule = await ctx.db.get(reservation.scheduleId);
      if (!schedule) {
        missingSchedule += 1;
        continue;
      }
      if (batch.length >= batchSize) continue;
      batch.push({
        reservationId: reservation._id,
        scheduleStartTime: schedule.startTime,
      });
    }

    for (const item of batch) {
      if (!dryRun) {
        await ctx.db.patch(item.reservationId, {
          scheduleStartTime: item.scheduleStartTime,
          updatedAt: Date.now(),
        });
      }
    }

    return {
      success: true,
      dryRun,
      scanned: reservations.length,
      patched: batch.length,
      missingSchedule,
      skippedAlreadyBackfilled:
        reservations.length - missingScheduleStartTime.length,
      remaining: Math.max(
        0,
        missingScheduleStartTime.length - missingSchedule - batch.length,
      ),
    };
  },
});

const CLERK_API_BASE = "https://api.clerk.com/v1";
const CLERK_PAGE_SIZE = 100;

type ClerkUser = { id?: string };
type ClerkUserListResponse =
  | ClerkUser[]
  | {
      data?: ClerkUser[];
    };

function extractClerkUsers(payload: ClerkUserListResponse | null): ClerkUser[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : (payload.data ?? []);
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
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new Error("Missing CLERK_SECRET_KEY");
    }

    const dryRun = args.dryRun ?? true;
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 200, 500));

    const clerkUserIds = new Set<string>();
    let offset = 0;

    while (true) {
      const response = await fetch(
        `${CLERK_API_BASE}/users?limit=${CLERK_PAGE_SIZE}&offset=${offset}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          body?.errors?.[0]?.long_message ??
          body?.errors?.[0]?.message ??
          body?.message ??
          `Clerk API request failed with status ${response.status}`;
        throw new Error(message);
      }

      const body = (await response
        .json()
        .catch(() => null)) as ClerkUserListResponse | null;
      const users = extractClerkUsers(body);
      if (users.length === 0) break;

      for (const user of users) {
        if (typeof user.id === "string" && user.id.length > 0) {
          clerkUserIds.add(user.id);
        }
      }

      if (users.length < CLERK_PAGE_SIZE) break;
      offset += CLERK_PAGE_SIZE;
    }

    let scanned = 0;
    let deleted = 0;
    const missingExternalIds: string[] = [];
    let afterExternalId: string | undefined = undefined;

    while (true) {
      const userBatch: Array<{ externalId: string }> = await ctx.runQuery(
        internal.users.listExternalIdsBatch,
        {
          afterExternalId,
          limit: batchSize,
        },
      );

      if (userBatch.length === 0) break;
      scanned += userBatch.length;

      for (const user of userBatch) {
        if (!clerkUserIds.has(user.externalId)) {
          missingExternalIds.push(user.externalId);
          if (!dryRun) {
            await ctx.runMutation(internal.users.deleteFromClerk, {
              clerkUserId: user.externalId,
            });
            deleted += 1;
          }
        }
      }

      afterExternalId = userBatch[userBatch.length - 1].externalId;
      if (userBatch.length < batchSize) break;
    }

    return {
      success: true,
      dryRun,
      scannedUsers: scanned,
      missingInClerk: missingExternalIds.length,
      deletedUsers: deleted,
      sampleMissingExternalIds: missingExternalIds.slice(0, 50),
    };
  },
});

/**
 * Migration: recompute interest on in-review plan payments.
 *
 * Fixes payments whose interest was computed with the old timezone-shifted
 * payment-window logic (which charged interest one day early in negative-offset
 * timezones, e.g. day 8 of a "1 al 8" window). Recomputes using the same logic
 * the approve flow uses (`computePaymentInterest` anchored on `proofUploadedAt`)
 * and patches `interestApplied` / `interestTotalArs` / `totalAmountArs`.
 *
 * Scope with `organizationId` to validate on one gym first, then run org-wide.
 * Run with `dryRun: true` first, then `dryRun: false`.
 */
export const recomputeInReviewPaymentInterest = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const now = Date.now();

    const payments = args.organizationId
      ? await ctx.db
          .query("planPayments")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId!),
          )
          .collect()
      : await ctx.db.query("planPayments").collect();

    const summary = {
      organizationId: args.organizationId ? String(args.organizationId) : null,
      scanned: payments.length,
      inReview: 0,
      changed: 0,
      unchanged: 0,
      patched: 0,
      samples: [] as Array<{
        paymentId: string;
        beforeTotalArs: number;
        afterTotalArs: number;
        beforeInterestArs: number;
        afterInterestArs: number;
      }>,
    };

    for (const payment of payments) {
      if (payment.status !== "in_review") continue;
      summary.inReview += 1;

      const interest = await computePaymentInterest(
        ctx,
        payment,
        payment.proofUploadedAt ?? now,
      );
      const fields = getInterestFields(interest);

      const beforeInterestArs = payment.interestTotalArs ?? 0;
      const afterInterestArs = fields.interestTotalArs ?? 0;
      const beforeTotalArs = payment.totalAmountArs ?? payment.amountArs;
      const afterTotalArs = fields.totalAmountArs;

      const isChanged =
        beforeInterestArs !== afterInterestArs ||
        beforeTotalArs !== afterTotalArs;

      if (!isChanged) {
        summary.unchanged += 1;
        continue;
      }

      summary.changed += 1;
      if (summary.samples.length < 50) {
        summary.samples.push({
          paymentId: String(payment._id),
          beforeTotalArs,
          afterTotalArs,
          beforeInterestArs,
          afterInterestArs,
        });
      }

      if (!dryRun) {
        await ctx.db.patch(payment._id, {
          ...fields,
          updatedAt: now,
        });
        summary.patched += 1;
      }
    }

    return {
      success: true,
      dryRun,
      ...summary,
    };
  },
});

/**
 * Migration: delete stale zero-amount payment placeholders created by the old
 * eager current-cycle payment generation flow.
 *
 * Safe criteria:
 * - amount and total are zero
 * - not a bonification payment
 * - unresolved pending/declined state
 * - no uploaded proof attached
 *
 * Run first with dryRun: true, then with dryRun: false.
 */
export const cleanupStaleZeroAmountPlanPayments = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const payments = args.organizationId
      ? await ctx.db
          .query("planPayments")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId!),
          )
          .collect()
      : await ctx.db.query("planPayments").collect();

    const summary = {
      organizationId: args.organizationId ? String(args.organizationId) : null,
      scanned: payments.length,
      eligible: 0,
      deleted: 0,
      skippedBonification: 0,
      skippedNonZero: 0,
      skippedWithProof: 0,
      skippedReviewedOrInReview: 0,
      sampleDeletedIds: [] as string[],
      sampleSkippedIds: [] as string[],
    };

    for (const payment of payments) {
      const isZeroAmount =
        payment.amountArs <= 0 && (payment.totalAmountArs ?? 0) <= 0;
      if (!isZeroAmount) {
        summary.skippedNonZero += 1;
        continue;
      }

      const isBonification =
        payment.isBonification ||
        payment.paymentMethod === "bonification" ||
        Boolean(payment.bonificationId);
      if (isBonification) {
        summary.skippedBonification += 1;
        continue;
      }

      const hasProof = Boolean(
        payment.proofStorageId || payment.proofUploadedAt,
      );
      if (hasProof) {
        summary.skippedWithProof += 1;
        if (summary.sampleSkippedIds.length < 50) {
          summary.sampleSkippedIds.push(String(payment._id));
        }
        continue;
      }

      if (payment.status === "approved" || payment.status === "in_review") {
        summary.skippedReviewedOrInReview += 1;
        if (summary.sampleSkippedIds.length < 50) {
          summary.sampleSkippedIds.push(String(payment._id));
        }
        continue;
      }

      summary.eligible += 1;
      if (summary.sampleDeletedIds.length < 50) {
        summary.sampleDeletedIds.push(String(payment._id));
      }
      if (!dryRun) {
        await ctx.db.delete(payment._id);
        summary.deleted += 1;
      }
    }

    return {
      success: true,
      dryRun,
      ...summary,
    };
  },
});
