import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  isStaffRole,
  requireAdmin,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from "./permissions";

type MetricPoint = {
  performedOn: string;
  weight: number | null;
  reps: number | null;
  volume: number | null;
  timeSeconds: number | null;
};

type ExerciseComment = {
  performedOn: string;
  comment: string;
};

type InternalMetricPoint = MetricPoint & {
  repsTotal: number;
  repsSamples: number;
};

function parseLeadingNumber(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAverageNumber(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const matches = normalized.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return null;

  const numbers = matches
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));

  if (numbers.length === 0) return null;
  return numbers.reduce((sum, entry) => sum + entry, 0) / numbers.length;
}

function parseTimeSeconds(value?: string | null): number | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  if (parts.length === 0) return null;
  return parts.reduce((sum, entry) => sum + entry, 0);
}

function compareDatesDesc(a: string, b: string) {
  return a < b ? 1 : a > b ? -1 : 0;
}

function dedupeComments(comments: ExerciseComment[]) {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = `${comment.performedOn}:${comment.comment}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCurrentBillingPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodRange(period: string) {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return {
    start: new Date(year, month - 1, 1).getTime(),
    end: new Date(year, month, 1).getTime(),
  };
}

function roundPercentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function sortPeriodsDesc(periods: string[]) {
  return Array.from(new Set(periods)).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
}

/**
 * Groups approved payments by billing period, returning for each period the set
 * of billing subscription ids that paid. A payment's `subscriptionId` always
 * points at the billing (family head / standalone) subscription, so family
 * members map back to it via `familyParentSubscriptionId ?? _id`.
 *
 * Bonifications (including 100% comped members) are stored as approved payments
 * too, so "paid" here means "approved payment OR active bonification".
 */
function buildApprovedBillingSubsByPeriod(
  approvedPayments: { billingPeriod: string; subscriptionId: unknown }[],
) {
  const byPeriod = new Map<string, Set<string>>();
  for (const payment of approvedPayments) {
    const set = byPeriod.get(payment.billingPeriod) ?? new Set<string>();
    set.add(String(payment.subscriptionId));
    byPeriod.set(payment.billingPeriod, set);
  }
  return byPeriod;
}

function getPlanificationMetricStatus(assignment?: {
  status: "active" | "completed" | "cancelled";
  startDate?: number;
  endDate?: number;
}): "active" | "historical" {
  if (!assignment || assignment.status !== "active") return "historical";

  const now = Date.now();
  if (typeof assignment.startDate === "number" && assignment.startDate > now) {
    return "historical";
  }
  if (typeof assignment.endDate === "number" && assignment.endDate <= now) {
    return "historical";
  }

  return "active";
}

function setPlanificationOption(
  planifications: Map<
    string,
    {
      planificationId: string;
      planificationName: string;
      status: "active" | "historical";
    }
  >,
  option: {
    planificationId: string;
    planificationName: string;
    status: "active" | "historical";
  },
) {
  const existing = planifications.get(option.planificationId);
  if (!existing || existing.status !== "active") {
    planifications.set(option.planificationId, option);
  }
}

export const listExerciseMetricMembers = query({
  args: {
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (!isStaffRole(membership.role)) {
      throw new Error("Unauthorized: staff role required");
    }

    const organizationId = membership.organizationId;
    const limit = Math.max(1, Math.min(args.limit ?? 20, 200));
    const search = args.search?.trim().toLowerCase() ?? "";

    // Only active members. Deriving the roster from memberships (bounded by the
    // member count) instead of the whole sessions history (unbounded) keeps this
    // cheap, and inactive/removed members no longer show up.
    const activeMemberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_role", (q) =>
        q.eq("organizationId", organizationId).eq("role", "member"),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const memberRoster = await Promise.all(
      activeMemberships.map(async (member) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) => q.eq("externalId", member.userId))
          .first();
        const name =
          user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          member.userId;
        return {
          userId: member.userId,
          name,
          email: user?.email ?? null,
          imageUrl: user?.imageUrl ?? null,
        };
      }),
    );

    const filteredMembers = memberRoster
      .filter((member) => {
        if (!search) return true;
        return (
          member.name.toLowerCase().includes(search) ||
          Boolean(member.email?.toLowerCase().includes(search))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalMembers = filteredMembers.length;
    // Only hydrate session/plan data for the batch actually being shown, so
    // scrolling loads one page at a time instead of recomputing everyone.
    const pageMembers = filteredMembers.slice(0, limit);

    const planificationCache = new Map<string, any>();

    const detailedMembers = await Promise.all(
      pageMembers.map(async (member) => {
        const [userSessions, userAssignments] = await Promise.all([
          ctx.db
            .query("workoutDaySessions")
            .withIndex("by_user_performedOn", (q) =>
              q.eq("userId", member.userId),
            )
            .collect(),
          ctx.db
            .query("planificationAssignments")
            .withIndex("by_user", (q) => q.eq("userId", member.userId))
            .collect(),
        ]);

        const orgSessions = userSessions.filter(
          (session) =>
            session.organizationId === organizationId &&
            session.status !== "skipped",
        );

        let lastPerformedOn: string | null = null;
        for (const session of orgSessions) {
          if (!lastPerformedOn || session.performedOn > lastPerformedOn) {
            lastPerformedOn = session.performedOn;
          }
        }

        const planifications = new Map<
          string,
          {
            planificationId: string;
            planificationName: string;
            status: "active" | "historical";
          }
        >();

        for (const assignment of userAssignments) {
          if (
            assignment.organizationId !== organizationId ||
            assignment.status === "cancelled"
          ) {
            continue;
          }

          let planification = planificationCache.get(
            String(assignment.planificationId),
          );
          if (!planification) {
            planification = await ctx.db.get(assignment.planificationId);
            if (planification) {
              planificationCache.set(
                String(assignment.planificationId),
                planification,
              );
            }
          }

          setPlanificationOption(planifications, {
            planificationId: String(assignment.planificationId),
            planificationName: planification?.name ?? "Plani sin nombre",
            status: getPlanificationMetricStatus(assignment),
          });
        }

        return {
          userId: member.userId,
          name: member.name,
          email: member.email,
          imageUrl: member.imageUrl,
          totalSessions: orgSessions.length,
          lastPerformedOn,
          planifications: Array.from(planifications.values()).sort((a, b) => {
            if (a.status !== b.status) return a.status === "active" ? -1 : 1;
            return a.planificationName.localeCompare(b.planificationName);
          }),
        };
      }),
    );

    return {
      summary: {
        membersTracked: totalMembers,
        sessionsCount: detailedMembers.reduce(
          (sum, member) => sum + member.totalSessions,
          0,
        ),
      },
      members: detailedMembers,
      hasMore: totalMembers > limit,
      totalMembers,
    };
  },
});

export const getExerciseMetricsByMember = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (!isStaffRole(membership.role)) {
      throw new Error("Unauthorized: staff role required");
    }

    const organizationId = membership.organizationId;
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.userId))
      .first();
    const name =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      args.userId;

    const assignments = (
      await ctx.db
        .query("planificationAssignments")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect()
    ).filter(
      (assignment) =>
        assignment.organizationId === organizationId &&
        assignment.status !== "cancelled",
    );
    const assignmentsById = new Map(
      assignments.map((assignment) => [String(assignment._id), assignment]),
    );

    const sessions = (
      await ctx.db
        .query("workoutDaySessions")
        .withIndex("by_user_performedOn", (q) => q.eq("userId", args.userId))
        .collect()
    ).filter(
      (session) =>
        session.organizationId === organizationId &&
        session.status !== "skipped",
    );

    const dayExerciseCache = new Map<string, any>();
    const exerciseCache = new Map<string, any>();
    const planificationCache = new Map<string, any>();
    const exercises = new Map<
      string,
      {
        exerciseId: string;
        exerciseName: string;
        entriesCount: number;
        lastPerformedOn: string | null;
        planificationIds: Set<string>;
        pointsByDate: Map<string, InternalMetricPoint>;
        comments: ExerciseComment[];
      }
    >();
    const planifications = new Map<
      string,
      {
        planificationId: string;
        planificationName: string;
        status: "active" | "historical";
      }
    >();

    let logsCount = 0;
    let lastPerformedOn: string | null = null;
    const effortSessions: {
      performedOn: string;
      effortRating: number | null;
      mood: "great" | "good" | "ok" | "tired" | "exhausted" | null;
      note: string | null;
    }[] = [];

    for (const assignment of assignments) {
      let planification = planificationCache.get(
        String(assignment.planificationId),
      );
      if (!planification) {
        planification = await ctx.db.get(assignment.planificationId);
        if (planification) {
          planificationCache.set(
            String(assignment.planificationId),
            planification,
          );
        }
      }

      setPlanificationOption(planifications, {
        planificationId: String(assignment.planificationId),
        planificationName: planification?.name ?? "Plani sin nombre",
        status: getPlanificationMetricStatus(assignment),
      });
    }

    for (const session of sessions) {
      const assignment = assignmentsById.get(String(session.assignmentId));

      let planification = planificationCache.get(
        String(session.planificationId),
      );
      if (!planification) {
        planification = await ctx.db.get(session.planificationId);
        if (planification) {
          planificationCache.set(
            String(session.planificationId),
            planification,
          );
        }
      }

      const planificationKey = String(session.planificationId);
      const planificationName = planification?.name ?? "Plani sin nombre";
      setPlanificationOption(planifications, {
        planificationId: planificationKey,
        planificationName,
        status: getPlanificationMetricStatus(assignment),
      });

      if (!lastPerformedOn || session.performedOn > lastPerformedOn) {
        lastPerformedOn = session.performedOn;
      }

      if (
        session.effortRating != null ||
        session.mood != null ||
        (session.memberNote && session.memberNote.trim().length > 0)
      ) {
        effortSessions.push({
          performedOn: session.performedOn,
          effortRating: session.effortRating ?? null,
          mood: session.mood ?? null,
          note: session.memberNote?.trim() ? session.memberNote.trim() : null,
        });
      }

      const logs = await ctx.db
        .query("sessionExerciseLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();

      for (const log of logs) {
        logsCount += 1;

        let dayExercise = dayExerciseCache.get(String(log.dayExerciseId));
        if (!dayExercise) {
          dayExercise = await ctx.db.get(log.dayExerciseId);
          if (!dayExercise) continue;
          dayExerciseCache.set(String(log.dayExerciseId), dayExercise);
        }

        let exercise = exerciseCache.get(String(dayExercise.exerciseId));
        if (!exercise) {
          exercise = await ctx.db.get(dayExercise.exerciseId);
          if (!exercise) continue;
          exerciseCache.set(String(dayExercise.exerciseId), exercise);
        }

        const exerciseKey = String(exercise._id);
        const exerciseEntry = exercises.get(exerciseKey) ?? {
          exerciseId: exerciseKey,
          exerciseName: exercise.name,
          entriesCount: 0,
          lastPerformedOn: null,
          planificationIds: new Set<string>(),
          pointsByDate: new Map<string, InternalMetricPoint>(),
          comments: [] as ExerciseComment[],
        };

        exerciseEntry.entriesCount += 1;
        exerciseEntry.lastPerformedOn =
          !exerciseEntry.lastPerformedOn ||
          session.performedOn > exerciseEntry.lastPerformedOn
            ? session.performedOn
            : exerciseEntry.lastPerformedOn;
        exerciseEntry.planificationIds.add(planificationKey);

        const weight = parseLeadingNumber(
          log.weight ?? dayExercise.weight ?? null,
        );
        const reps = parseAverageNumber(log.reps ?? dayExercise.reps ?? null);
        const timeSeconds =
          parseTimeSeconds(log.timeSeconds ?? null) ??
          (typeof dayExercise.timeSeconds === "number"
            ? dayExercise.timeSeconds * Math.max(log.sets, 1)
            : null);
        const volume =
          weight !== null && reps !== null ? weight * reps * log.sets : null;

        const previousPoint = exerciseEntry.pointsByDate.get(
          session.performedOn,
        );
        const nextRepsTotal = (previousPoint?.repsTotal ?? 0) + (reps ?? 0);
        const nextRepsSamples =
          (previousPoint?.repsSamples ?? 0) + (reps !== null ? 1 : 0);
        const nextVolume = (previousPoint?.volume ?? 0) + (volume ?? 0);
        const nextTimeSeconds =
          (previousPoint?.timeSeconds ?? 0) + (timeSeconds ?? 0);

        exerciseEntry.pointsByDate.set(session.performedOn, {
          performedOn: session.performedOn,
          weight:
            previousPoint?.weight !== null &&
            previousPoint?.weight !== undefined
              ? Math.max(previousPoint.weight, weight ?? previousPoint.weight)
              : weight,
          reps:
            nextRepsSamples > 0
              ? Number((nextRepsTotal / nextRepsSamples).toFixed(2))
              : null,
          repsTotal: nextRepsTotal,
          repsSamples: nextRepsSamples,
          volume: nextVolume > 0 ? nextVolume : null,
          timeSeconds: nextTimeSeconds > 0 ? nextTimeSeconds : null,
        });

        const comment = log.comment?.trim();
        if (comment) {
          exerciseEntry.comments.push({
            performedOn: session.performedOn,
            comment,
          });
        }

        exercises.set(exerciseKey, exerciseEntry);
      }
    }

    const serializedExercises = Array.from(exercises.values())
      .map((exercise) => {
        const points = Array.from(exercise.pointsByDate.values())
          .sort((a, b) => a.performedOn.localeCompare(b.performedOn))
          .map(({ repsTotal, repsSamples, ...point }) => point);

        const firstPoint = points[0] ?? null;
        const latestPoint = points[points.length - 1] ?? null;
        const firstWeight = firstPoint?.weight ?? null;
        const latestWeight = latestPoint?.weight ?? null;
        const latestVolume = latestPoint?.volume ?? null;
        const bestWeight = points.reduce<number | null>(
          (best, point) =>
            point.weight === null
              ? best
              : best === null
                ? point.weight
                : Math.max(best, point.weight),
          null,
        );
        const weightDelta =
          firstWeight !== null && latestWeight !== null
            ? latestWeight - firstWeight
            : null;
        const latestComparableValue = latestWeight ?? latestVolume ?? null;
        const baselineComparableValue =
          firstPoint?.weight ?? firstPoint?.volume ?? null;

        let trend: "up" | "down" | "flat" = "flat";
        if (
          latestComparableValue !== null &&
          baselineComparableValue !== null &&
          points.length > 1
        ) {
          if (latestComparableValue > baselineComparableValue) trend = "up";
          else if (latestComparableValue < baselineComparableValue)
            trend = "down";
        }

        return {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          entriesCount: exercise.entriesCount,
          lastPerformedOn: exercise.lastPerformedOn,
          planificationIds: Array.from(exercise.planificationIds).sort(),
          firstWeight,
          latestWeight,
          weightDelta,
          bestWeight,
          latestVolume,
          trend,
          comments: dedupeComments(exercise.comments).sort((a, b) =>
            compareDatesDesc(a.performedOn, b.performedOn),
          ),
          points,
        };
      })
      .sort((a, b) =>
        compareDatesDesc(a.lastPerformedOn ?? "", b.lastPerformedOn ?? ""),
      );

    const sortedEffortSessions = effortSessions.sort((a, b) =>
      a.performedOn.localeCompare(b.performedOn),
    );
    const effortValues = sortedEffortSessions
      .map((entry) => entry.effortRating)
      .filter((value): value is number => value != null);
    const averageEffort =
      effortValues.length > 0
        ? Number(
            (
              effortValues.reduce((sum, value) => sum + value, 0) /
              effortValues.length
            ).toFixed(1),
          )
        : null;

    return {
      summary: {
        exercisesTracked: serializedExercises.length,
        logsCount,
        sessionsCount: sessions.length,
      },
      member: {
        userId: args.userId,
        name,
        email: user?.email ?? null,
        imageUrl: user?.imageUrl ?? null,
        totalSessions: sessions.length,
        lastPerformedOn,
        averageEffort,
        effortSessions: sortedEffortSessions,
        planifications: Array.from(planifications.values()).sort((a, b) => {
          if (a.status !== b.status) return a.status === "active" ? -1 : 1;
          return a.planificationName.localeCompare(b.planificationName);
        }),
        exercises: serializedExercises,
      },
    };
  },
});

export const getExerciseMetricsByMembers = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (!isStaffRole(membership.role)) {
      throw new Error("Unauthorized: staff role required");
    }

    const organizationId = membership.organizationId;

    const usersByExternalId = new Map<
      string,
      {
        fullName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        imageUrl?: string;
      }
    >();

    const assignments = await ctx.db
      .query("planificationAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .collect();

    const assignmentsById = new Map(
      assignments.map((assignment) => [String(assignment._id), assignment]),
    );

    await Promise.all(
      Array.from(
        new Set(assignments.map((assignment) => assignment.userId)),
      ).map(async (userId) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) => q.eq("externalId", userId))
          .first();

        usersByExternalId.set(userId, {
          fullName: user?.fullName,
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          imageUrl: user?.imageUrl,
        });
      }),
    );

    const organizationSessions = (
      await ctx.db
        .query("workoutDaySessions")
        .withIndex("by_organization_performedOn", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect()
    ).filter((session) => session.status !== "skipped");

    await Promise.all(
      Array.from(
        new Set(organizationSessions.map((session) => session.userId)),
      ).map(async (userId) => {
        if (usersByExternalId.has(userId)) return;

        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) => q.eq("externalId", userId))
          .first();

        usersByExternalId.set(userId, {
          fullName: user?.fullName,
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          imageUrl: user?.imageUrl,
        });
      }),
    );

    const dayExerciseCache = new Map<string, any>();
    const exerciseCache = new Map<string, any>();
    const planificationCache = new Map<string, any>();
    const members = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string | null;
        imageUrl: string | null;
        totalSessions: number;
        lastPerformedOn: string | null;
        planifications: Map<
          string,
          {
            planificationId: string;
            planificationName: string;
            status: "active" | "historical";
          }
        >;
        exercises: Map<
          string,
          {
            exerciseId: string;
            exerciseName: string;
            entriesCount: number;
            lastPerformedOn: string | null;
            planificationIds: Set<string>;
            pointsByDate: Map<string, InternalMetricPoint>;
            comments: ExerciseComment[];
          }
        >;
      }
    >();

    let logsCount = 0;
    let sessionsCount = 0;

    for (const session of organizationSessions) {
      const assignment = assignmentsById.get(String(session.assignmentId));
      const userId = session.userId;
      const user = usersByExternalId.get(userId);
      const name =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        userId;

      const memberEntry = members.get(userId) ?? {
        userId,
        name,
        email: user?.email ?? null,
        imageUrl: user?.imageUrl ?? null,
        totalSessions: 0,
        lastPerformedOn: null,
        planifications: new Map(),
        exercises: new Map(),
      };

      let planification = planificationCache.get(
        String(session.planificationId),
      );
      if (!planification) {
        planification = await ctx.db.get(session.planificationId);
        if (planification) {
          planificationCache.set(
            String(session.planificationId),
            planification,
          );
        }
      }

      const planificationKey = String(session.planificationId);
      const planificationName = planification?.name ?? "Plani sin nombre";
      setPlanificationOption(memberEntry.planifications, {
        planificationId: planificationKey,
        planificationName,
        status: getPlanificationMetricStatus(assignment),
      });

      sessionsCount += 1;
      memberEntry.totalSessions += 1;

      if (
        !memberEntry.lastPerformedOn ||
        session.performedOn > memberEntry.lastPerformedOn
      ) {
        memberEntry.lastPerformedOn = session.performedOn;
      }

      const logs = await ctx.db
        .query("sessionExerciseLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();

      for (const log of logs) {
        logsCount += 1;

        let dayExercise = dayExerciseCache.get(String(log.dayExerciseId));
        if (!dayExercise) {
          dayExercise = await ctx.db.get(log.dayExerciseId);
          if (!dayExercise) continue;
          dayExerciseCache.set(String(log.dayExerciseId), dayExercise);
        }

        let exercise = exerciseCache.get(String(dayExercise.exerciseId));
        if (!exercise) {
          exercise = await ctx.db.get(dayExercise.exerciseId);
          if (!exercise) continue;
          exerciseCache.set(String(dayExercise.exerciseId), exercise);
        }

        const exerciseKey = String(exercise._id);
        const exerciseEntry = memberEntry.exercises.get(exerciseKey) ?? {
          exerciseId: exerciseKey,
          exerciseName: exercise.name,
          entriesCount: 0,
          lastPerformedOn: null,
          planificationIds: new Set<string>(),
          pointsByDate: new Map<string, InternalMetricPoint>(),
          comments: [] as ExerciseComment[],
        };

        exerciseEntry.entriesCount += 1;
        exerciseEntry.lastPerformedOn =
          !exerciseEntry.lastPerformedOn ||
          session.performedOn > exerciseEntry.lastPerformedOn
            ? session.performedOn
            : exerciseEntry.lastPerformedOn;
        exerciseEntry.planificationIds.add(planificationKey);

        const weight = parseLeadingNumber(
          log.weight ?? dayExercise.weight ?? null,
        );
        const reps = parseAverageNumber(log.reps ?? dayExercise.reps ?? null);
        const timeSeconds =
          parseTimeSeconds(log.timeSeconds ?? null) ??
          (typeof dayExercise.timeSeconds === "number"
            ? dayExercise.timeSeconds * Math.max(log.sets, 1)
            : null);
        const volume =
          weight !== null && reps !== null ? weight * reps * log.sets : null;

        const previousPoint = exerciseEntry.pointsByDate.get(
          session.performedOn,
        );
        const nextRepsTotal = (previousPoint?.repsTotal ?? 0) + (reps ?? 0);
        const nextRepsSamples =
          (previousPoint?.repsSamples ?? 0) + (reps !== null ? 1 : 0);
        const nextVolume = (previousPoint?.volume ?? 0) + (volume ?? 0);
        const nextTimeSeconds =
          (previousPoint?.timeSeconds ?? 0) + (timeSeconds ?? 0);

        exerciseEntry.pointsByDate.set(session.performedOn, {
          performedOn: session.performedOn,
          weight:
            previousPoint?.weight !== null &&
            previousPoint?.weight !== undefined
              ? Math.max(previousPoint.weight, weight ?? previousPoint.weight)
              : weight,
          reps:
            nextRepsSamples > 0
              ? Number((nextRepsTotal / nextRepsSamples).toFixed(2))
              : null,
          repsTotal: nextRepsTotal,
          repsSamples: nextRepsSamples,
          volume: nextVolume > 0 ? nextVolume : null,
          timeSeconds: nextTimeSeconds > 0 ? nextTimeSeconds : null,
        });

        const comment = log.comment?.trim();
        if (comment) {
          exerciseEntry.comments.push({
            performedOn: session.performedOn,
            comment,
          });
        }

        memberEntry.exercises.set(exerciseKey, exerciseEntry);
      }

      members.set(userId, memberEntry);
    }

    const serializedMembers = Array.from(members.values())
      .map((member) => {
        const exercises = Array.from(member.exercises.values())
          .map((exercise) => {
            const points = Array.from(exercise.pointsByDate.values())
              .sort((a, b) => a.performedOn.localeCompare(b.performedOn))
              .map(({ repsTotal, repsSamples, ...point }) => point);

            const firstPoint = points[0] ?? null;
            const latestPoint = points[points.length - 1] ?? null;
            const firstWeight = firstPoint?.weight ?? null;
            const latestWeight = latestPoint?.weight ?? null;
            const latestVolume = latestPoint?.volume ?? null;
            const bestWeight = points.reduce<number | null>(
              (best, point) =>
                point.weight === null
                  ? best
                  : best === null
                    ? point.weight
                    : Math.max(best, point.weight),
              null,
            );
            const weightDelta =
              firstWeight !== null && latestWeight !== null
                ? latestWeight - firstWeight
                : null;

            const latestComparableValue = latestWeight ?? latestVolume ?? null;
            const baselineComparableValue =
              firstPoint?.weight ?? firstPoint?.volume ?? null;

            let trend: "up" | "down" | "flat" = "flat";
            if (
              latestComparableValue !== null &&
              baselineComparableValue !== null &&
              points.length > 1
            ) {
              if (latestComparableValue > baselineComparableValue) trend = "up";
              else if (latestComparableValue < baselineComparableValue)
                trend = "down";
            }

            return {
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.exerciseName,
              entriesCount: exercise.entriesCount,
              lastPerformedOn: exercise.lastPerformedOn,
              planificationIds: Array.from(exercise.planificationIds).sort(),
              firstWeight,
              latestWeight,
              weightDelta,
              bestWeight,
              latestVolume,
              trend,
              comments: dedupeComments(exercise.comments).sort((a, b) =>
                compareDatesDesc(a.performedOn, b.performedOn),
              ),
              points,
            };
          })
          .sort((a, b) =>
            compareDatesDesc(a.lastPerformedOn ?? "", b.lastPerformedOn ?? ""),
          );

        return {
          userId: member.userId,
          name: member.name,
          email: member.email,
          imageUrl: member.imageUrl,
          totalSessions: member.totalSessions,
          lastPerformedOn: member.lastPerformedOn,
          planifications: Array.from(member.planifications.values()).sort(
            (a, b) => {
              if (a.status !== b.status) return a.status === "active" ? -1 : 1;
              return a.planificationName.localeCompare(b.planificationName);
            },
          ),
          exercises,
        };
      })
      .filter((member) => member.exercises.length > 0)
      .sort((a, b) =>
        compareDatesDesc(a.lastPerformedOn ?? "", b.lastPerformedOn ?? ""),
      );

    const exercisesTracked = serializedMembers.reduce(
      (sum, member) => sum + member.exercises.length,
      0,
    );

    return {
      summary: {
        membersTracked: serializedMembers.length,
        exercisesTracked,
        logsCount,
        sessionsCount,
      },
      members: serializedMembers,
    };
  },
});

/**
 * Monthly "active members" history for the dashboard cards.
 *
 * - Current (in-progress) month: members with a live, non-cancelled
 *   subscription active through the end of the month (active "a la fecha").
 * - Closed (past) months: members who actually paid that period (any approved
 *   payment for the billing period, including bonifications). So a month that
 *   had 80 active members but only 75 payers reports 75.
 * - Future months: 0.
 */
/**
 * Active-member count per month. Shared by the dashboard and Mati
 * (`ai.runReport`). Callers are responsible for authorization.
 */
export async function computeActiveMembersHistory(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  args: { monthsCount?: number; responsibleUserId?: string },
) {
  const monthsCount = Math.min(
    Math.max(Math.floor(args.monthsCount ?? 6), 1),
    12,
  );

  const [allSubscriptions, approvedPayments] = await Promise.all([
    ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
    ctx.db
      .query("planPayments")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "approved"),
      )
      .collect(),
  ]);

  // Restrict to the members this staff member is responsible for. Filtering
  // the subscriptions (not the payments) keeps the family billing grouping
  // below intact.
  const subscriptions = args.responsibleUserId
    ? await (async () => {
        const assigned = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_responsible", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("responsibleUserId", args.responsibleUserId),
          )
          .collect();
        const assignedUserIds = new Set(assigned.map((m) => m.userId));
        return allSubscriptions.filter((subscription) =>
          assignedUserIds.has(subscription.userId),
        );
      })()
    : allSubscriptions;

  const approvedByPeriod = buildApprovedBillingSubsByPeriod(approvedPayments);

  const isActiveAtPeriodEnd = (
    subscription: (typeof subscriptions)[number],
    periodEndAt: number,
  ) =>
    subscription.activatedAt < periodEndAt &&
    (typeof subscription.cancelledAt !== "number" ||
      subscription.cancelledAt >= periodEndAt);

  // Members whose billing group paid this period AND who were active during it.
  const countPaidForPeriod = (
    period: string,
    startAt: number,
    endAt: number,
  ) => {
    const paidBillingSubs = approvedByPeriod.get(period);
    if (!paidBillingSubs || paidBillingSubs.size === 0) return 0;
    let count = 0;
    for (const subscription of subscriptions) {
      const billingId = String(
        subscription.familyParentSubscriptionId ?? subscription._id,
      );
      if (!paidBillingSubs.has(billingId)) continue;
      if (
        subscription.activatedAt < endAt &&
        (typeof subscription.cancelledAt !== "number" ||
          subscription.cancelledAt >= startAt)
      ) {
        count += 1;
      }
    }
    return count;
  };

  const now = new Date();
  const currentPeriod = getCurrentBillingPeriod();
  const startMonth = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsCount - 1),
    1,
  );

  const months = Array.from({ length: monthsCount }, (_, index) => {
    const date = new Date(
      startMonth.getFullYear(),
      startMonth.getMonth() + index,
      1,
    );
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const startAt = date.getTime();
    const endAt = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      1,
    ).getTime();

    if (period > currentPeriod) {
      return { period, count: 0, isPaidBased: false };
    }
    if (period === currentPeriod) {
      return {
        period,
        count: subscriptions.filter((subscription) =>
          isActiveAtPeriodEnd(subscription, endAt),
        ).length,
        isPaidBased: false,
      };
    }
    return {
      period,
      count: countPaidForPeriod(period, startAt, endAt),
      isPaidBased: true,
    };
  });

  const currentPeriodEndAt = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  ).getTime();
  const activeCount = subscriptions.filter((subscription) =>
    isActiveAtPeriodEnd(subscription, currentPeriodEndAt),
  ).length;

  return { activeCount, months };
}

export const getActiveMembersHistory = query({
  args: {
    monthsCount: v.optional(v.number()),
    // Only count members assigned to this staff member (responsibleUserId).
    responsibleUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdminOrTrainer(ctx, organizationId);
    return await computeActiveMembersHistory(ctx, organizationId, args);
  },
});

/**
 * Churn / retention by period. Shared by the dashboard and Mati
 * (`ai.runReport`). Callers are responsible for authorization.
 */
export async function computeChurnMetrics(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  args: { selectedPeriod?: string },
) {
  const [subscriptions, approvedPayments] = await Promise.all([
    ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
    ctx.db
      .query("planPayments")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "approved"),
      )
      .collect(),
  ]);

  const currentPeriod = getCurrentBillingPeriod();
  const availablePeriods = sortPeriodsDesc([
    currentPeriod,
    ...subscriptions.map((subscription) =>
      getPeriodFromTimestamp(subscription.activatedAt),
    ),
    ...subscriptions
      .map((subscription) =>
        typeof subscription.cancelledAt === "number"
          ? getPeriodFromTimestamp(subscription.cancelledAt)
          : null,
      )
      .filter((period): period is string => Boolean(period)),
    // Include periods that had payments so closed months with no
    // activation/cancellation still show up in the history.
    ...approvedPayments.map((payment) => payment.billingPeriod),
  ]).slice(0, 12);

  const selectedPeriod =
    args.selectedPeriod && availablePeriods.includes(args.selectedPeriod)
      ? args.selectedPeriod
      : currentPeriod;
  const selectedIndex = availablePeriods.indexOf(selectedPeriod);
  const previousPeriod =
    selectedIndex >= 0 ? (availablePeriods[selectedIndex + 1] ?? null) : null;

  const approvedByPeriod = buildApprovedBillingSubsByPeriod(approvedPayments);

  const getMemberIdsActiveAt = (timestamp: number) => {
    const ids = new Set<string>();
    for (const sub of subscriptions) {
      if (
        sub.activatedAt < timestamp &&
        (typeof sub.cancelledAt !== "number" || sub.cancelledAt >= timestamp)
      ) {
        ids.add(sub.userId);
      }
    }
    return ids;
  };

  // Members (userIds) whose billing group has an approved payment for a period.
  const getPaidMemberIds = (period: string) => {
    const paidBillingSubs = approvedByPeriod.get(period);
    const ids = new Set<string>();
    if (!paidBillingSubs || paidBillingSubs.size === 0) return ids;
    for (const sub of subscriptions) {
      const billingId = String(sub.familyParentSubscriptionId ?? sub._id);
      if (paidBillingSubs.has(billingId)) ids.add(sub.userId);
    }
    return ids;
  };

  // The active base for a period: for a closed month it's who actually paid;
  // for the in-progress month it's the members currently active (paid data is
  // still incomplete).
  const getPeriodMemberIds = (period: string) => {
    if (period >= currentPeriod) {
      const { end } = getPeriodRange(period);
      return getMemberIdsActiveAt(end);
    }
    return getPaidMemberIds(period);
  };

  const buildPeriodOverview = (period: string) => {
    const { start, end } = getPeriodRange(period);
    const periodIndex = availablePeriods.indexOf(period);
    const priorPeriod =
      periodIndex >= 0 ? (availablePeriods[periodIndex + 1] ?? null) : null;

    // Base at the start of the period = who continued from the prior period
    // (its payers). Falls back to live active subs for the earliest period.
    const startingIds = priorPeriod
      ? getPeriodMemberIds(priorPeriod)
      : getMemberIdsActiveAt(start);
    const endingIds = getPeriodMemberIds(period);

    // Members in the starting base who are gone by the end of the period
    const churnedMembers = new Set<string>(
      Array.from(startingIds).filter((id) => !endingIds.has(id)),
    );

    // Members present at end who were not in the starting base
    const newMembers = new Set<string>(
      Array.from(endingIds).filter((id) => !startingIds.has(id)),
    );

    // Members whose active-at-end subs are all suspended
    const activeAtEnd = getMemberIdsActiveAt(end);
    const suspendedAtEnd = new Set<string>();
    for (const userId of Array.from(activeAtEnd)) {
      const activeSubs = subscriptions.filter(
        (sub) =>
          sub.userId === userId &&
          sub.activatedAt < end &&
          (typeof sub.cancelledAt !== "number" || sub.cancelledAt >= end),
      );
      if (activeSubs.every((sub) => sub.status === "suspended")) {
        suspendedAtEnd.add(userId);
      }
    }

    const churnBaseCount = startingIds.size + newMembers.size;

    return {
      period,
      startingMembers: startingIds.size,
      endingMembers: endingIds.size,
      newMembers: newMembers.size,
      churnedMembers: churnedMembers.size,
      churnBaseMembers: churnBaseCount,
      suspendedMembers: suspendedAtEnd.size,
      netGrowth: newMembers.size - churnedMembers.size,
      churnRatePct: roundPercentage(churnedMembers.size, churnBaseCount),
      retentionRatePct:
        startingIds.size > 0
          ? Math.max(
              0,
              Math.round(
                ((startingIds.size - churnedMembers.size) / startingIds.size) *
                  1000,
              ) / 10,
            )
          : 100,
    };
  };

  const monthlyOverview = availablePeriods.map(buildPeriodOverview);
  const selectedOverview =
    monthlyOverview.find((period) => period.period === selectedPeriod) ??
    buildPeriodOverview(selectedPeriod);
  const previousOverview = previousPeriod
    ? (monthlyOverview.find((period) => period.period === previousPeriod) ??
      buildPeriodOverview(previousPeriod))
    : null;

  return {
    currentPeriod,
    selectedPeriod,
    previousPeriod,
    availablePeriods,
    selectedOverview,
    previousOverview,
    comparison: previousOverview
      ? {
          churnRateDeltaPct:
            selectedOverview.churnRatePct - previousOverview.churnRatePct,
          churnedMembersDelta:
            selectedOverview.churnedMembers - previousOverview.churnedMembers,
          endingMembersDelta:
            selectedOverview.endingMembers - previousOverview.endingMembers,
        }
      : null,
    monthlyOverview,
  };
}

export const getChurnMetrics = query({
  args: {
    selectedPeriod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdmin(ctx, organizationId);
    return await computeChurnMetrics(ctx, organizationId, args);
  },
});
