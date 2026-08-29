import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildJoinDateCycle,
  clampAnchorDay,
  computeAdvanceTotalArs,
  computeBonifiedPricePerMember,
  computeCancellationAccessEndsAt,
  computeCommissionArs,
  computeEffectiveCycleAmountArs,
  computeGraceUntil,
  computeGymNetArs,
  computeInterest,
  DAY_MS,
  daysInMonth,
  DEFAULT_PAYMENT_TIMEZONE,
  formatBillingPeriod,
  getAdvanceBillingCycles,
  getBillingCycle,
  getDaysAfterPaymentWindow,
  getFirstJoinDateBillingDueAt,
  getPaymentTimezone,
  getZonedDateParts,
  splitAmountAcrossCycles,
} from "./billingDomain";

const ART = DEFAULT_PAYMENT_TIMEZONE;

/** Civil date at midnight UTC — the convention cycle boundaries are stored in. */
const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);

/** An instant at 15:00 UTC (12:00 in ART) on the given civil date. */
const middayUtc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day, 15, 0, 0);

describe("calendar helpers", () => {
  it("resolves days in month including leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it("adds months across year boundaries in both directions", () => {
    expect(addMonths(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
    expect(addMonths(2025, 1, -1)).toEqual({ year: 2024, month: 12 });
    expect(addMonths(2025, 6, 12)).toEqual({ year: 2026, month: 6 });
  });

  it("clamps an anchor day to short months", () => {
    expect(clampAnchorDay(31, 2025, 2)).toBe(28);
    expect(clampAnchorDay(31, 2024, 2)).toBe(29);
    expect(clampAnchorDay(31, 2025, 4)).toBe(30);
    expect(clampAnchorDay(31, 2025, 5)).toBe(31);
    expect(clampAnchorDay(15, 2025, 2)).toBe(15);
  });

  it("formats billing periods with a padded month", () => {
    expect(formatBillingPeriod(2025, 3)).toBe("2025-03");
    expect(formatBillingPeriod(2025, 11)).toBe("2025-11");
  });

  it("falls back to the default timezone for blank values", () => {
    expect(getPaymentTimezone(undefined)).toBe(DEFAULT_PAYMENT_TIMEZONE);
    expect(getPaymentTimezone("   ")).toBe(DEFAULT_PAYMENT_TIMEZONE);
    expect(getPaymentTimezone(" UTC ")).toBe("UTC");
  });
});

describe("getZonedDateParts", () => {
  it("resolves the local civil date, not the UTC one", () => {
    // 2025-03-02T01:30:00Z is still 2025-03-01 in Buenos Aires (UTC-3).
    const instant = Date.UTC(2025, 2, 2, 1, 30, 0);
    expect(getZonedDateParts(instant, ART)).toEqual({
      year: 2025,
      month: 3,
      day: 1,
    });
    expect(getZonedDateParts(instant, "UTC")).toEqual({
      year: 2025,
      month: 3,
      day: 2,
    });
  });
});

describe("getBillingCycle — calendar plans", () => {
  const plan = { billingMode: "calendar" as const, paymentWindowEndDay: 10 };

  it("uses natural month boundaries and the configured due day", () => {
    const cycle = getBillingCycle(plan, middayUtc(2024, 5, 3), middayUtc(2025, 3, 20), ART);
    expect(cycle).toEqual({
      billingPeriod: "2025-03",
      cycleStartAt: utc(2025, 3, 1),
      cycleEndAt: utc(2025, 4, 1),
      dueAt: utc(2025, 3, 10),
    });
  });

  it("defaults the due day to 28 when the plan has no window end", () => {
    const cycle = getBillingCycle({}, middayUtc(2024, 5, 3), middayUtc(2025, 2, 20), ART);
    expect(cycle.dueAt).toBe(utc(2025, 2, 28));
    expect(cycle.cycleEndAt).toBe(utc(2025, 3, 1));
  });

  it("attributes a late-night UTC instant to the previous local month", () => {
    // 2025-04-01T01:00:00Z is 2025-03-31 in ART, so it still bills March.
    const cycle = getBillingCycle(plan, middayUtc(2024, 5, 3), Date.UTC(2025, 3, 1, 1, 0, 0), ART);
    expect(cycle.billingPeriod).toBe("2025-03");
  });
});

describe("getBillingCycle — join_date plans", () => {
  const plan = { billingMode: "join_date" as const };

  it("anchors the cycle on the activation day", () => {
    const activatedAt = middayUtc(2025, 1, 10);
    const cycle = getBillingCycle(plan, activatedAt, middayUtc(2025, 3, 15), ART);
    expect(cycle).toEqual({
      billingPeriod: "2025-03",
      cycleStartAt: utc(2025, 3, 10),
      cycleEndAt: utc(2025, 4, 10),
      dueAt: utc(2025, 3, 10),
    });
  });

  it("rolls back to the previous cycle before the anchor day", () => {
    const activatedAt = middayUtc(2025, 1, 20);
    const cycle = getBillingCycle(plan, activatedAt, middayUtc(2025, 3, 5), ART);
    expect(cycle.billingPeriod).toBe("2025-02");
    expect(cycle.cycleStartAt).toBe(utc(2025, 2, 20));
    expect(cycle.cycleEndAt).toBe(utc(2025, 3, 20));
  });

  it("clamps a 31st anchor into February and back out again", () => {
    const activatedAt = middayUtc(2024, 12, 31);
    // February 2025 has 28 days: the cycle runs 28 Feb -> 31 Mar.
    const february = getBillingCycle(plan, activatedAt, middayUtc(2025, 2, 28), ART);
    expect(february.cycleStartAt).toBe(utc(2025, 2, 28));
    expect(february.cycleEndAt).toBe(utc(2025, 3, 31));

    // March is long again, so the anchor returns to the 31st.
    const march = getBillingCycle(plan, activatedAt, middayUtc(2025, 3, 31), ART);
    expect(march.cycleStartAt).toBe(utc(2025, 3, 31));
    expect(march.cycleEndAt).toBe(utc(2025, 4, 30));
  });

  it("clamps a 29th anchor in a non-leap February", () => {
    const activatedAt = middayUtc(2024, 2, 29);
    const cycle = getBillingCycle(plan, activatedAt, middayUtc(2025, 2, 28), ART);
    expect(cycle.cycleStartAt).toBe(utc(2025, 2, 28));
    expect(cycle.cycleEndAt).toBe(utc(2025, 3, 29));
  });

  it("keeps a 29th anchor intact in a leap February", () => {
    const activatedAt = middayUtc(2023, 3, 29);
    const cycle = getBillingCycle(plan, activatedAt, middayUtc(2024, 2, 29), ART);
    expect(cycle.cycleStartAt).toBe(utc(2024, 2, 29));
    expect(cycle.cycleEndAt).toBe(utc(2024, 3, 29));
  });

  it("bills the cycle start, not the calendar window end", () => {
    const activatedAt = middayUtc(2025, 1, 10);
    const cycle = getBillingCycle(
      { billingMode: "join_date", paymentWindowEndDay: 28 },
      activatedAt,
      middayUtc(2025, 3, 15),
      ART,
    );
    expect(cycle.dueAt).toBe(cycle.cycleStartAt);
  });
});

describe("getFirstJoinDateBillingDueAt", () => {
  it("is one anchored month after activation", () => {
    expect(getFirstJoinDateBillingDueAt(middayUtc(2025, 1, 10), ART)).toBe(
      utc(2025, 2, 10),
    );
  });

  it("clamps into a shorter next month", () => {
    expect(getFirstJoinDateBillingDueAt(middayUtc(2025, 1, 31), ART)).toBe(
      utc(2025, 2, 28),
    );
    expect(getFirstJoinDateBillingDueAt(middayUtc(2024, 1, 31), ART)).toBe(
      utc(2024, 2, 29),
    );
  });

  it("crosses the year boundary", () => {
    expect(getFirstJoinDateBillingDueAt(middayUtc(2025, 12, 15), ART)).toBe(
      utc(2026, 1, 15),
    );
  });
});

describe("getAdvanceBillingCycles", () => {
  it("produces consecutive calendar cycles with no gaps or overlaps", () => {
    const cycles = getAdvanceBillingCycles(
      { billingMode: "calendar", paymentWindowEndDay: 10 },
      middayUtc(2024, 5, 3),
      middayUtc(2025, 11, 5),
      3,
      ART,
    );
    expect(cycles.map((c) => c.billingPeriod)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    for (let i = 1; i < cycles.length; i += 1) {
      expect(cycles[i]!.cycleStartAt).toBe(cycles[i - 1]!.cycleEndAt);
    }
  });

  it("produces anchored cycles for join-date plans", () => {
    const cycles = getAdvanceBillingCycles(
      { billingMode: "join_date" },
      middayUtc(2024, 12, 31),
      middayUtc(2025, 1, 31),
      3,
      ART,
    );
    expect(cycles.map((c) => c.cycleStartAt)).toEqual([
      utc(2025, 1, 31),
      utc(2025, 2, 28),
      utc(2025, 3, 31),
    ]);
    // Coverage is contiguous: each cycle starts exactly where the last ended.
    for (let i = 1; i < cycles.length; i += 1) {
      expect(cycles[i]!.cycleStartAt).toBe(cycles[i - 1]!.cycleEndAt);
    }
    expect(cycles.at(-1)!.cycleEndAt).toBe(utc(2025, 4, 30));
  });

  it("covers 6 and 12 anchored months without duplicate periods", () => {
    for (const months of [6, 12]) {
      const cycles = getAdvanceBillingCycles(
        { billingMode: "join_date" },
        middayUtc(2025, 3, 15),
        middayUtc(2025, 3, 20),
        months,
        ART,
      );
      expect(cycles).toHaveLength(months);
      expect(new Set(cycles.map((c) => c.billingPeriod)).size).toBe(months);
    }
  });

  it("returns nothing for a non-positive month count", () => {
    expect(
      getAdvanceBillingCycles({}, middayUtc(2025, 1, 1), middayUtc(2025, 1, 1), 0, ART),
    ).toEqual([]);
  });
});

describe("getDaysAfterPaymentWindow", () => {
  it("is zero while the window is open", () => {
    expect(
      getDaysAfterPaymentWindow("2025-03", 10, middayUtc(2025, 3, 5), ART),
    ).toBe(0);
    expect(
      getDaysAfterPaymentWindow("2025-03", 10, middayUtc(2025, 3, 10), ART),
    ).toBe(0);
  });

  it("counts whole local days after the window closed", () => {
    expect(
      getDaysAfterPaymentWindow("2025-03", 10, middayUtc(2025, 3, 15), ART),
    ).toBe(5);
  });

  it("does not lose a day in a negative-offset timezone", () => {
    // 2025-03-12T02:00:00Z is 2025-03-11 in ART: one day after a 10th window end.
    expect(
      getDaysAfterPaymentWindow("2025-03", 10, Date.UTC(2025, 2, 12, 2, 0, 0), ART),
    ).toBe(1);
  });

  it("prefers an explicit dueAt over the calendar window day", () => {
    expect(
      getDaysAfterPaymentWindow(
        "2025-03",
        10,
        middayUtc(2025, 3, 25),
        ART,
        utc(2025, 3, 20),
      ),
    ).toBe(5);
  });
});

describe("computeInterest", () => {
  const tiers = [
    { daysAfterWindowEnd: 5, type: "percentage" as const, value: 10 },
    { daysAfterWindowEnd: 15, type: "fixed" as const, value: 2000 },
  ];

  it("applies nothing inside the window", () => {
    const result = computeInterest(50_000, tiers, "2025-03", 10, middayUtc(2025, 3, 10), ART);
    expect(result).toEqual({ applied: [], totalArs: 0, totalAmount: 50_000 });
  });

  it("applies tiers cumulatively once each threshold is reached", () => {
    const oneTier = computeInterest(50_000, tiers, "2025-03", 10, middayUtc(2025, 3, 16), ART);
    expect(oneTier.totalArs).toBe(5_000);
    expect(oneTier.totalAmount).toBe(55_000);

    const bothTiers = computeInterest(50_000, tiers, "2025-03", 10, middayUtc(2025, 3, 26), ART);
    expect(bothTiers.applied).toHaveLength(2);
    expect(bothTiers.totalArs).toBe(7_000);
    expect(bothTiers.totalAmount).toBe(57_000);
  });

  it("rounds percentage interest to whole pesos", () => {
    const result = computeInterest(
      1_005,
      [{ daysAfterWindowEnd: 1, type: "percentage", value: 5 }],
      "2025-03",
      10,
      middayUtc(2025, 3, 20),
      ART,
    );
    expect(result.totalArs).toBe(50);
    expect(Number.isInteger(result.totalAmount)).toBe(true);
  });

  it("applies nothing when the plan has no tiers", () => {
    const result = computeInterest(50_000, [], "2025-03", 10, middayUtc(2025, 4, 30), ART);
    expect(result.totalAmount).toBe(50_000);
  });
});

describe("effective amounts", () => {
  it("charges the plain plan price with no bonification", () => {
    expect(computeBonifiedPricePerMember(30_000, null)).toBe(30_000);
    expect(computeBonifiedPricePerMember(30_000, undefined)).toBe(30_000);
  });

  it("applies percentage, fixed and full bonifications per member", () => {
    expect(
      computeBonifiedPricePerMember(30_000, {
        discountType: "percentage",
        discountValue: 25,
      }),
    ).toBe(22_500);
    expect(
      computeBonifiedPricePerMember(30_000, {
        discountType: "fixed",
        discountValue: 5_000,
      }),
    ).toBe(25_000);
    expect(
      computeBonifiedPricePerMember(30_000, {
        discountType: "full",
        discountValue: 0,
      }),
    ).toBe(0);
  });

  it("never returns a negative price for an oversized fixed discount", () => {
    expect(
      computeBonifiedPricePerMember(10_000, {
        discountType: "fixed",
        discountValue: 25_000,
      }),
    ).toBe(0);
  });

  it("rounds a percentage bonification to whole pesos", () => {
    const amount = computeBonifiedPricePerMember(10_001, {
      discountType: "percentage",
      discountValue: 33,
    });
    expect(amount).toBe(6_701);
    expect(Number.isInteger(amount)).toBe(true);
  });

  it("multiplies the bonified per-member price by the family size", () => {
    expect(
      computeEffectiveCycleAmountArs({ planPriceArs: 30_000, memberCount: 3 }),
    ).toBe(90_000);
    expect(
      computeEffectiveCycleAmountArs({
        planPriceArs: 30_000,
        memberCount: 3,
        bonification: { discountType: "percentage", discountValue: 50 },
      }),
    ).toBe(45_000);
    expect(
      computeEffectiveCycleAmountArs({
        planPriceArs: 30_000,
        memberCount: 4,
        bonification: { discountType: "full", discountValue: 0 },
      }),
    ).toBe(0);
  });

  it("treats a negative member count as zero", () => {
    expect(
      computeEffectiveCycleAmountArs({ planPriceArs: 30_000, memberCount: -2 }),
    ).toBe(0);
  });
});

describe("computeAdvanceTotalArs", () => {
  it("applies the advance discount per member before the family multiplier", () => {
    const result = computeAdvanceTotalArs({
      planPriceArs: 30_000,
      memberCount: 2,
      months: 3,
      discountPercentage: 10,
    });
    expect(result.discountedPricePerMemberArs).toBe(27_000);
    expect(result.perCycleArs).toBe(54_000);
    expect(result.totalArs).toBe(162_000);
  });

  it("stacks an active bonification with the advance discount", () => {
    const result = computeAdvanceTotalArs({
      planPriceArs: 30_000,
      memberCount: 1,
      months: 6,
      discountPercentage: 20,
      bonification: { discountType: "percentage", discountValue: 50 },
    });
    expect(result.discountedPricePerMemberArs).toBe(12_000);
    expect(result.totalArs).toBe(72_000);
  });

  it("keeps every amount an integer", () => {
    const result = computeAdvanceTotalArs({
      planPriceArs: 33_333,
      memberCount: 3,
      months: 12,
      discountPercentage: 15,
    });
    expect(Number.isInteger(result.discountedPricePerMemberArs)).toBe(true);
    expect(Number.isInteger(result.totalArs)).toBe(true);
  });
});

describe("grace and cancellation", () => {
  it("anchors the grace deadline to the first failure", () => {
    const firstFailureAt = middayUtc(2025, 3, 10);
    expect(computeGraceUntil(firstFailureAt, 5)).toBe(firstFailureAt + 5 * DAY_MS);
  });

  it("returns the same deadline no matter how often a retry recomputes it", () => {
    const firstFailureAt = middayUtc(2025, 3, 10);
    const deadlines = [1, 2, 3].map(() => computeGraceUntil(firstFailureAt, 7));
    expect(new Set(deadlines).size).toBe(1);
  });

  it("treats a zero or negative grace as immediate", () => {
    const at = middayUtc(2025, 3, 10);
    expect(computeGraceUntil(at, 0)).toBe(at);
    expect(computeGraceUntil(at, -3)).toBe(at);
  });

  it("ends cancelled access at paid coverage end plus grace", () => {
    const periodEnd = utc(2025, 4, 10);
    expect(computeCancellationAccessEndsAt(periodEnd, 5)).toBe(
      periodEnd + 5 * DAY_MS,
    );
    expect(computeCancellationAccessEndsAt(periodEnd, 0)).toBe(periodEnd);
  });
});

describe("commission", () => {
  it("is zero for a zero-fee policy", () => {
    expect(computeCommissionArs(100_000, 0)).toBe(0);
    expect(computeCommissionArs(100_000, -50)).toBe(0);
  });

  it("computes basis points and rounds to whole pesos", () => {
    expect(computeCommissionArs(100_000, 500)).toBe(5_000); // 5%
    expect(computeCommissionArs(100_000, 250)).toBe(2_500); // 2.5%
    expect(computeCommissionArs(1_234, 100)).toBe(12); // 1% of 1234 = 12.34
    expect(computeCommissionArs(1_250, 100)).toBe(13); // 12.5 rounds up
  });

  it("is zero for non-positive or non-finite gross amounts", () => {
    expect(computeCommissionArs(0, 500)).toBe(0);
    expect(computeCommissionArs(-100, 500)).toBe(0);
    expect(computeCommissionArs(Number.NaN, 500)).toBe(0);
  });

  it("reconciles gross, provider fee, MAT fee and gym net", () => {
    const grossArs = 100_000;
    const platformFeeArs = computeCommissionArs(grossArs, 500);
    const providerFeeArs = 6_100;
    const net = computeGymNetArs({ grossArs, providerFeeArs, platformFeeArs });
    expect(net).toBe(88_900);
    expect(net + providerFeeArs + platformFeeArs).toBe(grossArs);
  });

  it("never reports a negative net", () => {
    expect(
      computeGymNetArs({ grossArs: 1_000, providerFeeArs: 900, platformFeeArs: 500 }),
    ).toBe(0);
  });
});

describe("buildJoinDateCycle", () => {
  it("is consistent with getBillingCycle for the same anchor", () => {
    const activatedAt = middayUtc(2025, 1, 17);
    const fromCycle = getBillingCycle(
      { billingMode: "join_date" },
      activatedAt,
      middayUtc(2025, 6, 20),
      ART,
    );
    expect(buildJoinDateCycle(17, 2025, 6)).toEqual(fromCycle);
  });
});

describe("splitAmountAcrossCycles", () => {
  it("splits evenly when the total divides", () => {
    expect(splitAmountAcrossCycles(90_000, 3)).toEqual([30_000, 30_000, 30_000]);
  });

  it("always sums back to the amount the member paid", () => {
    for (const total of [81_000, 100_000, 1, 7, 123_457]) {
      for (const months of [3, 6, 12]) {
        const parts = splitAmountAcrossCycles(total, months);
        expect(parts).toHaveLength(months);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
        for (const part of parts) expect(Number.isInteger(part)).toBe(true);
      }
    }
  });

  it("puts the remainder on the first cycle", () => {
    expect(splitAmountAcrossCycles(100, 3)).toEqual([34, 33, 33]);
  });

  it("returns nothing for a non-positive cycle count", () => {
    expect(splitAmountAcrossCycles(1_000, 0)).toEqual([]);
    expect(splitAmountAcrossCycles(1_000, -2)).toEqual([]);
  });
});
