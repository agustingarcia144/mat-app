import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  isStaffRole,
  requireCurrentOrganizationMembership,
  tryActiveOrgContext,
} from "./permissions";
import { toBillingStatus } from "./organizationBilling";
import { resolveAiAllowance } from "./appBillingPlans";
import {
  computeMemberPaymentSummary,
  computeOrganizationMetrics,
  computeOverdueMembers,
  getCurrentBillingPeriod,
} from "./planPayments";
import { computeFinanceSummary } from "./finance";
import { computePayrollSummary } from "./payroll";
import { computeActiveMembersHistory, computeChurnMetrics } from "./metrics";
import {
  computeClassMetrics,
  computeMemberAttendanceMetrics,
} from "./classMetrics";
import { computeMemberPaymentMetrics } from "./memberPaymentsAdmin";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const BURST_WINDOW_MS = 60 * 1000;
const BURST_LIMIT = 5;
const SOURCE_LIMIT = 1_000;
const RESULT_LIMIT = 100;

type AiRole = "admin" | "trainer" | "employee";
type AiAccess = {
  available: boolean;
  reason?: "not_staff" | "plan" | "billing";
  organizationId: Id<"organizations">;
  userId: string;
  role: AiRole;
  planKey: string | null;
  limit: number;
  cycleStart: number;
  cycleEnd: number;
  billingStatus: string;
};

function addUtcMonths(value: number, months: number) {
  const date = new Date(value);
  const day = date.getUTCDate();
  const candidate = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  candidate.setUTCDate(Math.min(day, lastDay));
  return candidate.getTime();
}

export function resolveAnchoredCycle(anchor: number, now: number) {
  let months =
    (new Date(now).getUTCFullYear() - new Date(anchor).getUTCFullYear()) * 12 +
    new Date(now).getUTCMonth() -
    new Date(anchor).getUTCMonth();
  let start = addUtcMonths(anchor, Math.max(0, months));
  if (start > now) start = addUtcMonths(anchor, Math.max(0, --months));
  let end = addUtcMonths(start, 1);
  while (end <= now) {
    start = end;
    end = addUtcMonths(start, 1);
  }
  return { cycleStart: start, cycleEnd: end };
}

async function resolveAiAccess(
  ctx: any,
  now = Date.now(),
): Promise<AiAccess | null> {
  const orgCtx = await tryActiveOrgContext(ctx);
  if (!orgCtx) return null;
  const role = orgCtx.membership.role;
  if (!isStaffRole(role)) {
    return {
      available: false,
      reason: "not_staff",
      organizationId: orgCtx.organizationId,
      userId: orgCtx.identity.subject,
      role: role as AiRole,
      planKey: null,
      limit: 0,
      cycleStart: now,
      cycleEnd: now,
      billingStatus: "inactive",
    };
  }

  const subscription = await ctx.db
    .query("organizationBillingSubscriptions")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", orgCtx.organizationId),
    )
    .order("desc")
    .first();
  const plan = subscription
    ? await ctx.db.get(subscription.billingPlanId)
    : null;
  const billingStatus = toBillingStatus(subscription);
  const planKey = plan?.key ?? null;
  // The allowance lives on the plan doc, so a super admin can retune it
  // without a deploy and a new plan needs no change here.
  const limit = resolveAiAllowance(plan?.entitlements).monthlyTurnLimit;
  // A trial runs on a paid plan's entitlements, so it is allowed whenever that
  // plan grants an allowance at all. Checking the limit rather than the plan
  // key keeps a future ULTRA trial from being silently AI-less.
  const billingAllowed =
    billingStatus === "active" ||
    billingStatus === "grace_period" ||
    (billingStatus === "trial" && limit > 0);

  let cycle: { cycleStart: number; cycleEnd: number };
  if (billingStatus === "trial" && subscription?.trialEndsAt) {
    cycle = {
      cycleStart: subscription.createdAt,
      cycleEnd: subscription.trialEndsAt,
    };
  } else if (
    subscription?.currentPeriodStart &&
    subscription?.currentPeriodEnd &&
    subscription.currentPeriodStart <= now &&
    subscription.currentPeriodEnd > now
  ) {
    cycle = {
      cycleStart: subscription.currentPeriodStart,
      cycleEnd: subscription.currentPeriodEnd,
    };
  } else {
    cycle = resolveAnchoredCycle(subscription?.createdAt ?? now, now);
  }

  return {
    available: billingAllowed && limit > 0,
    reason: billingAllowed ? "plan" : "billing",
    organizationId: orgCtx.organizationId,
    userId: orgCtx.identity.subject,
    role: role as AiRole,
    planKey,
    limit,
    ...cycle,
    billingStatus,
  };
}

async function requireAiAccess(ctx: any) {
  const access = await resolveAiAccess(ctx);
  if (!access?.available) {
    const error = new Error("AI_ACCESS_DENIED");
    (error as any).code = "AI_ACCESS_DENIED";
    throw error;
  }
  return access;
}

async function getUsageBucket(ctx: any, access: AiAccess) {
  return await ctx.db
    .query("aiUsageBuckets")
    .withIndex("by_organization_cycle", (q: any) =>
      q
        .eq("organizationId", access.organizationId)
        .eq("cycleStart", access.cycleStart),
    )
    .first();
}

async function assertOwnedConversation(
  ctx: any,
  conversationId: Id<"aiConversations">,
  access: AiAccess,
) {
  const conversation = await ctx.db.get(conversationId);
  if (
    !conversation ||
    conversation.organizationId !== access.organizationId ||
    conversation.userId !== access.userId
  ) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }
  return conversation;
}

function titleFromMessage(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 52 ? `${normalized.slice(0, 49)}…` : normalized;
}

