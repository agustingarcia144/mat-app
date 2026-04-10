import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAdmin,
  requireAuth,
  requireCurrentOrganizationMembership,
} from "./permissions";
import type { Doc, Id } from "./_generated/dataModel";

const paymentMethodV = v.optional(
  v.union(
    v.literal("cash"),
    v.literal("bank_transfer"),
    v.literal("card"),
    v.literal("other"),
  ),
);

const transactionTypeV = v.union(v.literal("income"), v.literal("expense"));

const recurringStatusV = v.optional(
  v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled")),
);

function assertDate(value: string, fieldName = "Fecha") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} inválida (esperado YYYY-MM-DD)`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${fieldName} inválida`);
  }
}

function assertPeriod(value: string, fieldName = "Período") {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} inválido (esperado YYYY-MM)`);
  }

  const [, monthStr] = value.split("-");
  const month = Number(monthStr);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${fieldName} inválido`);
  }
}

function assertPositiveAmount(amountArs: number) {
  if (!Number.isInteger(amountArs) || amountArs < 1) {
    throw new Error("El monto debe ser un número entero mayor a cero");
  }
}

function assertRequiredText(value: string, fieldName: string) {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} es requerido`);
  }
}

function periodFromDate(date: string) {
  assertDate(date);
  return date.slice(0, 7);
}

function comparePeriods(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function maxPeriod(a: string, b: string) {
  return comparePeriods(a, b) >= 0 ? a : b;
}

function nextPeriod(period: string) {
  assertPeriod(period);
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function dateForPeriodDay(period: string, dayOfMonth: number) {
  assertPeriod(period);
  return `${period}-${String(dayOfMonth).padStart(2, "0")}`;
}

function getPeriodPartsForTimezone(timezone?: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone && timezone.trim() !== "" ? timezone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    period: `${values.year}-${values.month}`,
    dayOfMonth: Number(values.day),
  };
}

function validateRecurringWindow(startPeriod: string, endPeriod?: string) {
  assertPeriod(startPeriod, "Período de inicio");
  if (endPeriod) {
    assertPeriod(endPeriod, "Período de fin");
    if (comparePeriods(endPeriod, startPeriod) < 0) {
      throw new Error("El período de fin debe ser igual o posterior al inicio");
    }
  }
}

function validateRecurringDay(dayOfMonth: number) {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    throw new Error("El día de vencimiento debe ser entre 1 y 28");
  }
}

async function requireAdminMembership(ctx: any) {
  const membership = await requireCurrentOrganizationMembership(ctx);
  await requireAdmin(ctx, membership.organizationId);
  return membership;
}

export const getTransactions = query({
  args: {
    period: v.optional(v.string()),
    type: v.optional(transactionTypeV),
  },
  handler: async (ctx, args) => {
    const membership = await requireAdminMembership(ctx);

    if (args.period) assertPeriod(args.period);

    let transactions: Doc<"financeTransactions">[];
    if (args.period && args.type) {
      transactions = await ctx.db
        .query("financeTransactions")
        .withIndex("by_organization_type_period", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("type", args.type!)
            .eq("period", args.period!),
        )
        .collect();
    } else if (args.period) {
      transactions = await ctx.db
        .query("financeTransactions")
        .withIndex("by_organization_period", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("period", args.period!),
        )
        .collect();
    } else {
      transactions = await ctx.db
        .query("financeTransactions")
        .withIndex("by_organization_period", (q) =>
          q.eq("organizationId", membership.organizationId),
        )
        .collect();
      if (args.type) {
        transactions = transactions.filter(
          (transaction) => transaction.type === args.type,
        );
      }
    }

    return transactions.sort((a, b) => {
      if (a.occurredOn !== b.occurredOn)
        return a.occurredOn < b.occurredOn ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  },
});

export const getSummary = query({
  args: {
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireAdminMembership(ctx);
    const period = args.period ?? getPeriodPartsForTimezone().period;
    assertPeriod(period);

    const [transactions, recurringRules] = await Promise.all([
      ctx.db
        .query("financeTransactions")
        .withIndex("by_organization_period", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("period", period),
        )
        .collect(),
      ctx.db
        .query("financeRecurringRules")
        .withIndex("by_organization_status", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("status", "active"),
        )
        .collect(),
    ]);

    const activeTransactions = transactions.filter(
      (transaction) => transaction.status === "active",
    );
    const incomeArs = activeTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amountArs, 0);
    const expenseArs = activeTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amountArs, 0);

    return {
      period,
      incomeArs,
      expenseArs,
      netResultArs: incomeArs - expenseArs,
      activeRecurringRules: recurringRules.length,
    };
  },
});

export const getRecurringRules = query({
  args: {
    status: recurringStatusV,
  },
  handler: async (ctx, args) => {
    const membership = await requireAdminMembership(ctx);

    const rules = args.status
      ? await ctx.db
          .query("financeRecurringRules")
          .withIndex("by_organization_status", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("financeRecurringRules")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .collect();

    return rules.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.nextDuePeriod !== b.nextDuePeriod) {
        return a.nextDuePeriod < b.nextDuePeriod ? -1 : 1;
      }
      return b.createdAt - a.createdAt;
    });
  },
});

export const createTransaction = mutation({
  args: {
    type: transactionTypeV,
    title: v.string(),
    category: v.string(),
    amountArs: v.number(),
    occurredOn: v.string(),
    paymentMethod: paymentMethodV,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireAdminMembership(ctx);
    validateTransactionFields(args);

    const now = Date.now();
    return await ctx.db.insert("financeTransactions", {
      organizationId: membership.organizationId,
      type: args.type,
      title: args.title.trim(),
      category: args.category.trim(),
      amountArs: args.amountArs,
      occurredOn: args.occurredOn,
      period: periodFromDate(args.occurredOn),
      paymentMethod: args.paymentMethod,
      notes: args.notes?.trim() || undefined,
      source: "manual",
      status: "active",
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTransaction = mutation({
  args: {
    transactionId: v.id("financeTransactions"),
    title: v.optional(v.string()),
    category: v.optional(v.string()),
    amountArs: v.optional(v.number()),
    occurredOn: v.optional(v.string()),
    paymentMethod: paymentMethodV,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireAdminMembership(ctx);
    const transaction = await ctx.db.get(args.transactionId);
    if (
      !transaction ||
      transaction.organizationId !== membership.organizationId
    ) {
      throw new Error("Movimiento no encontrado");
    }
    if (transaction.status === "voided") {
      throw new Error("No se puede editar un movimiento anulado");
    }

    const merged = {
      type: transaction.type,
      title: args.title ?? transaction.title,
      category: args.category ?? transaction.category,
      amountArs: args.amountArs ?? transaction.amountArs,
      occurredOn: args.occurredOn ?? transaction.occurredOn,
    };
    validateTransactionFields(merged);

    const patch: Partial<Doc<"financeTransactions">> = {
      updatedBy: identity.subject,
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.amountArs !== undefined) patch.amountArs = args.amountArs;
    if (args.occurredOn !== undefined) {
      patch.occurredOn = args.occurredOn;
      patch.period = periodFromDate(args.occurredOn);
    }
    if (args.paymentMethod !== undefined)
      patch.paymentMethod = args.paymentMethod;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    await ctx.db.patch(args.transactionId, patch);
  },
});

export const voidTransaction = mutation({
  args: {
    transactionId: v.id("financeTransactions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireAdminMembership(ctx);
    const transaction = await ctx.db.get(args.transactionId);
    if (
      !transaction ||
      transaction.organizationId !== membership.organizationId
    ) {
      throw new Error("Movimiento no encontrado");
    }
    if (transaction.status === "voided") return;

    const now = Date.now();
    await ctx.db.patch(args.transactionId, {
      status: "voided",
      voidedBy: identity.subject,
      voidedAt: now,
      voidReason: args.reason?.trim() || undefined,
      updatedBy: identity.subject,
      updatedAt: now,
    });
  },
});

export const createRecurringRule = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    amountArs: v.number(),
    dayOfMonth: v.number(),
    startPeriod: v.string(),
    endPeriod: v.optional(v.string()),
    paymentMethod: paymentMethodV,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireAdminMembership(ctx);
    validateRecurringFields(args);

    const organization = await ctx.db.get(membership.organizationId);
    const current = getPeriodPartsForTimezone(organization?.timezone);
    const now = Date.now();
    let nextDuePeriod = maxPeriod(args.startPeriod, current.period);

    const ruleId = await ctx.db.insert("financeRecurringRules", {
      organizationId: membership.organizationId,
      type: "expense",
      title: args.title.trim(),
      category: args.category.trim(),
      amountArs: args.amountArs,
      paymentMethod: args.paymentMethod,
      notes: args.notes?.trim() || undefined,
      frequency: "monthly",
      dayOfMonth: args.dayOfMonth,
      startPeriod: args.startPeriod,
      endPeriod: args.endPeriod,
      nextDuePeriod,
      status: "active",
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });

    if (
      comparePeriods(nextDuePeriod, current.period) === 0 &&
      current.dayOfMonth >= args.dayOfMonth &&
      (!args.endPeriod || comparePeriods(current.period, args.endPeriod) <= 0)
    ) {
      await createRecurringTransactionIfMissing(
        ctx,
        ruleId,
        {
          organizationId: membership.organizationId,
          type: "expense",
          title: args.title.trim(),
          category: args.category.trim(),
          amountArs: args.amountArs,
          paymentMethod: args.paymentMethod,
          notes: args.notes?.trim() || undefined,
          dayOfMonth: args.dayOfMonth,
        },
        current.period,
        now,
      );
      nextDuePeriod = nextPeriod(current.period);
      await ctx.db.patch(ruleId, { nextDuePeriod, updatedAt: now });
    }

    return ruleId;
  },
});

export const updateRecurringRule = mutation({
  args: {
    ruleId: v.id("financeRecurringRules"),
    title: v.optional(v.string()),
    category: v.optional(v.string()),
    amountArs: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    endPeriod: v.optional(v.string()),
    paymentMethod: paymentMethodV,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireAdminMembership(ctx);
    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.organizationId !== membership.organizationId) {
      throw new Error("Recurrente no encontrado");
    }
    if (rule.status === "cancelled") {
      throw new Error("No se puede editar un recurrente cancelado");
    }

    validateRecurringFields({
      title: args.title ?? rule.title,
      category: args.category ?? rule.category,
      amountArs: args.amountArs ?? rule.amountArs,
      dayOfMonth: args.dayOfMonth ?? rule.dayOfMonth,
      startPeriod: rule.startPeriod,
      endPeriod: args.endPeriod ?? rule.endPeriod,
    });

    const patch: Partial<Doc<"financeRecurringRules">> = {
      updatedBy: identity.subject,
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.amountArs !== undefined) patch.amountArs = args.amountArs;
    if (args.dayOfMonth !== undefined) patch.dayOfMonth = args.dayOfMonth;
    if (args.endPeriod !== undefined) patch.endPeriod = args.endPeriod;
    if (args.paymentMethod !== undefined)
      patch.paymentMethod = args.paymentMethod;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;

    await ctx.db.patch(args.ruleId, patch);
  },
});

export const pauseRecurringRule = mutation({
  args: { ruleId: v.id("financeRecurringRules") },
  handler: async (ctx, args) => {
    await patchRecurringStatus(ctx, args.ruleId, "paused");
  },
});

export const resumeRecurringRule = mutation({
  args: { ruleId: v.id("financeRecurringRules") },
  handler: async (ctx, args) => {
    await patchRecurringStatus(ctx, args.ruleId, "active");
  },
});

export const cancelRecurringRule = mutation({
  args: { ruleId: v.id("financeRecurringRules") },
  handler: async (ctx, args) => {
    await patchRecurringStatus(ctx, args.ruleId, "cancelled");
  },
});

export const generateRecurringTransactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rules = await ctx.db
      .query("financeRecurringRules")
      .withIndex("by_status_nextDuePeriod", (q) => q.eq("status", "active"))
      .collect();

    let generatedCount = 0;
    const now = Date.now();

    for (const rule of rules) {
      const organization = await ctx.db.get(rule.organizationId);
      const current = getPeriodPartsForTimezone(organization?.timezone);
      let nextDuePeriod = rule.nextDuePeriod;

      while (comparePeriods(nextDuePeriod, current.period) <= 0) {
        if (
          rule.endPeriod &&
          comparePeriods(nextDuePeriod, rule.endPeriod) > 0
        ) {
          await ctx.db.patch(rule._id, { nextDuePeriod, updatedAt: now });
          break;
        }

        const isCurrentPeriod = nextDuePeriod === current.period;
        if (isCurrentPeriod && current.dayOfMonth < rule.dayOfMonth) {
          break;
        }

        const inserted = await createRecurringTransactionIfMissing(
          ctx,
          rule._id,
          rule,
          nextDuePeriod,
          now,
        );
        if (inserted) generatedCount += 1;
        nextDuePeriod = nextPeriod(nextDuePeriod);
      }

      if (nextDuePeriod !== rule.nextDuePeriod) {
        await ctx.db.patch(rule._id, {
          nextDuePeriod,
          updatedAt: now,
        });
      }
    }

    return { generatedCount };
  },
});

function validateTransactionFields(fields: {
  type: "income" | "expense";
  title: string;
  category: string;
  amountArs: number;
  occurredOn: string;
}) {
  if (fields.type !== "income" && fields.type !== "expense") {
    throw new Error("Tipo inválido");
  }
  assertRequiredText(fields.title, "El título");
  assertRequiredText(fields.category, "La categoría");
  assertPositiveAmount(fields.amountArs);
  assertDate(fields.occurredOn);
}

function validateRecurringFields(fields: {
  title: string;
  category: string;
  amountArs: number;
  dayOfMonth: number;
  startPeriod: string;
  endPeriod?: string;
}) {
  assertRequiredText(fields.title, "El título");
  assertRequiredText(fields.category, "La categoría");
  assertPositiveAmount(fields.amountArs);
  validateRecurringDay(fields.dayOfMonth);
  validateRecurringWindow(fields.startPeriod, fields.endPeriod);
}

async function patchRecurringStatus(
  ctx: any,
  ruleId: Id<"financeRecurringRules">,
  status: "active" | "paused" | "cancelled",
) {
  const identity = await requireAuth(ctx);
  const membership = await requireAdminMembership(ctx);
  const rule = await ctx.db.get(ruleId);
  if (!rule || rule.organizationId !== membership.organizationId) {
    throw new Error("Recurrente no encontrado");
  }
  if (rule.status === "cancelled" && status !== "cancelled") {
    throw new Error("No se puede reactivar un recurrente cancelado");
  }

  await ctx.db.patch(ruleId, {
    status,
    updatedBy: identity.subject,
    updatedAt: Date.now(),
  });
}

async function createRecurringTransactionIfMissing(
  ctx: any,
  recurringRuleId: Id<"financeRecurringRules">,
  rule: {
    organizationId: Id<"organizations">;
    type: "expense";
    title: string;
    category: string;
    amountArs: number;
    paymentMethod?: "cash" | "bank_transfer" | "card" | "other";
    notes?: string;
    dayOfMonth: number;
  },
  period: string,
  now: number,
) {
  const existing = await ctx.db
    .query("financeTransactions")
    .withIndex("by_recurring_period", (q: any) =>
      q.eq("recurringRuleId", recurringRuleId).eq("period", period),
    )
    .first();
  if (existing) return false;

  await ctx.db.insert("financeTransactions", {
    organizationId: rule.organizationId,
    type: "expense",
    title: rule.title,
    category: rule.category,
    amountArs: rule.amountArs,
    occurredOn: dateForPeriodDay(period, rule.dayOfMonth),
    period,
    paymentMethod: rule.paymentMethod,
    notes: rule.notes,
    source: "recurring",
    recurringRuleId,
    status: "active",
    createdBy: "system",
    createdAt: now,
    updatedAt: now,
  });

  return true;
}
