/**
 * MAT's commission on member payments: monthly settlement and reporting.
 *
 * The per-transaction ledger is written when a charge is approved
 * (`memberPayments.ts`). This module turns those immutable entries into one
 * monthly figure per gym, and never edits an entry's money — settling only
 * marks entries as collected and stamps them with the settlement they belong
 * to.
 *
 * Deliberately separate from `organizationBillingPayments`, which records what
 * a gym pays MAT for the platform itself. Mixing member commission into that
 * ledger would make both unreadable.
 */

import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireSuperAdmin } from "./permissions";
import {
  addMonths,
  formatBillingPeriod,
  getPaymentTimezone,
  getZonedDateParts,
} from "./billingDomain";

/**
 * Stable reference for one gym's commission in one month.
 *
 * Deterministic on purpose: re-running settlement produces the same reference,
 * which is what makes a second run a no-op rather than a second invoice.
 */
export function buildSettlementReference(
  organizationId: string,
  settlementPeriod: string,
): string {
  return `mat_fee_${organizationId}_${settlementPeriod}`;
}

/** The month before the one containing `now`, in the given timezone. */
export function previousBillingPeriod(now: number, timezone: string): string {
  const parts = getZonedDateParts(now, timezone);
  const previous = addMonths(parts.year, parts.month, -1);
  return formatBillingPeriod(previous.year, previous.month);
}

/** Whether a ledger entry belongs to the given settlement period. */
function entryPeriod(entry: Doc<"platformCommissionLedger">, timezone: string) {
  const parts = getZonedDateParts(entry.createdAt, timezone);
  return formatBillingPeriod(parts.year, parts.month);
}

/**
 * Aggregate one month of accrued commission per gym and mark it collected.
 *
 * Idempotent by construction: only entries still in `accrued` are touched, so
 * a second run over the same month finds nothing to do and cannot invoice a
 * gym twice. Refund reversals are negative entries in the month they were
 * raised, so a settlement is a net figure rather than a gross one.
 *
 * Only closed months are settled. Settling the month in progress would invoice
 * a figure that keeps changing.
 */
export const settleMonthlyCommissions = internalMutation({
  args: {
    /** "YYYY-MM". Defaults to the month before the current one. */
    settlementPeriod: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const organizations = await ctx.db.query("organizations").take(
      args.limit ?? 200,
    );

    const settlements: Array<{
      organizationId: Id<"organizations">;
      settlementPeriod: string;
      settlementReference: string;
      feeAmountArs: number;
      entryCount: number;
    }> = [];

    for (const organization of organizations) {
      const timezone = getPaymentTimezone(organization.timezone);
      const settlementPeriod =
        args.settlementPeriod ?? previousBillingPeriod(now, timezone);
      const currentPeriod = (() => {
        const parts = getZonedDateParts(now, timezone);
        return formatBillingPeriod(parts.year, parts.month);
      })();

      // Never settle a month that is still accumulating charges.
      if (settlementPeriod >= currentPeriod) continue;

      const entries = await ctx.db
        .query("platformCommissionLedger")
        .withIndex("by_organization_created", (q) =>
          q.eq("organizationId", organization._id),
        )
        .collect();

      const due = entries.filter(
        (entry) =>
          entry.status === "accrued" &&
          entryPeriod(entry, timezone) === settlementPeriod,
      );
      if (due.length === 0) continue;

      const settlementReference = buildSettlementReference(
        String(organization._id),
        settlementPeriod,
      );
      const feeAmountArs = due.reduce(
        (total, entry) => total + entry.feeAmountArs,
        0,
      );

      for (const entry of due) {
        await ctx.db.patch(entry._id, {
          status: "collected",
          settlementReference,
          settlementPeriod,
          collectedAt: now,
          updatedAt: now,
        });
      }

      settlements.push({
        organizationId: organization._id,
        settlementPeriod,
        settlementReference,
        feeAmountArs,
        entryCount: due.length,
      });
    }

    return {
      settledOrganizations: settlements.length,
      totalFeeArs: settlements.reduce(
        (total, settlement) => total + settlement.feeAmountArs,
        0,
      ),
      settlements,
    };
  },
});

/**
 * What MAT has accrued and collected per gym, for a super admin to invoice
 * against and to reconcile with Mercado Pago's own reports.
 */
export const listSettlements = query({
  args: { settlementPeriod: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const entries = await ctx.db.query("platformCommissionLedger").collect();
    const organizations = new Map(
      (await ctx.db.query("organizations").collect()).map((organization) => [
        organization._id,
        organization,
      ]),
    );

    const byKey = new Map<
      string,
      {
        organizationId: Id<"organizations">;
        organizationName: string;
        settlementPeriod: string | null;
        settlementReference: string | null;
        status: "accrued" | "collected";
        grossAmountArs: number;
        feeAmountArs: number;
        entryCount: number;
      }
    >();

    for (const entry of entries) {
      if (entry.status === "not_applicable") continue;
      if (entry.status !== "accrued" && entry.status !== "collected") continue;

      const organization = organizations.get(entry.organizationId);
      const timezone = getPaymentTimezone(organization?.timezone);
      const period =
        entry.settlementPeriod ?? entryPeriod(entry, timezone);

      if (args.settlementPeriod && period !== args.settlementPeriod) continue;

      const key = `${entry.organizationId}:${period}:${entry.status}`;
      const existing = byKey.get(key) ?? {
        organizationId: entry.organizationId,
        organizationName: organization?.name ?? "Organización eliminada",
        settlementPeriod: period,
        settlementReference: entry.settlementReference ?? null,
        status: entry.status,
        grossAmountArs: 0,
        feeAmountArs: 0,
        entryCount: 0,
      };

      existing.grossAmountArs += entry.grossAmountArs;
      existing.feeAmountArs += entry.feeAmountArs;
      existing.entryCount += 1;
      byKey.set(key, existing);
    }

    return [...byKey.values()].sort((a, b) =>
      (b.settlementPeriod ?? "").localeCompare(a.settlementPeriod ?? ""),
    );
  },
});