export const getBootstrap = query({
  args: {},
  handler: async (ctx) => {
    const access = await resolveAiAccess(ctx);
    if (!access) return { available: false, reason: "auth" as const };
    const settings = await ctx.db
      .query("organizationSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", access.organizationId),
      )
      .first();
    const bucket = access.available ? await getUsageBucket(ctx, access) : null;
    const conversations = access.available
      ? await ctx.db
          .query("aiConversations")
          .withIndex("by_organization_user_updated", (q) =>
            q
              .eq("organizationId", access.organizationId)
              .eq("userId", access.userId),
          )
          .order("desc")
          .take(30)
      : [];
    const used = bucket?.used ?? 0;
    const reserved = bucket?.reserved ?? 0;
    return {
      available: access.available,
      reason: access.reason,
      role: access.role,
      planKey: access.planKey,
      showAiPet: settings?.showAiPet ?? true,
      usage: {
        used,
        reserved,
        limit: access.limit,
        remaining: Math.max(0, access.limit - used - reserved),
        cycleEnd: access.cycleEnd,
      },
      conversations: conversations.map((item: any) => ({
        id: item._id,
        title: item.title,
        updatedAt: item.updatedAt,
      })),
    };
  },
});

export const getConversation = query({
  args: { conversationId: v.id("aiConversations") },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const conversation = await assertOwnedConversation(
      ctx,
      args.conversationId,
      access,
    );
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("asc")
      .take(100);
    return {
      id: conversation._id,
      title: conversation.title,
      messages: messages
        .filter((message: any) => message.status !== "failed")
        .map((message: any) => ({
          id: message._id,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.createdAt,
        })),
    };
  },
});

export const createConversation = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const now = Date.now();
    return await ctx.db.insert("aiConversations", {
      organizationId: access.organizationId,
      userId: access.userId,
      title: args.title?.trim().slice(0, 80) || "Nueva conversación",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      expiresAt: now + RETENTION_MS,
    });
  },
});

export const renameConversation = mutation({
  args: { conversationId: v.id("aiConversations"), title: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    await assertOwnedConversation(ctx, args.conversationId, access);
    const title = args.title.trim().slice(0, 80);
    if (!title) throw new Error("AI_INVALID_TITLE");
    await ctx.db.patch(args.conversationId, { title, updatedAt: Date.now() });
  },
});

async function deleteConversationRecords(
  ctx: any,
  conversationId: Id<"aiConversations">,
) {
  const messages = await ctx.db
    .query("aiMessages")
    .withIndex("by_conversation_created", (q: any) =>
      q.eq("conversationId", conversationId),
    )
    .collect();
  const turns = await ctx.db
    .query("aiTurns")
    .withIndex("by_conversation", (q: any) =>
      q.eq("conversationId", conversationId),
    )
    .collect();
  for (const turn of turns) {
    if (turn.status === "reserved") {
      const bucket = await ctx.db
        .query("aiUsageBuckets")
        .withIndex("by_organization_cycle", (q: any) =>
          q
            .eq("organizationId", turn.organizationId)
            .eq("cycleStart", turn.cycleStart),
        )
        .first();
      if (bucket) {
        await ctx.db.patch(bucket._id, {
          reserved: Math.max(0, bucket.reserved - 1),
          updatedAt: Date.now(),
        });
      }
    }
    const audits = await ctx.db
      .query("aiToolAudits")
      .withIndex("by_turn", (q: any) => q.eq("turnId", turn._id))
      .collect();
    for (const audit of audits) await ctx.db.delete(audit._id);
    await ctx.db.delete(turn._id);
  }
  for (const message of messages) await ctx.db.delete(message._id);
  await ctx.db.delete(conversationId);
}

export const deleteConversation = mutation({
  args: { conversationId: v.id("aiConversations") },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    await assertOwnedConversation(ctx, args.conversationId, access);
    await deleteConversationRecords(ctx, args.conversationId);
  },
});

export const beginTurn = mutation({
  args: {
    conversationId: v.optional(v.id("aiConversations")),
    clientRequestId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const now = Date.now();
    const message = args.message.trim();
    if (!message || message.length > 4_000)
      throw new Error("AI_INVALID_MESSAGE");
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.clientRequestId)) {
      throw new Error("AI_INVALID_REQUEST_ID");
    }

    const existing = await ctx.db
      .query("aiTurns")
      .withIndex("by_user_request", (q) =>
        q
          .eq("userId", access.userId)
          .eq("clientRequestId", args.clientRequestId),
      )
      .first();
    if (existing) {
      return {
        conversationId: existing.conversationId,
        turnId: existing._id,
        duplicate: true,
      };
    }

    const activeTurn = await ctx.db
      .query("aiTurns")
      .withIndex("by_user_status_created", (q) =>
        q.eq("userId", access.userId).eq("status", "reserved"),
      )
      .order("desc")
      .first();
    if (activeTurn && activeTurn.updatedAt > now - RESERVATION_TTL_MS) {
      throw new Error("AI_TURN_IN_PROGRESS");
    }

    const recentTurns = await ctx.db
      .query("aiTurns")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", access.userId).gte("createdAt", now - BURST_WINDOW_MS),
      )
      .take(BURST_LIMIT);
    if (recentTurns.length >= BURST_LIMIT) throw new Error("AI_RATE_LIMITED");

    let bucket = await getUsageBucket(ctx, access);
    if (!bucket) {
      const bucketId = await ctx.db.insert("aiUsageBuckets", {
        organizationId: access.organizationId,
        planKey: access.planKey ?? "unknown",
        cycleStart: access.cycleStart,
        cycleEnd: access.cycleEnd,
        limit: access.limit,
        used: 0,
        reserved: 0,
        createdAt: now,
        updatedAt: now,
      });
      bucket = await ctx.db.get(bucketId);
    }
    if (!bucket || bucket.used + bucket.reserved >= access.limit) {
      throw new Error("AI_QUOTA_EXCEEDED");
    }

    let conversationId = args.conversationId;
    if (conversationId) {
      await assertOwnedConversation(ctx, conversationId, access);
    } else {
      conversationId = await ctx.db.insert("aiConversations", {
        organizationId: access.organizationId,
        userId: access.userId,
        title: titleFromMessage(message),
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        expiresAt: now + RETENTION_MS,
      });
    }

    const userMessageId = await ctx.db.insert("aiMessages", {
      organizationId: access.organizationId,
      conversationId,
      userId: access.userId,
      role: "user",
      content: message,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const turnId = await ctx.db.insert("aiTurns", {
      organizationId: access.organizationId,
      conversationId,
      userId: access.userId,
      userMessageId,
      clientRequestId: args.clientRequestId,
      status: "reserved",
      cycleStart: access.cycleStart,
      cycleEnd: access.cycleEnd,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(bucket._id, {
      reserved: bucket.reserved + 1,
      limit: access.limit,
      planKey: access.planKey ?? bucket.planKey,
      cycleEnd: access.cycleEnd,
      updatedAt: now,
    });
    await ctx.db.patch(conversationId, {
      updatedAt: now,
      lastMessageAt: now,
      expiresAt: now + RETENTION_MS,
    });
    return { conversationId, turnId, duplicate: false };
  },
});

export const getTurnContext = query({
  args: { turnId: v.id("aiTurns") },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== access.userId ||
      turn.organizationId !== access.organizationId ||
      turn.status !== "reserved"
    ) {
      throw new Error("AI_TURN_NOT_FOUND");
    }
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", turn.conversationId),
      )
      .order("asc")
      .take(60);
    const organization = await ctx.db.get(access.organizationId);
    return {
      turnId: turn._id,
      conversationId: turn.conversationId,
      organizationName: organization?.name ?? "la organización",
      timezone: organization?.timezone ?? "UTC",
      role: access.role,
      messages: messages
        .filter((message: any) => message.status !== "failed")
        .map((message: any) => ({
          role: message.role,
          content: message.content,
        })),
    };
  },
});

