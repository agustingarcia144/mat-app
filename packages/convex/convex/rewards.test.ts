import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { getLocalDate, previousLocalDate } from "./rewardsDomain";
import { awardMembershipPaymentReward } from "./rewards";

const modules = import.meta.glob("./**/*.*s");
const ADMIN = "reward_admin";
const MEMBER = "reward_member";

type TestConvex = ReturnType<typeof convexTest>;

beforeEach(() => {
  process.env.REWARDS_QR_SIGNING_SECRET =
    "test-reward-secret-that-is-at-least-32-bytes";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.REWARDS_QR_SIGNING_SECRET;
});

async function seed(t: TestConvex, suffix = "a") {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: `Gym ${suffix}`,
      slug: `reward-gym-${suffix}-${now}`,
      logoUrl: "https://example.com/gym-logo.jpg",
      timezone: "America/Argentina/Buenos_Aires",
      createdAt: now,
      updatedAt: now,
    });
    for (const [userId, role] of [
      [`${ADMIN}_${suffix}`, "admin"],
      [`${MEMBER}_${suffix}`, "member"],
    ] as const) {
      await ctx.db.insert("users", {
        externalId: userId,
        fullName: role === "admin" ? "Admin Rewards" : "Member Rewards",
        activeOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role,
        status: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("organizationSettings", {
      organizationId,
      planificationsEnabled: true,
      classesEnabled: true,
      financeEnabled: true,
      memberAutoApproval: false,
      rewards: {
        enabled: true,
        programName: "Puntos del gym",
        pointsName: "puntos",
        pointsPerAttendance: 10,
        maxRewardedAttendancesPerDay: 1,
        duplicateWindowMinutes: 30,
        eligibleSources: ["qr_check_in", "class_attendance"],
        streaksEnabled: false,
        weeklyBonusEnabled: false,
        walletCard: {
          enabled: true,
          mode: "global",
          defaultDesign: {
            programName: "Membresía",
            backgroundColor: "#121826",
          },
          planDesigns: [],
        },
      },
      createdAt: now,
      updatedAt: now,
    });
    const planId = await ctx.db.insert("membershipPlans", {
      organizationId,
      name: "Mensual",
      priceArs: 20_000,
      weeklyClassLimit: 3,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 10,
      isActive: true,
      createdBy: `${ADMIN}_${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId,
      userId: `${MEMBER}_${suffix}`,
      planId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return {
      organizationId,
      planId,
      subscriptionId,
      admin: `${ADMIN}_${suffix}`,
      member: `${MEMBER}_${suffix}`,
    };
  });
}

async function issueAndScan(
  t: TestConvex,
  fixture: Awaited<ReturnType<typeof seed>>,
) {
  const qr = await t
    .withIdentity({ subject: fixture.member })
    .mutation(api.rewards.issueMyMobileQr, {});
  return await t
    .withIdentity({ subject: fixture.admin })
    .mutation(api.rewards.scanQr, { payload: qr.payload });
}

describe("member rewards", () => {
  it("resolves a plan-specific Wallet design and queues existing passes after edits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00Z"));
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "wallet-design");
    const member = t.withIdentity({ subject: fixture.member });
    const initialPass = await member.mutation(
      internal.rewards.prepareMyWalletPass,
      {
        provider: "apple",
      },
    );
    await t.mutation(internal.rewards.saveAppleRegistration, {
      deviceLibraryIdentifier: "test-device",
      passTypeIdentifier: "pass.com.example.membership",
      serialNumber: initialPass.providerObjectId,
      pushToken: "test-push-token",
    });
    const beforeUpdate = await t.query(
      internal.rewards.listApplePassesForDevice,
      {
        deviceLibraryIdentifier: "test-device",
        passTypeIdentifier: "pass.com.example.membership",
      },
    );
    vi.advanceTimersByTime(1_000);

    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.organizationSettings.update, {
        rewards: {
          enabled: true,
          programName: "Puntos del gym",
          pointsName: "puntos",
          pointsPerAttendance: 10,
          maxRewardedAttendancesPerDay: 1,
          duplicateWindowMinutes: 30,
          eligibleSources: ["qr_check_in", "class_attendance"],
          streaksEnabled: false,
          weeklyBonusEnabled: false,
          walletCard: {
            enabled: true,
            mode: "by_plan",
            defaultDesign: {
              programName: "Membresía general",
              backgroundColor: "#121826",
            },
            planDesigns: [
              {
                planId: fixture.planId,
                design: {
                  programName: "Membresía Mensual",
                  backgroundColor: "#216ACF",
                },
              },
            ],
          },
        },
      });

    const resolved = await member.mutation(
      internal.rewards.prepareMyWalletPass,
      { provider: "apple" },
    );
    expect(resolved.walletDesign.programName).toBe("Membresía Mensual");
    expect(resolved.walletDesign.backgroundColor).toBe("#216ACF");
    expect(resolved.walletDesign.variantKey).toBe(String(fixture.planId));
    expect(resolved.walletDesign.logoUrl).toBe(
      "https://example.com/gym-logo.jpg",
    );

    const operations = await t.run((ctx) =>
      ctx.db.query("walletSyncOperations").collect(),
    );
    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationType).toBe("update");

    const changedPasses = await t.query(
      internal.rewards.listApplePassesForDevice,
      {
        deviceLibraryIdentifier: "test-device",
        passTypeIdentifier: "pass.com.example.membership",
        passesUpdatedSince: Number(beforeUpdate.lastUpdated),
      },
    );
    expect(changedPasses.serialNumbers).toEqual([initialPass.providerObjectId]);
    expect(Number(changedPasses.lastUpdated)).toBeGreaterThan(
      Number(beforeUpdate.lastUpdated),
    );
  });

  it("records a QR entrance and awards the configured daily points once", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t);

    const first = await issueAndScan(t, fixture);
    expect(first.allowed).toBe(true);
    expect(first.pointsAwarded).toBe(10);
    expect(first.balance).toBe(10);

    const second = await issueAndScan(t, fixture);
    expect(second.allowed).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.pointsAwarded).toBe(0);

    const state = await t.run(async (ctx) => ({
      checkIns: await ctx.db.query("memberCheckIns").collect(),
      ledger: await ctx.db.query("rewardLedger").collect(),
      account: await ctx.db.query("rewardAccounts").first(),
    }));
    expect(state.checkIns).toHaveLength(1);
    expect(state.ledger.filter((entry) => entry.type === "earn")).toHaveLength(
      1,
    );
    expect(state.account?.balance).toBe(10);
  });

  it("starts a fresh duplicate day at the gym's local midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T02:59:00.000Z")); // 23:59 in Buenos Aires
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "local-midnight");

    const first = await issueAndScan(t, fixture);
    expect(first.actuateAccess).toBe(true);

    vi.setSystemTime(new Date("2026-08-31T03:01:00.000Z")); // 00:01 next local day
    const nextDay = await issueAndScan(t, fixture);
    expect(nextDay.actuateAccess).toBe(true);
    expect(nextDay.duplicate).toBe(false);

    const checkIns = await t.run((ctx) =>
      ctx.db.query("memberCheckIns").collect(),
    );
    expect(checkIns.map((item) => item.localDate).sort()).toEqual([
      "2026-08-30",
      "2026-08-31",
    ]);
  });

  it("awards paid membership months once and resets tenure after a gap", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "tenure");
    const results = await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("organizationSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", fixture.organizationId),
        )
        .first();
      await ctx.db.patch(settings!._id, {
        rewards: {
          ...settings!.rewards!,
          pointsPerMembershipMonth: 7,
          eligibleSources: [
            ...settings!.rewards!.eligibleSources,
            "membership_payment",
          ],
        },
      });

      const awardPeriod = async (billingPeriod: string) => {
        const now = Date.now();
        const paymentId = await ctx.db.insert("planPayments", {
          organizationId: fixture.organizationId,
          userId: fixture.member,
          subscriptionId: fixture.subscriptionId,
          planId: fixture.planId,
          billingPeriod,
          amountArs: 20_000,
          totalAmountArs: 20_000,
          paymentMethod: "cash",
          status: "approved",
          createdAt: now,
          updatedAt: now,
        });
        return {
          paymentId,
          result: await awardMembershipPaymentReward(ctx, {
            paymentId,
            occurredAt: now,
          }),
        };
      };

      const january = await awardPeriod("2026-01");
      const duplicate = await awardMembershipPaymentReward(ctx, {
        paymentId: january.paymentId,
        occurredAt: Date.now(),
      });
      const february = await awardPeriod("2026-02");
      const april = await awardPeriod("2026-04");
      return { january, duplicate, february, april };
    });

    expect(results.january.result).toEqual({
      pointsAwarded: 7,
      consecutivePaidMonths: 1,
    });
    expect(results.duplicate.pointsAwarded).toBe(0);
    expect(results.february.result.consecutivePaidMonths).toBe(2);
    expect(results.april.result.consecutivePaidMonths).toBe(1);
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.query("rewardAccounts").first(),
      ledger: await ctx.db
        .query("rewardLedger")
        .filter((q) => q.eq(q.field("sourceType"), "membership_payment"))
        .collect(),
    }));
    expect(state.account?.balance).toBe(21);
    expect(state.ledger).toHaveLength(3);
  });

  it("rejects reuse of the exact same dynamic QR token", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "replay");
    const qr = await t
      .withIdentity({ subject: fixture.member })
      .mutation(api.rewards.issueMyMobileQr, {});
    const scanner = t.withIdentity({ subject: fixture.admin });

    const first = await scanner.mutation(api.rewards.scanQr, {
      payload: qr.payload,
    });
    const replay = await scanner.mutation(api.rewards.scanQr, {
      payload: qr.payload,
    });

    expect(first.allowed).toBe(true);
    expect(first.actuateAccess).toBe(true);
    expect(replay.allowed).toBe(false);
    expect(replay.actuateAccess).toBe(false);
    expect(replay.code).toBe("QR_REPLAYED");
  });

  it("does not award twice when class attendance and a QR entrance occur the same day", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "class");
    const reservationId = await t.run(async (ctx) => {
      const now = Date.now();
      const classId = await ctx.db.insert("classes", {
        organizationId: fixture.organizationId,
        name: "Funcional",
        capacity: 12,
        isRecurring: false,
        bookingWindowDays: 7,
        cancellationWindowHours: 2,
        isActive: true,
        createdBy: fixture.admin,
        createdAt: now,
        updatedAt: now,
      });
      const scheduleId = await ctx.db.insert("classSchedules", {
        classId,
        organizationId: fixture.organizationId,
        startTime: now,
        endTime: now + 60 * 60_000,
        capacity: 12,
        currentReservations: 1,
        status: "scheduled",
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("classReservations", {
        scheduleId,
        classId,
        organizationId: fixture.organizationId,
        userId: fixture.member,
        scheduleStartTime: now,
        status: "confirmed",
        createdAt: now,
        updatedAt: now,
      });
    });

    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.classReservations.checkIn, { id: reservationId });
    const entrance = await issueAndScan(t, fixture);
    expect(entrance.pointsAwarded).toBe(0);
    expect(entrance.balance).toBe(10);
  });

  it("denies a suspended subscription without creating points", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "suspended");
    await t.run((ctx) =>
      ctx.db.patch(fixture.subscriptionId, {
        status: "suspended",
        suspendedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await issueAndScan(t, fixture);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SUBSCRIPTION_SUSPENDED");
    const ledger = await t.run((ctx) => ctx.db.query("rewardLedger").collect());
    expect(ledger).toHaveLength(0);
  });

  it("prevents concurrent redemptions from overspending", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "redeem");
    await issueAndScan(t, fixture);
    const definitionId = await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.saveRewardDefinition, {
        name: "Agua",
        pointsCost: 10,
        enabled: true,
      });

    const member = t.withIdentity({ subject: fixture.member });
    const results = await Promise.allSettled([
      member.mutation(api.rewards.redeem, { rewardDefinitionId: definitionId }),
      member.mutation(api.rewards.redeem, { rewardDefinitionId: definitionId }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.query("rewardAccounts").first(),
      redemptions: await ctx.db.query("rewardRedemptions").collect(),
    }));
    expect(state.account?.balance).toBe(0);
    expect(state.redemptions).toHaveLength(1);
  });

  it("rejects a credential at another gym", async () => {
    const t = convexTest(schema, modules);
    const gymA = await seed(t, "one");
    const gymB = await seed(t, "two");
    const qr = await t
      .withIdentity({ subject: gymA.member })
      .mutation(api.rewards.issueMyMobileQr, {});
    const result = await t
      .withIdentity({ subject: gymB.admin })
      .mutation(api.rewards.scanQr, { payload: qr.payload });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("WRONG_ORGANIZATION");
  });

  it("revokes an old QR immediately when an admin rotates the credential", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "rotation");
    const oldQr = await t
      .withIdentity({ subject: fixture.member })
      .mutation(api.rewards.issueMyMobileQr, {});
    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.rotateCredential, { userId: fixture.member });
    const result = await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.scanQr, { payload: oldQr.payload });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("QR_REVOKED");
  });

  it("uses a ledger reversal when the only attendance is voided", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "void");
    await issueAndScan(t, fixture);
    const checkIn = await t.run((ctx) =>
      ctx.db.query("memberCheckIns").first(),
    );
    expect(checkIn).not.toBeNull();
    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.voidCheckIn, {
        id: checkIn!._id,
        reason: "Ingreso registrado por error",
      });
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.query("rewardAccounts").first(),
      ledger: await ctx.db.query("rewardLedger").collect(),
    }));
    expect(state.account?.balance).toBe(0);
    expect(state.ledger.map((entry) => entry.type).sort()).toEqual([
      "earn",
      "reversal",
    ]);
  });

  it("can award an attendance and its streak again after an erroneous check-in is voided", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "streak-void");
    const timezone = "America/Argentina/Buenos_Aires";
    const today = getLocalDate(Date.now(), timezone);
    const yesterday = previousLocalDate(today);
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("organizationSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", fixture.organizationId),
        )
        .first();
      expect(settings).not.toBeNull();
      await ctx.db.patch(settings!._id, {
        rewards: {
          ...settings!.rewards!,
          streaksEnabled: true,
          streakIntervalDays: 2,
          streakBonusPoints: 5,
        },
      });
      const now = Date.now();
      const accountId = await ctx.db.insert("rewardAccounts", {
        organizationId: fixture.organizationId,
        userId: fixture.member,
        balance: 10,
        lifetimeEarned: 10,
        lifetimeRedeemed: 0,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("rewardLedger", {
        organizationId: fixture.organizationId,
        accountId,
        userId: fixture.member,
        points: 10,
        balanceAfter: 10,
        type: "earn",
        reason: "Asistencia anterior",
        sourceType: "attendance",
        sourceId: "previous-day",
        idempotencyKey: `previous-day:${fixture.member}`,
        localDate: yesterday,
        ruleSnapshot: {
          pointsPerAttendance: 10,
          maxRewardedAttendancesPerDay: 1,
          localDate: yesterday,
          timezone,
          eligibleSource: "qr_check_in",
        },
        createdAt: now,
      });
    });

    const first = await issueAndScan(t, fixture);
    expect(first.pointsAwarded).toBe(15);
    expect(first.bonusPointsAwarded).toBe(5);
    expect(first.balance).toBe(25);
    const checkIn = await t.run((ctx) =>
      ctx.db.query("memberCheckIns").first(),
    );
    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.voidCheckIn, {
        id: checkIn!._id,
        reason: "Lectura accidental",
      });

    const second = await issueAndScan(t, fixture);
    expect(second.pointsAwarded).toBe(15);
    expect(second.balance).toBe(25);
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.query("rewardAccounts").first(),
      ledger: await ctx.db.query("rewardLedger").collect(),
    }));
    expect(state.account?.balance).toBe(25);
    expect(
      state.ledger.filter(
        (entry) =>
          entry.type === "reversal" &&
          entry.sourceType === "attendance_bonus_void",
      ),
    ).toHaveLength(1);
    expect(
      state.ledger.filter(
        (entry) => entry.type === "earn" && entry.sourceType === "streak_bonus",
      ),
    ).toHaveLength(2);
  });

  it("restores points exactly once when a redemption is cancelled", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, "cancel");
    await issueAndScan(t, fixture);
    const definitionId = await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.saveRewardDefinition, {
        name: "Bebida",
        pointsCost: 10,
        availableQuantity: 2,
        enabled: true,
      });
    const redemptionId = await t
      .withIdentity({ subject: fixture.member })
      .mutation(api.rewards.redeem, { rewardDefinitionId: definitionId });
    await t
      .withIdentity({ subject: fixture.admin })
      .mutation(api.rewards.updateRedemptionStatus, {
        id: redemptionId,
        status: "cancelled",
        cancellationReason: "Sin stock",
      });
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.query("rewardAccounts").first(),
      ledger: await ctx.db.query("rewardLedger").collect(),
      reward: await ctx.db.get(definitionId),
    }));
    expect(state.account?.balance).toBe(10);
    expect(state.reward?.availableQuantity).toBe(2);
    expect(
      state.ledger.filter((entry) => entry.type === "reversal"),
    ).toHaveLength(1);
  });
});
