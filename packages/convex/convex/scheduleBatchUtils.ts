import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assignFixedSlotsToSchedule } from "./fixedClassSlots";

export type SingleBatchSourceConfig = {
  mode: "single";
  startTime: number;
  endTime: number;
  endDate?: number;
  durationMinutes: number;
};

export type TimeWindowBatchSourceConfig = {
  mode: "timeWindow";
  rangeStartDate: number;
  rangeEndDate: number;
  timeWindowStartMinutes: number;
  timeWindowEndMinutes: number;
  slotIntervalMinutes: number;
  durationMinutes: number;
  daysOfWeek?: number[];
};

export type ScheduleBatchSourceConfig =
  | SingleBatchSourceConfig
  | TimeWindowBatchSourceConfig;

export type ClassScheduleInsert = {
  classId: Id<"classes">;
  organizationId: Id<"organizations">;
  batchId?: Id<"scheduleBatches">;
  startTime: number;
  endTime: number;
  capacity: number;
  currentReservations: number;
  status: "scheduled";
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

type CreateBatchWithSchedulesArgs = {
  organizationId: Id<"organizations">;
  classId: Id<"classes">;
  sourceType: "single" | "timeWindow";
  sourceConfig: ScheduleBatchSourceConfig;
  createdBy: string;
  schedules: ClassScheduleInsert[];
  duplicatedFromBatchId?: Id<"scheduleBatches">;
  ignoreScheduleIds?: Set<string>;
};

export async function getSchedulesForBatch(
  ctx: MutationCtx | QueryCtx,
  batchId: Id<"scheduleBatches">,
) {
  return await ctx.db
    .query("classSchedules")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .collect();
}

export async function ensureNoScheduleConflicts(
  ctx: MutationCtx,
  schedules: ClassScheduleInsert[],
  ignoreScheduleIds?: Set<string>,
) {
  const seenKeys = new Set<string>();

  for (const schedule of schedules) {
    const key = `${schedule.classId}:${schedule.startTime}`;
    if (seenKeys.has(key)) {
      throw new Error("Hay turnos duplicados dentro del mismo lote.");
    }
    seenKeys.add(key);

    const existingAtSameTime = await ctx.db
      .query("classSchedules")
      .withIndex("by_class_time", (q) =>
        q.eq("classId", schedule.classId).eq("startTime", schedule.startTime),
      )
      .collect();

    const conflict = existingAtSameTime.find((existing) => {
      if (ignoreScheduleIds?.has(existing._id)) {
        return false;
      }
      return true;
    });

    if (conflict) {
      throw new Error(
        "Ya existe un turno para esa clase en una de las fechas seleccionadas.",
      );
    }
  }
}

export async function createBatchWithSchedules(
  ctx: MutationCtx,
  args: CreateBatchWithSchedulesArgs,
) {
  if (args.schedules.length === 0) {
    throw new Error("No hay turnos para guardar en el lote.");
  }

  const sortedSchedules = [...args.schedules].sort(
    (a, b) => a.startTime - b.startTime,
  );

  await ensureNoScheduleConflicts(ctx, sortedSchedules, args.ignoreScheduleIds);

  const now = Date.now();
  const batchId = await ctx.db.insert("scheduleBatches", {
    organizationId: args.organizationId,
    classId: args.classId,
    sourceType: args.sourceType,
    status: "active",
    sourceConfig: args.sourceConfig,
    generatedCount: sortedSchedules.length,
    firstStartTime: sortedSchedules[0].startTime,
    lastEndTime: sortedSchedules[sortedSchedules.length - 1].endTime,
    createdBy: args.createdBy,
    duplicatedFromBatchId: args.duplicatedFromBatchId,
    createdAt: now,
    updatedAt: now,
  });

  for (const schedule of sortedSchedules) {
    const scheduleId = await ctx.db.insert("classSchedules", {
      ...schedule,
      batchId,
    });
    await assignFixedSlotsToSchedule(ctx, scheduleId);
  }

  return {
    batchId,
    count: sortedSchedules.length,
    firstStartTime: sortedSchedules[0].startTime,
    lastEndTime: sortedSchedules[sortedSchedules.length - 1].endTime,
  };
}

export async function deleteSchedulesByIds(
  ctx: MutationCtx,
  scheduleIds: Id<"classSchedules">[],
) {
  for (const scheduleId of scheduleIds) {
    await ctx.db.delete(scheduleId);
  }
}