export const completeTurn = mutation({
  args: {
    turnId: v.id("aiTurns"),
    content: v.string(),
    model: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== membership.userId ||
      turn.organizationId !== membership.organizationId ||
      turn.status !== "reserved"
    )
      return;
    const now = Date.now();
    const assistantMessageId = await ctx.db.insert("aiMessages", {
      organizationId: turn.organizationId,
      conversationId: turn.conversationId,
      userId: turn.userId,
      role: "assistant",
      content: args.content.trim() || "No pude generar una respuesta.",
      status: "complete",
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(turn.userMessageId, {
      status: "complete",
      updatedAt: now,
    });
    await ctx.db.patch(turn._id, {
      assistantMessageId,
      status: "complete",
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      completedAt: now,
      updatedAt: now,
    });
    const bucket = await ctx.db
      .query("aiUsageBuckets")
      .withIndex("by_organization_cycle", (q) =>
        q
          .eq("organizationId", turn.organizationId)
          .eq("cycleStart", turn.cycleStart),
      )
      .first();
    if (bucket) {
      await ctx.db.patch(bucket._id, {
        reserved: Math.max(0, bucket.reserved - 1),
        used: bucket.used + 1,
        updatedAt: now,
      });
    }
    await ctx.db.patch(turn.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
      expiresAt: now + RETENTION_MS,
    });
  },
});

export const failTurn = mutation({
  args: { turnId: v.id("aiTurns"), errorCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== membership.userId ||
      turn.organizationId !== membership.organizationId ||
      turn.status !== "reserved"
    )
      return;
    const now = Date.now();
    await ctx.db.patch(turn.userMessageId, {
      status: "failed",
      updatedAt: now,
    });
    await ctx.db.patch(turn._id, {
      status: "failed",
      errorCode: args.errorCode?.slice(0, 80),
      completedAt: now,
      updatedAt: now,
    });
    const bucket = await ctx.db
      .query("aiUsageBuckets")
      .withIndex("by_organization_cycle", (q) =>
        q
          .eq("organizationId", turn.organizationId)
          .eq("cycleStart", turn.cycleStart),
      )
      .first();
    if (bucket) {
      await ctx.db.patch(bucket._id, {
        reserved: Math.max(0, bucket.reserved - 1),
        updatedAt: now,
      });
    }
  },
});

type DataRecord = Record<string, string | number | boolean | null | undefined>;

export const DATASET_ACCESS: Record<string, "staff" | "admin"> = {
  members: "staff",
  membershipPlans: "admin",
  memberSubscriptions: "admin",
  memberPayments: "admin",
  overdueMembers: "admin",
  memberPaymentTransactions: "admin",
  recurringAgreements: "admin",
  bonifications: "admin",
  financeRecurringRules: "admin",
  classes: "staff",
  schedules: "staff",
  attendance: "staff",
  planifications: "staff",
  assignments: "staff",
  workoutSessions: "staff",
  exerciseLogs: "staff",
  exercises: "staff",
  finance: "admin",
  staffShifts: "admin",
  payroll: "admin",
  rewards: "staff",
  checkIns: "staff",
  redemptions: "staff",
  organizationSettings: "admin",
};

async function nameMap(ctx: any, organizationId: Id<"organizations">) {
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId),
    )
    .take(SOURCE_LIMIT);
  const entries = await Promise.all(
    memberships.map(async (membership: any) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_externalId", (q: any) =>
          q.eq("externalId", membership.userId),
        )
        .first();
      return [
        membership.userId,
        user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.email ||
          "Usuario",
      ] as const;
    }),
  );
  return new Map(entries);
}

type DatasetRequest = {
  filters?: Array<{ field?: string; op?: string; value?: unknown }>;
  dateRange?: { field?: string; from?: unknown; to?: unknown };
  [key: string]: unknown;
};

/**
 * The "YYYY-MM" periods the caller asked for, so period-partitioned tables can
 * hit their index instead of scanning the newest SOURCE_LIMIT rows. Returns
 * null when the request does not pin the period down to a workable set.
 */
function requestedPeriods(
  request: DatasetRequest | undefined,
  field: string,
): string[] | null {
  const filters = Array.isArray(request?.filters) ? request.filters : [];
  const periods = new Set<string>();
  for (const filter of filters) {
    if (String(filter?.field ?? "") !== field) continue;
    const op = String(filter?.op ?? "eq");
    if (op === "eq" && typeof filter.value === "string") {
      periods.add(filter.value);
    } else if (op === "in" && Array.isArray(filter.value)) {
      for (const value of filter.value) {
        if (typeof value === "string") periods.add(value);
      }
    } else {
      // A range or negation over periods cannot be narrowed safely.
      return null;
    }
  }
  if (periods.size === 0 || periods.size > 12) return null;
  return [...periods];
}

