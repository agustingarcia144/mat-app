import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  isStaffRole,
  requireAdmin,
  requireAuth,
  requireCurrentOrganizationMembership,
} from "./permissions";

const HOUR_MS = 60 * 60 * 1000;
const PAYROLL_EXPENSE_CATEGORY = "Empleados";

const MONTH_LABELS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const label = MONTH_LABELS_ES[(month ?? 1) - 1] ?? "";
  return `${label} ${year}`;
}

type PayrollStatus = "pending" | "partial" | "paid";

function statusFor(total: number, paid: number): PayrollStatus {
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partial";
}

/** Sum scheduled shift hours and count in-charge classes for one staff member. */
function computeUsage(
  shifts: Array<{
    userId: string;
    status: string;
    startTime: number;
    endTime: number;
  }>,
  schedules: Array<{ status: string; inChargeUserId?: string }>,
  userId: string,
) {
  let hours = 0;
  for (const shift of shifts) {
    if (shift.userId !== userId || shift.status !== "scheduled") continue;
    hours += Math.max(0, shift.endTime - shift.startTime) / HOUR_MS;
  }
  let classesInCharge = 0;
  for (const schedule of schedules) {
    if (schedule.status === "cancelled") continue;
    if (schedule.inChargeUserId === userId) classesInCharge += 1;
  }
  return { hours, classesInCharge };
}

/**
 * Base pay (hours/classes or fixed monthly) plus the commission earned on what
 * the staff member's assigned members paid during the period.
 */
function computeTotal(
  membership: {
    payrollType?: "hourly" | "monthly";
    pricePerHour?: number;
    pricePerClass?: number;
    pricePerMonth?: number;
    commissionPercentage?: number;
  },
  hours: number,
  classesInCharge: number,
  commissionBase: number,
) {
  const payrollType = membership.payrollType ?? "hourly";
  const baseTotal =
    payrollType === "monthly"
      ? (membership.pricePerMonth ?? 0)
      : hours * (membership.pricePerHour ?? 0) +
        classesInCharge * (membership.pricePerClass ?? 0);
  const commissionPercentage = membership.commissionPercentage ?? 0;
  const commissionAmount = commissionBase * (commissionPercentage / 100);
  return {
    baseTotal,
    commissionBase,
    commissionAmount,
    total: baseTotal + commissionAmount,
  };
}

type CommissionItem = {
  memberUserId: string;
  planId: Id<"membershipPlans">;
  amountArs: number;
  paidAt: number;
};

/**
 * Commission base per staff member for a period.
 *
 * A member is tied to a staff member through `responsibleUserId`. Every plan
 * payment approved inside the period counts toward the responsible staff
 * member's base, using the amount actually collected (interest included).
 *
 * Zero-amount payments are skipped: a full bonification is recorded as an
 * approved $0 payment, so no money came in. A partial bonification keeps the
 * discounted amount the member did pay, and counts for that amount.
 */
function computeCommissions(
  payments: Array<{
    userId: string;
    planId: Id<"membershipPlans">;
    status: string;
    amountArs: number;
    totalAmountArs?: number;
    reviewedAt?: number;
    createdAt: number;
  }>,
  memberships: Array<{
    role: string;
    userId: string;
    responsibleUserId?: string;
  }>,
  startDate: number,
  endDate: number,
) {
  const responsibleByMember = new Map<string, string>();
  for (const m of memberships) {
    if (m.role !== "member" || !m.responsibleUserId) continue;
    responsibleByMember.set(m.userId, m.responsibleUserId);
  }

  const byStaff = new Map<string, { base: number; items: CommissionItem[] }>();
  for (const payment of payments) {
    if (payment.status !== "approved") continue;
    // Legacy approved rows may predate reviewedAt.
    const paidAt = payment.reviewedAt ?? payment.createdAt;
    if (paidAt < startDate || paidAt > endDate) continue;

    const staffUserId = responsibleByMember.get(payment.userId);
    if (!staffUserId) continue;

    const amountArs = payment.totalAmountArs ?? payment.amountArs;
    if (amountArs <= 0) continue;
    const entry = byStaff.get(staffUserId) ?? { base: 0, items: [] };
    entry.base += amountArs;
    entry.items.push({
      memberUserId: payment.userId,
      planId: payment.planId,
      amountArs,
      paidAt,
    });
    byStaff.set(staffUserId, entry);
  }

  return byStaff;
}

