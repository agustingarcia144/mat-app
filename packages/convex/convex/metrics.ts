import { query } from "./_generated/server";
import { requireCurrentOrganizationMembership } from "./permissions";

type MetricPoint = {
  performedOn: string;
  weight: number | null;
  volume: number | null;
  timeSeconds: number | null;
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

export const getExerciseMetricsByMembers = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "admin" && membership.role !== "trainer") {
      throw new Error("Unauthorized: Admin or trainer role required");
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
      await ctx.db.query("workoutDaySessions").collect()
    ).filter(
      (session) =>
        session.organizationId === organizationId &&
        session.status !== "skipped",
    );

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
            pointsByDate: Map<string, MetricPoint>;
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
      const nextStatus =
        assignment?.status === "active" ? "active" : "historical";
      const existingPlanification =
        memberEntry.planifications.get(planificationKey);
      if (!existingPlanification || existingPlanification.status !== "active") {
        memberEntry.planifications.set(planificationKey, {
          planificationId: planificationKey,
          planificationName,
          status: nextStatus,
        });
      }

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
          pointsByDate: new Map<string, MetricPoint>(),
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
          volume: nextVolume > 0 ? nextVolume : null,
          timeSeconds: nextTimeSeconds > 0 ? nextTimeSeconds : null,
        });

        memberEntry.exercises.set(exerciseKey, exerciseEntry);
      }

      members.set(userId, memberEntry);
    }

    const serializedMembers = Array.from(members.values())
      .map((member) => {
        const exercises = Array.from(member.exercises.values())
          .map((exercise) => {
            const points = Array.from(exercise.pointsByDate.values()).sort(
              (a, b) => a.performedOn.localeCompare(b.performedOn),
            );

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