/** The epoch-ms window the caller asked for on a timestamp field, if any. */
function requestedRange(
  request: DatasetRequest | undefined,
  field: string,
): { from?: number; to?: number } | null {
  const dateRange = request?.dateRange;
  if (!dateRange || String(dateRange.field ?? "") !== field) return null;
  const from = Number(dateRange.from);
  const to = Number(dateRange.to);
  const range: { from?: number; to?: number } = {};
  if (Number.isFinite(from)) range.from = from;
  if (Number.isFinite(to)) range.to = to;
  return range.from === undefined && range.to === undefined ? null : range;
}

/**
 * Projects org data into flat, PII-light records for the assistant.
 *
 * Every field name produced here must also appear in the catalog at
 * `apps/web/lib/ai/dataset-catalog.ts` — the model reads that catalog to build
 * valid queries, and `ai.test.ts` fails if the two drift apart.
 */
async function loadDataset(
  ctx: any,
  access: AiAccess,
  dataset: string,
  request?: DatasetRequest,
): Promise<DataRecord[]> {
  const organizationId = access.organizationId;
  const names = await nameMap(ctx, organizationId);
  const userName = (id: string | undefined): string | null =>
    id ? String(names.get(id) ?? "Usuario") : null;
  const orgRows = async (table: string, index = "by_organization") =>
    await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq("organizationId", organizationId))
      .take(SOURCE_LIMIT);
  // Newest-first, so truncation drops the oldest rows rather than the ones the
  // question is almost always about.
  const recentRows = async (table: string, index = "by_organization") =>
    await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(SOURCE_LIMIT);
  const periodRows = async (table: string, field = "period") => {
    const periods = requestedPeriods(request, field);
    if (!periods) {
      return await ctx.db
        .query(table)
        .withIndex("by_organization_period", (q: any) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(SOURCE_LIMIT);
    }
    const perPeriod = Math.max(1, Math.floor(SOURCE_LIMIT / periods.length));
    const batches = await Promise.all(
      periods.map((period) =>
        ctx.db
          .query(table)
          .withIndex("by_organization_period", (q: any) =>
            q.eq("organizationId", organizationId).eq(field, period),
          )
          .take(perPeriod),
      ),
    );
    return batches.flat();
  };
  const rangeRows = async (table: string, index: string, field: string) => {
    const range = requestedRange(request, field);
    return await ctx.db
      .query(table)
      .withIndex(index, (q: any) => {
        let builder = q.eq("organizationId", organizationId);
        if (range?.from !== undefined) builder = builder.gte(field, range.from);
        if (range?.to !== undefined) builder = builder.lte(field, range.to);
        return builder;
      })
      .order("desc")
      .take(SOURCE_LIMIT);
  };

  switch (dataset) {
    case "members": {
      const memberships = await orgRows("organizationMemberships");
      return await Promise.all(
        memberships.map(async (item: any) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_externalId", (q: any) =>
              q.eq("externalId", item.userId),
            )
            .first();
          return {
            name: userName(item.userId),
            email: user?.email,
            phone: user?.phone,
            birthday: user?.birthday,
            role: item.role,
            status: item.status,
            usesPlanification: item.usesPlanification ?? false,
            responsibleStaff: userName(item.responsibleUserId),
            joinedAt: item.joinedAt,
            lastActiveAt: item.lastActiveAt,
          };
        }),
      );
    }
    case "membershipPlans":
      return (await orgRows("membershipPlans")).map((item: any) => ({
        name: item.name,
        description: item.description,
        priceArs: item.priceArs,
        weeklyClassLimit: item.weeklyClassLimit,
        billingMode: item.billingMode ?? "calendar",
        paymentWindowStartDay: item.paymentWindowStartDay,
        paymentWindowEndDay: item.paymentWindowEndDay,
        interestTiersSummary: Array.isArray(item.interestTiers)
          ? item.interestTiers
              .map(
                (tier: any) =>
                  `+${tier.percentage}% desde el día ${tier.fromDay}`,
              )
              .join("; ") || "sin recargos"
          : "sin recargos",
        classesEnabled: item.classesEnabled ?? true,
        isActive: item.isActive,
        createdAt: item.createdAt,
      }));
    case "memberSubscriptions": {
      const rows = await orgRows("memberPlanSubscriptions");
      return await Promise.all(
        rows.map(async (item: any) => {
          const plan = await ctx.db.get(item.planId);
          return {
            member: userName(item.userId),
            plan: plan?.name ?? "Plan eliminado",
            status: item.status,
            paymentMode: item.paymentMode ?? "manual",
            activatedAt: item.activatedAt,
            accessEndsAt: item.accessEndsAt,
            updatedAt: item.updatedAt,
          };
        }),
      );
    }
    case "memberPayments": {
      const rows = await recentRows("planPayments");
      return await Promise.all(
        rows.map(async (item: any) => {
          const plan = await ctx.db.get(item.planId);
          return {
            member: userName(item.userId),
            plan: plan?.name ?? "Plan eliminado",
            billingPeriod: item.billingPeriod,
            amountArs: item.amountArs,
            totalAmountArs: item.totalAmountArs ?? item.amountArs,
            interestTotalArs: item.interestTotalArs ?? 0,
            dueAt: item.dueAt,
            billingCycleStartAt: item.billingCycleStartAt,
            billingCycleEndAt: item.billingCycleEndAt,
            isAdvancePayment: Boolean(item.advancePaymentGroupId),
            paymentMethod: item.paymentMethod ?? "proof_upload",
            status: item.status,
            createdAt: item.createdAt,
            reviewedAt: item.reviewedAt,
          };
        }),
      );
    }
    case "overdueMembers": {
      const { rows, billingPeriod } = await computeOverdueMembers(
        ctx,
        organizationId,
      );
      return rows.map((row: any) => ({
        member: userName(row.userId),
        billingPeriod,
        situation: row.situation,
        unpaid: row.unpaid,
        subscriptionStatus: row.subscriptionStatus,
        suspended: row.suspended,
        amountDueArs: row.amountDueArs,
        dueAt: row.dueAt,
        daysOverdue: row.daysOverdue,
        paymentMethod: row.paymentMethod,
      }));
    }
    case "memberPaymentTransactions": {
      const rows = await rangeRows(
        "memberPaymentTransactions",
        "by_organization_created",
        "createdAt",
      );
      return await Promise.all(
        rows.map(async (item: any) => {
          const agreement = item.agreementId
            ? await ctx.db.get(item.agreementId)
            : null;
          return {
            member: userName(agreement?.payerUserId),
            kind: item.kind,
            status: item.status,
            grossAmountArs: item.grossAmountArs,
            providerFeeArs: item.providerFeeArs,
            platformFeeArs: item.platformFeeArs,
            gymNetAmountArs: item.gymNetAmountArs,
            providerApprovedAt: item.providerApprovedAt,
            requiresAttention: item.requiresAttention ?? false,
            attentionReason: item.attentionReason,
            createdAt: item.createdAt,
          };
        }),
      );
    }
    case "recurringAgreements":
      return (await recentRows("memberRecurringAgreements")).map(
        (item: any) => ({
          member: userName(item.payerUserId),
          status: item.status,
          amountArs: item.amountArs,
          familyMemberCount: item.familyMemberCount,
          lastPaymentStatus: item.lastPaymentStatus,
          nextChargeAt: item.nextChargeAt,
          currentPeriodStart: item.currentPeriodStart,
          currentPeriodEnd: item.currentPeriodEnd,
          firstFailureAt: item.firstFailureAt,
          graceUntil: item.graceUntil,
          createdAt: item.createdAt,
        }),
      );
    case "bonifications": {
      const rows = await orgRows("planBonifications");
      return await Promise.all(
        rows.map(async (item: any) => {
          const plan = await ctx.db.get(item.planId);
          return {
            member: userName(item.userId),
            plan: plan?.name ?? "Plan eliminado",
            discountType: item.discountType,
            discountValue: item.discountValue,
            reason: item.reason,
            status: item.status,
            createdAt: item.createdAt,
            revokedAt: item.revokedAt,
          };
        }),
      );
    }
    case "financeRecurringRules":
      return (await orgRows("financeRecurringRules")).map((item: any) => ({
        type: item.type,
        title: item.title,
        category: item.category,
        amountArs: item.amountArs,
        frequency: item.frequency,
        dayOfMonth: item.dayOfMonth,
        startPeriod: item.startPeriod,
        endPeriod: item.endPeriod,
        nextDuePeriod: item.nextDuePeriod,
        status: item.status,
      }));
    case "classes":
      return (await orgRows("classes")).map((item: any) => ({
        name: item.name,
        description: item.description,
        capacity: item.capacity,
        trainer: userName(item.trainerId),
        isRecurring: item.isRecurring,
        isActive: item.isActive,
        createdAt: item.createdAt,
      }));
    case "schedules": {
      const rows = await orgRows("classSchedules");
      return await Promise.all(
        rows.map(async (item: any) => {
          const classDoc = await ctx.db.get(item.classId);
          return {
            className: classDoc?.name ?? "Clase eliminada",
            startTime: item.startTime,
            endTime: item.endTime,
            capacity: item.capacity,
            reservations: item.currentReservations,
            availableSpots: Math.max(
              0,
              item.capacity - item.currentReservations,
            ),
            status: item.status,
            inCharge: userName(item.inChargeUserId),
          };
        }),
      );
    }
    case "attendance": {
      const rows = await recentRows("classReservations");
      return await Promise.all(
        rows.map(async (item: any) => {
          const classDoc = await ctx.db.get(item.classId);
          return {
            member: userName(item.userId),
            className: classDoc?.name ?? "Clase eliminada",
            startTime: item.scheduleStartTime,
            status: item.status,
            checkedInAt: item.checkedInAt,
            createdAt: item.createdAt,
          };
        }),
      );
    }
    case "planifications":
      return (await orgRows("planifications")).map((item: any) => ({
        name: item.name,
        description: item.description,
        isTemplate: item.isTemplate,
        isArchived: item.isArchived ?? false,
        createdBy: userName(item.createdBy),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    case "assignments": {
      const rows = await orgRows("planificationAssignments");
      return await Promise.all(
        rows.map(async (item: any) => {
          const planification = await ctx.db.get(item.planificationId);
          return {
            member: userName(item.userId),
            planification: planification?.name ?? "Planificación eliminada",
            assignedBy: userName(item.assignedBy),
            status: item.status,
            startDate: item.startDate,
            endDate: item.endDate,
            createdAt: item.createdAt,
          };
        }),
      );
    }
    case "workoutSessions":
      return (
        await orgRows("workoutDaySessions", "by_organization_performedOn")
      ).map((item: any) => ({
        member: userName(item.userId),
        performedOn: item.performedOn,
        status: item.status,
        effortRating: item.effortRating,
        mood: item.mood,
        memberNote: item.memberNote,
        createdAt: item.createdAt,
      }));
    case "exerciseLogs": {
      const sessions = await ctx.db
        .query("workoutDaySessions")
        .withIndex("by_organization_performedOn", (q: any) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(200);
      const records: DataRecord[] = [];
      for (const session of sessions) {
        const logs = await ctx.db
          .query("sessionExerciseLogs")
          .withIndex("by_session", (q: any) => q.eq("sessionId", session._id))
          .take(20);
        for (const log of logs) {
          const dayExercise = await ctx.db.get(log.dayExerciseId);
          const exercise = dayExercise
            ? await ctx.db.get(dayExercise.exerciseId)
            : null;
          records.push({
            member: userName(session.userId),
            performedOn: session.performedOn,
            exercise: exercise?.name ?? "Ejercicio eliminado",
            sets: log.sets,
            reps: log.reps,
            weight: log.weight,
            timeSeconds: log.timeSeconds,
            comment: log.comment,
          });
          if (records.length >= SOURCE_LIMIT) return records;
        }
      }
      return records;
    }
    case "exercises":
      return (await orgRows("exercises")).map((item: any) => ({
        name: item.name,
        description: item.description,
        category: item.category,
        muscleGroups: item.muscleGroups.join(", "),
        equipment: item.equipment,
        isStandard: item.isStandard ?? false,
        createdAt: item.createdAt,
      }));
    case "finance":
      // Voided transactions must never reach a sum, so they are dropped here
      // rather than left for the model to filter out.
      return (await periodRows("financeTransactions"))
        .filter((item: any) => item.status !== "voided")
        .map((item: any) => ({
          type: item.type,
          title: item.title,
          category: item.category,
          amountArs: item.amountArs,
          occurredOn: item.occurredOn,
          period: item.period,
          paymentMethod: item.paymentMethod,
          source: item.source,
          status: item.status,
        }));
    case "staffShifts":
      return (await orgRows("staffShifts")).map((item: any) => ({
        staff: userName(item.userId),
        startTime: item.startTime,
        endTime: item.endTime,
        durationHours: Math.max(0, item.endTime - item.startTime) / 3_600_000,
        status: item.status,
        notes: item.notes,
      }));
    case "payroll":
      return (await periodRows("staffPayrollPayments")).map((item: any) => ({
        staff: userName(item.userId),
        period: item.period,
        payrollType: item.payrollType,
        hours: item.hours,
        classesInCharge: item.classesInCharge,
        commissionPercentage: item.commissionPercentage,
        amountArs: item.amountArs,
        occurredOn: item.occurredOn,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt,
      }));
    case "rewards":
      return (await orgRows("rewardAccounts")).map((item: any) => ({
        member: userName(item.userId),
        balance: item.balance,
        lifetimeEarned: item.lifetimeEarned,
        lifetimeRedeemed: item.lifetimeRedeemed,
        status: item.status,
        updatedAt: item.updatedAt,
      }));
    case "checkIns":
      return (
        await rangeRows("memberCheckIns", "by_organization_time", "checkedInAt")
      ).map((item: any) => ({
        member: userName(item.userId),
        localDate: item.localDate,
        checkedInAt: item.checkedInAt,
        source: item.source,
        status: item.status,
        reasonCode: item.reasonCode,
        pointsAwarded: item.pointsAwarded,
      }));
    case "redemptions": {
      const rows = await orgRows("rewardRedemptions");
      return await Promise.all(
        rows.map(async (item: any) => {
          const reward = await ctx.db.get(item.rewardDefinitionId);
          return {
            member: userName(item.userId),
            reward: reward?.name ?? "Recompensa eliminada",
            pointsCost: item.pointsCost,
            status: item.status,
            createdAt: item.createdAt,
            fulfilledAt: item.fulfilledAt,
            cancelledAt: item.cancelledAt,
          };
        }),
      );
    }
    case "organizationSettings": {
      const settings = await ctx.db
        .query("organizationSettings")
        .withIndex("by_organization", (q: any) =>
          q.eq("organizationId", organizationId),
        )
        .first();
      return settings
        ? [
            {
              planificationsEnabled: settings.planificationsEnabled,
              classesEnabled: settings.classesEnabled,
              financeEnabled: settings.financeEnabled,
              memberAutoApproval: settings.memberAutoApproval,
              showAiPet: settings.showAiPet ?? true,
              rewardsEnabled: settings.rewards?.enabled ?? false,
            },
          ]
        : [];
    }
    default:
      throw new Error("AI_UNKNOWN_DATASET");
  }
}

function compareValue(actual: unknown, op: string, expected: unknown) {
  switch (op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual ?? "")
        .toLocaleLowerCase()
        .includes(String(expected ?? "").toLocaleLowerCase());
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "between":
      return (
        Array.isArray(expected) &&
        expected.length === 2 &&
        Number(actual) >= Number(expected[0]) &&
        Number(actual) <= Number(expected[1])
      );
    default:
      throw new Error("AI_INVALID_OPERATOR");
  }
}

function numeric(values: unknown[]) {
  return values.map(Number).filter(Number.isFinite);
}

function aggregateRecords(records: DataRecord[], input: any) {
  const groupFields = Array.isArray(input.groupBy)
    ? input.groupBy.slice(0, 3)
    : input.groupBy
      ? [String(input.groupBy)]
      : [];
  const aggregateDefs = Array.isArray(input.aggregates)
    ? input.aggregates.slice(0, 8)
    : [{ op: "count", as: "count" }];
  const groups = new Map<string, DataRecord[]>();
  for (const record of records) {
    const key = JSON.stringify(
      groupFields.map((field: string) => record[field] ?? null),
    );
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  if (groups.size === 0 && groupFields.length === 0) groups.set("[]", []);
  return [...groups.entries()].map(([key, rows]) => {
    const groupValues = JSON.parse(key) as unknown[];
    const result: DataRecord = {};
    groupFields.forEach((field: string, index: number) => {
      result[field] = groupValues[index] as any;
    });
    for (const definition of aggregateDefs) {
      const op = String(definition.op ?? "count");
      const field = definition.field ? String(definition.field) : undefined;
      const alias = String(
        definition.as ?? (field ? `${op}_${field}` : op),
      ).slice(0, 60);
      const values = field ? numeric(rows.map((row) => row[field])) : [];
      if (op === "count") result[alias] = rows.length;
      else if (op === "sum") result[alias] = values.reduce((a, b) => a + b, 0);
      else if (op === "avg")
        result[alias] = values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null;
      else if (op === "min")
        result[alias] = values.length ? Math.min(...values) : null;
      else if (op === "max")
        result[alias] = values.length ? Math.max(...values) : null;
      else throw new Error("AI_INVALID_AGGREGATE");
    }
    return result;
  });
}

export const queryOrganizationData = query({
  args: { turnId: v.id("aiTurns"), request: v.any() },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== access.userId ||
      turn.organizationId !== access.organizationId ||
      turn.status !== "reserved"
    ) {
      throw new Error("AI_TURN_NOT_FOUND");
    }
    const request = args.request ?? {};
    const dataset = String(request.dataset ?? "");
    const requiredAccess = DATASET_ACCESS[dataset];
    if (!requiredAccess) throw new Error("AI_UNKNOWN_DATASET");
    if (requiredAccess === "admin" && access.role !== "admin") {
      throw new Error("AI_DATASET_FORBIDDEN");
    }
    let records = await loadDataset(ctx, access, dataset, request);
    const sourceRowCount = records.length;
    const allowedFields = new Set(
      records.flatMap((record) => Object.keys(record)),
    );
    const filters = Array.isArray(request.filters)
      ? request.filters.slice(0, 12)
      : [];
    for (const filter of filters) {
      const field = String(filter.field ?? "");
      if (!allowedFields.has(field)) throw new Error("AI_UNKNOWN_FIELD");
      records = records.filter((record) =>
        compareValue(record[field], String(filter.op ?? "eq"), filter.value),
      );
    }
    if (request.dateRange) {
      const field = String(request.dateRange.field ?? "createdAt");
      if (!allowedFields.has(field)) throw new Error("AI_UNKNOWN_FIELD");
      const from = request.dateRange.from;
      const to = request.dateRange.to;
      records = records.filter((record) => {
        const value = record[field];
        const normalized =
          typeof value === "string" ? Date.parse(value) : Number(value);
        if (!Number.isFinite(normalized)) return false;
        return (
          (from === undefined || normalized >= Number(from)) &&
          (to === undefined || normalized <= Number(to))
        );
      });
    }
    const totalMatched = records.length;
    const groupFields = Array.isArray(request.groupBy)
      ? request.groupBy.slice(0, 3)
      : request.groupBy
        ? [String(request.groupBy)]
        : [];
    if (groupFields.some((field: string) => !allowedFields.has(field))) {
      throw new Error("AI_UNKNOWN_FIELD");
    }
    const aggregateFields = Array.isArray(request.aggregates)
      ? request.aggregates
          .map((aggregate: any) => aggregate.field)
          .filter(Boolean)
      : [];
    if (
      aggregateFields.some((field: string) => !allowedFields.has(String(field)))
    ) {
      throw new Error("AI_UNKNOWN_FIELD");
    }
    let result =
      request.mode === "aggregate"
        ? aggregateRecords(records, request)
        : records;
    if (request.sort?.field) {
      const field = String(request.sort.field);
      const direction = request.sort.direction === "asc" ? 1 : -1;
      if (
        !new Set(result.flatMap((record) => Object.keys(record))).has(field)
      ) {
        throw new Error("AI_UNKNOWN_FIELD");
      }
      result = [...result].sort((a, b) => {
        const av = a[field] ?? "";
        const bv = b[field] ?? "";
        return av < bv ? -direction : av > bv ? direction : 0;
      });
    }
    const requestedLimit = Math.max(
      1,
      Math.min(RESULT_LIMIT, Number(request.limit) || 50),
    );
    const fields = Array.isArray(request.fields)
      ? request.fields.slice(0, 20)
      : [];
    const resultFields = new Set(
      result.flatMap((record) => Object.keys(record)),
    );
    if (fields.some((field: string) => !resultFields.has(field))) {
      throw new Error("AI_UNKNOWN_FIELD");
    }
    const sliced = result
      .slice(0, requestedLimit)
      .map((record) =>
        fields.length
          ? Object.fromEntries(
              fields.map((field: string) => [field, record[field]]),
            )
          : record,
      );
    const mode = request.mode === "aggregate" ? "aggregate" : "records";
    const sourceTruncated = sourceRowCount >= SOURCE_LIMIT;
    const truncated = result.length > sliced.length || sourceTruncated;
    return {
      dataset,
      mode,
      appliedFilters: { filters, dateRange: request.dateRange ?? null },
      totalMatched,
      returned: sliced.length,
      truncated,
      // An aggregate computed over a truncated scan is wrong, not merely
      // partial, so the model is told not to report it as a fact.
      aggregateReliable: mode === "aggregate" ? !sourceTruncated : undefined,
      note:
        mode === "aggregate" && sourceTruncated
          ? `Solo se leyeron las ${SOURCE_LIMIT} filas más recientes de ${dataset}: el total es un piso, no un valor exacto. Acotá el rango o el período y volvé a consultar.`
          : undefined,
      asOf: Date.now(),
      records: sliced,
    };
  },
});