/** Approved plan payments for the organization (filtered by date downstream). */
async function loadApprovedPlanPayments(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("planPayments")
    .withIndex("by_organization_status", (q) =>
      q.eq("organizationId", organizationId).eq("status", "approved"),
    )
    .collect();
}

/**
 * Per-employee payroll summary for a period (admin only).
 *
 * Each row reports the computed total plus how much has been paid so far and
 * the derived status (pending / partial / paid).
 */
export const getPayrollSummary = query({
  args: {
    period: v.string(), // "YYYY-MM"
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdmin(ctx, organizationId);

    // All memberships: staff rows are limited to active ones below, but a member
    // who went inactive after paying still earned a commission for the period.
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    const staffMemberships = memberships.filter(
      (m) => m.status === "active" && isStaffRole(m.role),
    );

    const shifts = await ctx.db
      .query("staffShifts")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate),
      )
      .collect();

    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate),
      )
      .collect();

    // Payments for the period, summed by user.
    const payments = await ctx.db
      .query("staffPayrollPayments")
      .withIndex("by_organization_period", (q) =>
        q.eq("organizationId", organizationId).eq("period", args.period),
      )
      .collect();
    const paidByUser = new Map<string, number>();
    for (const payment of payments) {
      paidByUser.set(
        payment.userId,
        (paidByUser.get(payment.userId) ?? 0) + payment.amountArs,
      );
    }

    const commissions = computeCommissions(
      await loadApprovedPlanPayments(ctx, organizationId),
      memberships,
      args.startDate,
      args.endDate,
    );

    const rows = await Promise.all(
      staffMemberships.map(async (m) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_externalId", (q) => q.eq("externalId", m.userId))
          .first();

        const name =
          user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.email ||
          m.userId;

        const { hours, classesInCharge } = computeUsage(
          shifts,
          schedules,
          m.userId,
        );
        const payrollType = m.payrollType ?? "hourly";
        const { baseTotal, commissionBase, commissionAmount, total } =
          computeTotal(
            m,
            hours,
            classesInCharge,
            commissions.get(m.userId)?.base ?? 0,
          );
        const paidAmount = paidByUser.get(m.userId) ?? 0;

        return {
          userId: m.userId,
          name,
          email: user?.email,
          imageUrl: user?.imageUrl,
          role: m.role,
          payrollType,
          pricePerHour: m.pricePerHour,
          pricePerClass: m.pricePerClass,
          pricePerMonth: m.pricePerMonth,
          commissionPercentage: m.commissionPercentage,
          hours,
          classesInCharge,
          baseTotal,
          commissionBase,
          commissionAmount,
          total,
          paidAmount,
          remaining: Math.max(0, total - paidAmount),
          status: statusFor(total, paidAmount),
        };
      }),
    );

    rows.sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );

    return rows;
  },
});

/** Individual payments recorded for a staff member in a period (admin only). */
export const getPeriodPayments = query({
  args: {
    userId: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdmin(ctx, organizationId);

    const payments = await ctx.db
      .query("staffPayrollPayments")
      .withIndex("by_organization_user_period", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("userId", args.userId)
          .eq("period", args.period),
      )
      .collect();

    return payments
      .sort((a, b) => a.paidAt - b.paidAt)
      .map((p) => ({
        _id: p._id,
        amountArs: p.amountArs,
        paidAt: p.paidAt,
        occurredOn: p.occurredOn,
        paymentMethod: p.paymentMethod,
        transactionId: p.transactionId,
      }));
  },
});

/**
 * Breakdown of the commission a staff member earned in a period (admin only):
 * one row per approved plan payment made by a member they are responsible for.
 */
export const getCommissionDetail = query({
  args: {
    userId: v.string(),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = membership.organizationId;
    await requireAdmin(ctx, organizationId);

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    const targetMembership = memberships.find((m) => m.userId === args.userId);
    const commissionPercentage = targetMembership?.commissionPercentage ?? 0;

    const entry = computeCommissions(
      await loadApprovedPlanPayments(ctx, organizationId),
      memberships,
      args.startDate,
      args.endDate,
    ).get(args.userId);

    if (!entry) {
      return { commissionPercentage, base: 0, commissionAmount: 0, items: [] };
    }

    const planNames = new Map<Id<"membershipPlans">, string>();
    const memberNames = new Map<string, string>();

    const items = await Promise.all(
      entry.items.map(async (item) => {
        if (!planNames.has(item.planId)) {
          const plan = await ctx.db.get(item.planId);
          planNames.set(item.planId, plan?.name ?? "Plan");
        }
        if (!memberNames.has(item.memberUserId)) {
          const user = await ctx.db
            .query("users")
            .withIndex("by_externalId", (q) =>
              q.eq("externalId", item.memberUserId),
            )
            .first();
          memberNames.set(
            item.memberUserId,
            user?.fullName ||
              [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
              user?.email ||
              item.memberUserId,
          );
        }

        return {
          memberUserId: item.memberUserId,
          memberName: memberNames.get(item.memberUserId)!,
          planName: planNames.get(item.planId)!,
          amountArs: item.amountArs,
          commissionAmount: item.amountArs * (commissionPercentage / 100),
          paidAt: item.paidAt,
        };
      }),
    );

    items.sort((a, b) => b.paidAt - a.paidAt);

    return {
      commissionPercentage,
      base: entry.base,
      commissionAmount: entry.base * (commissionPercentage / 100),
      items,
    };
  },
});

/**
 * The caller's own commission for a period (defaults to the current month).
 *
 * Self-scoped counterpart of `getCommissionDetail`, which is admin only: any
 * staff member can see what their assigned members brought in. Returns `null`
 * when the caller has no commission configured, so the dashboard card can be
 * hidden entirely.
 */
export const getMyCommissionSummary = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (!isStaffRole(membership.role)) return null;

    const now = new Date();
    const startDate =
      args.startDate ?? new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endDate =
      args.endDate ??
      new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;

    const organizationId = membership.organizationId;

    const [memberships, payments] = await Promise.all([
      ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
      loadApprovedPlanPayments(ctx, organizationId),
    ]);

    // Read from the stored membership: super admins get a synthetic one that
    // carries no compensation fields.
    const commissionPercentage =
      memberships.find((m) => m.userId === membership.userId)
        ?.commissionPercentage ?? 0;
    if (commissionPercentage <= 0) return null;

    const entry = computeCommissions(
      payments,
      memberships,
      startDate,
      endDate,
    ).get(membership.userId);

    const base = entry?.base ?? 0;
    const assignedMemberCount = memberships.filter(
      (m) =>
        m.role === "member" &&
        m.status === "active" &&
        m.responsibleUserId === membership.userId,
    ).length;

    const startAt = new Date(startDate);
    const period = `${startAt.getFullYear()}-${String(startAt.getMonth() + 1).padStart(2, "0")}`;

    return {
      commissionPercentage,
      base,
      commissionAmount: base * (commissionPercentage / 100),
      assignedMemberCount,
      periodLabel: periodLabel(period),
    };
  },
});

/**
 * Register a payment (full or partial) toward a staff member's payroll for a
 * period (admin only). Creates a finance expense in the "Empleados" category
 * and a payment record. The amount cannot exceed what is still pending.
 */