export const REPORT_ACCESS: Record<string, "staff" | "admin"> = {
  financeSummary: "admin",
  membershipRevenue: "admin",
  memberPaymentsHealth: "admin",
  payrollSummary: "admin",
  // churn and classMetrics mirror their source queries, which are admin-only.
  churn: "admin",
  activeMembersHistory: "staff",
  classMetrics: "admin",
  memberAttendance: "staff",
  memberPaymentStatus: "staff",
};

/** Keeps long trend arrays from blowing up the model's context. */
function trimSeries<T>(value: T[] | undefined, keep = 12): T[] {
  return Array.isArray(value) ? value.slice(-keep) : [];
}

/**
 * Precomputed rollups, reusing the same helpers the dashboard renders.
 *
 * These exist because aggregating from `queryOrganizationData` is capped at
 * SOURCE_LIMIT rows: for anything that needs every row (revenue, churn,
 * occupancy) the honest answer has to come from these instead.
 */
export const runReport = query({
  args: {
    turnId: v.id("aiTurns"),
    report: v.string(),
    args: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const access = await requireAiAccess(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== access.userId ||
      turn.organizationId !== access.organizationId ||
      turn.status !== "reserved"
    ) {
      throw new Error("AI_TURN_NOT_FOUND");
    }
    const report = String(args.report ?? "");
    const requiredAccess = REPORT_ACCESS[report];
    if (!requiredAccess) throw new Error("AI_UNKNOWN_REPORT");
    if (requiredAccess === "admin" && access.role !== "admin") {
      throw new Error("AI_REPORT_FORBIDDEN");
    }

    const organizationId = access.organizationId;
    const input = args.args ?? {};
    const period = typeof input.period === "string" ? input.period : undefined;
    const selectedPeriod =
      typeof input.selectedPeriod === "string"
        ? input.selectedPeriod
        : undefined;
    const asOf = Date.now();

    switch (report) {
      case "financeSummary":
        return {
          report,
          asOf,
          data: await computeFinanceSummary(ctx, organizationId, { period }),
        };
      case "membershipRevenue": {
        const data: any = await computeOrganizationMetrics(
          ctx,
          organizationId,
          {
            selectedPeriod,
          },
        );
        return {
          report,
          asOf,
          data: {
            ...data,
            availablePeriods: trimSeries(data.availablePeriods),
            monthlyOverview: trimSeries(data.monthlyOverview),
          },
        };
      }
      case "memberPaymentsHealth":
        return {
          report,
          asOf,
          data: await computeMemberPaymentMetrics(ctx, organizationId, {
            sinceDays: Number(input.sinceDays) || 30,
          }),
        };
      case "payrollSummary": {
        const resolvedPeriod = period ?? getCurrentBillingPeriod();
        const [year, month] = resolvedPeriod.split("-").map(Number);
        if (!year || !month) throw new Error("AI_INVALID");
        const startDate = Date.UTC(year, month - 1, 1);
        const endDate = Date.UTC(year, month, 1) - 1;
        return {
          report,
          asOf,
          data: await computePayrollSummary(ctx, organizationId, {
            period: resolvedPeriod,
            startDate,
            endDate,
          }),
        };
      }
      case "churn": {
        const data: any = await computeChurnMetrics(ctx, organizationId, {
          selectedPeriod,
        });
        return {
          report,
          asOf,
          data: {
            ...data,
            availablePeriods: trimSeries(data.availablePeriods),
            monthlyOverview: trimSeries(data.monthlyOverview),
          },
        };
      }
      case "activeMembersHistory":
        return {
          report,
          asOf,
          data: await computeActiveMembersHistory(ctx, organizationId, {
            monthsCount: Number(input.monthsCount) || 6,
          }),
        };
      case "classMetrics": {
        const data: any = await computeClassMetrics(ctx, organizationId);
        return {
          report,
          asOf,
          data: { ...data, monthlyTrend: trimSeries(data.monthlyTrend) },
        };
      }
      case "memberAttendance": {
        const data: any = await computeMemberAttendanceMetrics(
          ctx,
          organizationId,
          { rangeDays: Number(input.rangeDays) || 0 },
        );
        return {
          report,
          asOf,
          data: {
            ...data,
            // The full ranking can run to thousands of members.
            members: trimSeries(data.members, 50),
          },
        };
      }
      case "memberPaymentStatus": {
        // Resolve by display name so the model never has to handle a Clerk id.
        const wanted = String(input.member ?? input.userId ?? "").trim();
        if (!wanted) throw new Error("AI_INVALID");
        const names = await nameMap(ctx, organizationId);
        const matches = [...names.entries()].filter(
          ([userId, name]) =>
            userId === wanted ||
            String(name)
              .toLocaleLowerCase()
              .includes(wanted.toLocaleLowerCase()),
        );
        if (matches.length === 0) throw new Error("AI_MEMBER_NOT_FOUND");
        if (matches.length > 1) {
          return {
            report,
            asOf,
            ambiguous: matches.slice(0, 10).map(([, name]) => String(name)),
          };
        }
        const data: any = await computeMemberPaymentSummary(
          ctx,
          organizationId,
          {
            userId: String(matches[0]![0]),
          },
        );
        return { report, asOf, member: String(matches[0]![1]), data };
      }
      default:
        throw new Error("AI_UNKNOWN_REPORT");
    }
  },
});