export const registerPayment = mutation({
  args: {
    userId: v.string(),
    period: v.string(), // "YYYY-MM"
    startDate: v.number(),
    endDate: v.number(),
    occurredOn: v.string(), // "YYYY-MM-DD" (payment date, local)
    amountArs: v.number(),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("card"),
        v.literal("other"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    await requireAdmin(ctx, organizationId);

    if (!/^\d{4}-\d{2}$/.test(args.period)) {
      throw new Error("Período inválido");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.occurredOn)) {
      throw new Error("Fecha de pago inválida");
    }
    if (!Number.isInteger(args.amountArs) || args.amountArs < 1) {
      throw new Error("El monto debe ser un número entero mayor a cero.");
    }

    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", organizationId).eq("userId", args.userId),
      )
      .first();
    if (!targetMembership || !isStaffRole(targetMembership.role)) {
      throw new Error("El usuario no es personal de la organización");
    }

    const shifts = await ctx.db
      .query("staffShifts")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate),
      )
      .collect();
    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_organization_time", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("startTime", args.startDate)
          .lte("startTime", args.endDate),
      )
      .collect();

    const { hours, classesInCharge } = computeUsage(
      shifts,
      schedules,
      args.userId,
    );

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    const commissionBase =
      computeCommissions(
        await loadApprovedPlanPayments(ctx, organizationId),
        memberships,
        args.startDate,
        args.endDate,
      ).get(args.userId)?.base ?? 0;

    const payrollType = targetMembership.payrollType ?? "hourly";
    const total = Math.round(
      computeTotal(targetMembership, hours, classesInCharge, commissionBase)
        .total,
    );

    const existingPayments = await ctx.db
      .query("staffPayrollPayments")
      .withIndex("by_organization_user_period", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("userId", args.userId)
          .eq("period", args.period),
      )
      .collect();
    const alreadyPaid = existingPayments.reduce(
      (acc, p) => acc + p.amountArs,
      0,
    );
    const remaining = total - alreadyPaid;

    if (remaining <= 0) {
      throw new Error("Este sueldo ya está pagado por completo.");
    }
    if (args.amountArs > remaining) {
      throw new Error(
        `El monto supera lo pendiente (${remaining.toLocaleString("es-AR")}).`,
      );
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.userId))
      .first();
    const name =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.email ||
      args.userId;

    const isPartial = args.amountArs < remaining || alreadyPaid > 0;
    const now = Date.now();

    // Create the finance expense.
    const transactionId = await ctx.db.insert("financeTransactions", {
      organizationId,
      type: "expense",
      title: `Sueldo ${name} — ${periodLabel(args.period)}`,
      category: PAYROLL_EXPENSE_CATEGORY,
      amountArs: args.amountArs,
      occurredOn: args.occurredOn,
      period: args.occurredOn.slice(0, 7),
      paymentMethod: args.paymentMethod,
      notes: isPartial
        ? `Pago parcial de sueldos ${periodLabel(args.period)}.`
        : `Liquidación de sueldos ${periodLabel(args.period)}.`,
      source: "manual",
      status: "active",
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("staffPayrollPayments", {
      organizationId,
      userId: args.userId,
      period: args.period,
      payrollType,
      hours,
      classesInCharge,
      commissionPercentage: targetMembership.commissionPercentage,
      commissionBaseArs: commissionBase,
      amountArs: args.amountArs,
      occurredOn: args.occurredOn,
      paymentMethod: args.paymentMethod,
      transactionId,
      paidBy: identity.subject,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { amountArs: args.amountArs, remaining: remaining - args.amountArs };
  },
});

/**
 * Void a single payroll payment (admin only): voids the linked finance expense
 * and removes the payment record.
 */
export const voidPayment = mutation({
  args: {
    paymentId: v.id("staffPayrollPayments"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const currentMembership = await requireCurrentOrganizationMembership(ctx);
    const organizationId = currentMembership.organizationId;
    await requireAdmin(ctx, organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== organizationId) {
      throw new Error("Pago no encontrado");
    }

    const transaction: {
      organizationId: Id<"organizations">;
      status: string;
    } | null = await ctx.db.get(payment.transactionId);
    if (
      transaction &&
      transaction.organizationId === organizationId &&
      transaction.status !== "voided"
    ) {
      const now = Date.now();
      await ctx.db.patch(payment.transactionId, {
        status: "voided",
        voidedBy: identity.subject,
        voidedAt: now,
        voidReason: "Pago de sueldo anulado",
        updatedAt: now,
      });
    }

    await ctx.db.delete(payment._id);

    return { voided: true };
  },
});