export const recordToolAudit = mutation({
  args: {
    turnId: v.id("aiTurns"),
    source: v.union(
      v.literal("organization"),
      v.literal("report"),
      v.literal("help"),
      v.literal("schema"),
    ),
    dataset: v.string(),
    normalizedQuery: v.any(),
    rowCount: v.number(),
    truncated: v.boolean(),
    durationMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const turn = await ctx.db.get(args.turnId);
    if (
      !turn ||
      turn.userId !== membership.userId ||
      turn.organizationId !== membership.organizationId
    ) {
      throw new Error("AI_TURN_NOT_FOUND");
    }
    await ctx.db.insert("aiToolAudits", {
      organizationId: turn.organizationId,
      conversationId: turn.conversationId,
      turnId: turn._id,
      userId: turn.userId,
      source: args.source,
      dataset: args.dataset.slice(0, 80),
      normalizedQuery: args.normalizedQuery,
      rowCount: Math.max(0, Math.floor(args.rowCount)),
      truncated: args.truncated,
      durationMs: Math.max(0, Math.floor(args.durationMs)),
      error: args.error?.slice(0, 200),
      createdAt: Date.now(),
    });
  },
});

export const cleanup = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.max(1, Math.min(100, args.limit ?? 50));
    const staleTurns = await ctx.db
      .query("aiTurns")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "reserved").lt("updatedAt", now - RESERVATION_TTL_MS),
      )
      .take(limit);
    for (const turn of staleTurns) {
      const bucket = await ctx.db
        .query("aiUsageBuckets")
        .withIndex("by_organization_cycle", (q) =>
          q
            .eq("organizationId", turn.organizationId)
            .eq("cycleStart", turn.cycleStart),
        )
        .first();
      if (bucket) {
        await ctx.db.patch(bucket._id, {
          reserved: Math.max(0, bucket.reserved - 1),
          updatedAt: now,
        });
      }
      await ctx.db.patch(turn.userMessageId, {
        status: "failed",
        updatedAt: now,
      });
      await ctx.db.patch(turn._id, {
        status: "failed",
        errorCode: "reservation_expired",
        completedAt: now,
        updatedAt: now,
      });
    }
    const expired = await ctx.db
      .query("aiConversations")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(limit);
    for (const conversation of expired) {
      await deleteConversationRecords(ctx, conversation._id);
    }
    return { released: staleTurns.length, deleted: expired.length };
  },
});
