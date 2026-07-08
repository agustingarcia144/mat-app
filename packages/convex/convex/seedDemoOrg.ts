import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Demo data seeder — populates a REAL organization with fake Spanish people and
 * realistic activity so the admin/trainer dashboard looks lived-in for sales
 * presentations, WITHOUT touching any real gym data.
 *
 * Design notes:
 * - These users exist only in Convex (not Clerk), so they cannot log in. That's
 *   fine for a dashboard demo driven by the real admin login.
 * - Every seeded row is tagged via the `demo_` prefix on its Clerk-ID string
 *   field (externalId / userId / createdBy / trainerId / assignedBy). Real Clerk
 *   IDs are `user_…`, so `clearDemoOrg` can remove ONLY seeded rows and never
 *   touch real data.
 *
 * Run from the Convex dashboard:
 *   seedDemoOrg  { organizationId, memberCount?, trainerCount?, adminCount?, reset? }
 *   clearDemoOrg { organizationId }
 */

const DEMO_PREFIX = "demo_";
const DEMO_EMAIL_DOMAIN = "demo.matgestion.local";

const isDemoId = (id: string | undefined): boolean =>
  typeof id === "string" && id.startsWith(DEMO_PREFIX);

// --- Spanish (Spain-style) name pools -------------------------------------

const FIRST_NAMES_M = [
  "Juan", "Carlos", "José", "Antonio", "Manuel", "Francisco", "David",
  "Javier", "Daniel", "Miguel", "Pablo", "Sergio", "Alejandro", "Adrián",
  "Álvaro", "Diego", "Rubén", "Iván", "Marcos", "Jorge",
];

const FIRST_NAMES_F = [
  "María", "Carmen", "Ana", "Isabel", "Laura", "Cristina", "Marta", "Lucía",
  "Elena", "Paula", "Sara", "Andrea", "Beatriz", "Raquel", "Nuria", "Sofía",
  "Alba", "Irene", "Patricia", "Rocío",
];

const SURNAMES = [
  "García", "Rodríguez", "González", "Fernández", "López", "Martínez",
  "Sánchez", "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández",
  "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Alonso", "Gutiérrez",
  "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Ramírez",
  "Serrano", "Blanco", "Molina", "Castro", "Ortega", "Delgado", "Ortiz",
];

const CLASS_TEMPLATES = [
  { name: "CrossFit", capacity: 16, daysOfWeek: [1, 3, 5], startHour: 18 },
  { name: "Funcional", capacity: 20, daysOfWeek: [2, 4], startHour: 19 },
  { name: "Spinning", capacity: 14, daysOfWeek: [1, 4], startHour: 8 },
  { name: "Yoga", capacity: 18, daysOfWeek: [3, 6], startHour: 10 },
  { name: "Movilidad", capacity: 12, daysOfWeek: [2, 5], startHour: 17 },
];

const PLAN_TEMPLATES = [
  { name: "Hipertrofia — Full Body 3 días", days: ["Día 1 — Empuje", "Día 2 — Tracción", "Día 3 — Pierna"] },
  { name: "Fuerza — Torso/Pierna", days: ["Torso A", "Pierna A", "Torso B", "Pierna B"] },
  { name: "Iniciación — Acondicionamiento", days: ["Circuito A", "Circuito B"] },
];

// Membership (billing) plans members subscribe to.
const MEMBERSHIP_PLAN_DEFS = [
  { name: "Plan Libre", priceArs: 25000, weeklyClassLimit: 7 },
  { name: "Plan 3 días", priceArs: 18000, weeklyClassLimit: 3 },
  { name: "Plan 2 días", priceArs: 14000, weeklyClassLimit: 2 },
];

const PAYMENT_METHODS = ["cash", "bank_transfer", "proof_upload"] as const;

const FINANCE_INCOME_DEFS = [
  { title: "Venta de suplementos", category: "Suplementos", min: 25000, max: 70000 },
  { title: "Venta de indumentaria", category: "Indumentaria", min: 15000, max: 45000 },
  { title: "Inscripciones", category: "Inscripción", min: 20000, max: 50000 },
];

// Baseline monthly expenses (kept below membership income so most months are positive).
const FINANCE_EXPENSE_DEFS = [
  { title: "Alquiler", category: "Alquiler", amountArs: 100000 },
  { title: "Sueldos", category: "Sueldos", amountArs: 110000 },
  { title: "Servicios (luz, agua, gas)", category: "Servicios", amountArs: 30000 },
  { title: "Limpieza y mantenimiento", category: "Mantenimiento", amountArs: 15000 },
];

// --- Small helpers ---------------------------------------------------------

const rand = (n: number): number => Math.floor(Math.random() * n);
const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)];

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const stripAccents = (s: string): string =>
  s.normalize("NFD").replace(COMBINING_MARKS, "");

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM" billing period key (matches getCurrentBillingPeriod in planPayments).
function monthPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function randomBirthday(): string {
  // Ages roughly 18–55
  const start = Date.UTC(1970, 0, 1);
  const end = Date.UTC(2006, 0, 1);
  return formatDate(start + rand(end - start));
}

function randomPhone(): string {
  const block = () => String(100 + rand(900));
  return `+34 6${rand(10)}${rand(10)} ${block()} ${block()}`;
}

// --- Seed ------------------------------------------------------------------

export const seedDemoOrg = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    memberCount: v.optional(v.number()),
    trainerCount: v.optional(v.number()),
    adminCount: v.optional(v.number()),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    if (args.reset) {
      await clearDemo(ctx, args.organizationId);
    }

    const memberCount = args.memberCount ?? 25;
    const trainerCount = args.trainerCount ?? 3;
    const adminCount = args.adminCount ?? 1;
    const now = Date.now();

    // 1. Ensure organization settings exist (features enabled).
    const existingSettings = await ctx.db
      .query("organizationSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .first();
    if (!existingSettings) {
      await ctx.db.insert("organizationSettings", {
        organizationId: args.organizationId,
        planificationsEnabled: true,
        classesEnabled: true,
        financeEnabled: true,
        memberAutoApproval: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 2 & 3. Create fake users + memberships.
    type Person = { externalId: string; role: "admin" | "trainer" | "member" };
    const admins: Person[] = [];
    const trainers: Person[] = [];
    const members: Person[] = [];

    const roleSequence: Array<"admin" | "trainer" | "member"> = [
      ...Array<"admin">(adminCount).fill("admin"),
      ...Array<"trainer">(trainerCount).fill("trainer"),
      ...Array<"member">(memberCount).fill("member"),
    ];

    for (let i = 0; i < roleSequence.length; i++) {
      const role = roleSequence[i];
      const isFemale = Math.random() < 0.5;
      const firstName = isFemale ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
      const lastName = `${pick(SURNAMES)} ${pick(SURNAMES)}`;
      const fullName = `${firstName} ${lastName}`;
      const externalId = `${DEMO_PREFIX}${args.organizationId}_${i}`;
      const emailLocal = stripAccents(
        `${firstName}.${lastName.split(" ")[0]}${i}`,
      )
        .toLowerCase()
        .replace(/\s+/g, "");
      const email = `${emailLocal}@${DEMO_EMAIL_DOMAIN}`;

      // Stagger joins across the past year.
      const joinedAt = now - rand(365) * DAY_MS;

      await ctx.db.insert("users", {
        externalId,
        firstName,
        lastName,
        fullName,
        email,
        phone: randomPhone(),
        birthday: randomBirthday(),
        height: 150 + rand(46), // 150–195 cm
        weight: 50 + rand(61), // 50–110 kg
        onboardingCompleted: true,
        activeOrganizationId: args.organizationId,
        createdAt: joinedAt,
        updatedAt: now,
      });

      await ctx.db.insert("organizationMemberships", {
        organizationId: args.organizationId,
        userId: externalId,
        role,
        status: "active",
        usesPlanification: role === "member",
        joinedAt,
        lastActiveAt: now - rand(14) * DAY_MS,
        createdAt: joinedAt,
        updatedAt: now,
      });

      const person: Person = { externalId, role };
      if (role === "admin") admins.push(person);
      else if (role === "trainer") trainers.push(person);
      else members.push(person);
    }

    const staff = [...trainers, ...admins];
    const createdBy = (admins[0] ?? trainers[0] ?? members[0]).externalId;
    const trainerPool =
      trainers.length > 0 ? trainers : staff.length > 0 ? staff : members;

    // 4. Classes.
    const windowStart = now - 14 * DAY_MS;
    const windowEnd = now + 14 * DAY_MS;
    const createdClasses: Array<{
      id: Id<"classes">;
      capacity: number;
      daysOfWeek: number[];
      startHour: number;
    }> = [];

    for (const tpl of CLASS_TEMPLATES) {
      const trainerId =
        trainerPool.length > 0 ? pick(trainerPool).externalId : createdBy;
      const classId = await ctx.db.insert("classes", {
        organizationId: args.organizationId,
        name: tpl.name,
        description: `Clase de ${tpl.name} (demo)`,
        capacity: tpl.capacity,
        trainerId,
        isRecurring: true,
        recurrencePattern: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: tpl.daysOfWeek,
        },
        bookingWindowDays: 7,
        cancellationWindowHours: 2,
        isActive: true,
        createdBy,
        createdAt: windowStart,
        updatedAt: now,
      });
      createdClasses.push({
        id: classId,
        capacity: tpl.capacity,
        daysOfWeek: tpl.daysOfWeek,
        startHour: tpl.startHour,
      });
    }

    // 5 & 6 & 7. Schedules + reservations (+ maintain currentReservations).
    let scheduleCount = 0;
    let reservationCount = 0;
    const memberIds = members.map((m) => m.externalId);

    for (const cls of createdClasses) {
      // Walk each day in the window; emit an occurrence on matching weekdays.
      const cursor = new Date(windowStart);
      cursor.setHours(0, 0, 0, 0);
      for (
        let ts = cursor.getTime();
        ts <= windowEnd;
        ts += DAY_MS
      ) {
        const day = new Date(ts);
        if (!cls.daysOfWeek.includes(day.getDay())) continue;

        const start = new Date(ts);
        start.setHours(cls.startHour, 0, 0, 0);
        const startTime = start.getTime();
        const endTime = startTime + 60 * 60 * 1000; // 1h classes
        const isPast = endTime < now;

        // Fill 40–95% of capacity.
        const targetFill = Math.min(
          cls.capacity,
          Math.round(cls.capacity * (0.4 + Math.random() * 0.55)),
        );
        const shuffled = [...memberIds].sort(() => Math.random() - 0.5);
        const attendees = shuffled.slice(0, targetFill);

        const scheduleId = await ctx.db.insert("classSchedules", {
          classId: cls.id,
          organizationId: args.organizationId,
          startTime,
          endTime,
          capacity: cls.capacity,
          currentReservations: 0, // patched below
          status: isPast ? "completed" : "scheduled",
          createdAt: windowStart,
          updatedAt: now,
        });
        scheduleCount++;

        let occupying = 0;
        for (const userId of attendees) {
          let status: "confirmed" | "attended" | "no_show";
          let checkedInAt: number | undefined;
          if (isPast) {
            if (Math.random() < 0.8) {
              status = "attended";
              checkedInAt = startTime + rand(10) * 60 * 1000;
              occupying++;
            } else {
              status = "no_show";
            }
          } else {
            status = "confirmed";
            occupying++;
          }

          await ctx.db.insert("classReservations", {
            scheduleId,
            classId: cls.id,
            organizationId: args.organizationId,
            userId,
            scheduleStartTime: startTime,
            status,
            checkedInAt,
            createdAt: startTime - rand(3) * DAY_MS,
            updatedAt: now,
          });
          reservationCount++;
        }

        await ctx.db.patch(scheduleId, { currentReservations: occupying });
      }
    }

    // 8. Planifications (+ revision + a light week/day structure) + assignments.
    let assignmentCount = 0;
    for (const tpl of PLAN_TEMPLATES) {
      const author = pick(trainerPool).externalId;
      const planificationId = await ctx.db.insert("planifications", {
        organizationId: args.organizationId,
        name: tpl.name,
        description: `${tpl.name} (demo)`,
        isTemplate: false,
        hasEverBeenAssigned: true,
        createdBy: author,
        createdAt: windowStart,
        updatedAt: now,
      });

      const revisionId = await ctx.db.insert("planificationRevisions", {
        planificationId,
        revisionNumber: 1,
        name: tpl.name,
        createdBy: author,
        createdAt: windowStart,
        updatedAt: now,
      });
      await ctx.db.patch(planificationId, {
        currentRevisionId: revisionId,
        updatedAt: now,
      });

      const weekId = await ctx.db.insert("workoutWeeks", {
        planificationId,
        revisionId,
        name: "Semana 1",
        order: 0,
        createdAt: windowStart,
        updatedAt: now,
      });
      for (let d = 0; d < tpl.days.length; d++) {
        await ctx.db.insert("workoutDays", {
          weekId,
          planificationId,
          revisionId,
          name: tpl.days[d],
          order: d,
          createdAt: windowStart,
          updatedAt: now,
        });
      }

      // Assign to ~40% of members.
      const assignees = [...memberIds]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.ceil(memberIds.length * 0.4));
      for (const userId of assignees) {
        await ctx.db.insert("planificationAssignments", {
          planificationId,
          revisionId,
          userId,
          organizationId: args.organizationId,
          assignedBy: author,
          status: "active",
          startDate: now - rand(30) * DAY_MS,
          createdAt: now - rand(30) * DAY_MS,
          updatedAt: now,
        });
        assignmentCount++;
      }
    }

    // 9. Finance — membership plans, subscriptions, monthly payments, and
    //    non-membership income/expense transactions. This is what drives the
    //    "Miembros activos" and "Balance Financiero" dashboard cards.
    const reviewer = createdBy; // demo admin/trainer used as reviewer/recorder
    const nowDate = new Date();
    const currentPeriod = monthPeriod(nowDate);
    const monthStart = startOfMonth(nowDate);

    // 9a. Membership plans.
    const planRecords: Array<{ id: Id<"membershipPlans">; priceArs: number }> =
      [];
    for (const p of MEMBERSHIP_PLAN_DEFS) {
      const planId = await ctx.db.insert("membershipPlans", {
        organizationId: args.organizationId,
        name: p.name,
        description: `${p.name} (demo)`,
        billingMode: "calendar",
        priceArs: p.priceArs,
        weeklyClassLimit: p.weeklyClassLimit,
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 10,
        isActive: true,
        createdBy: reviewer,
        createdAt: windowStart,
        updatedAt: now,
      });
      planRecords.push({ id: planId, priceArs: p.priceArs });
    }

    // 9b. Subscriptions + monthly payments.
    // Activations are staggered across the last 6 months so the "Miembros
    // activos" chart shows a growth curve. Each subscription gets one payment
    // per billing period from its activation month to the current month.
    let subscriptionCount = 0;
    let paymentCount = 0;

    for (const m of members) {
      const plan = pick(planRecords);
      const monthsAgo = rand(6); // 0..5
      const activMonth = addMonths(monthStart, -monthsAgo);
      const activatedAt =
        activMonth.getTime() + rand(18) * DAY_MS + 10 * 60 * 60 * 1000;

      // ~8% churned (only if they were around for a couple of months).
      const churned = monthsAgo >= 2 && Math.random() < 0.08;
      const cancelledAt = churned
        ? Math.min(now - rand(40) * DAY_MS, now)
        : undefined;

      const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
        organizationId: args.organizationId,
        userId: m.externalId,
        planId: plan.id,
        status: churned ? "cancelled" : "active",
        activatedAt,
        cancelledAt,
        createdAt: activatedAt,
        updatedAt: now,
      });
      subscriptionCount++;

      const lastMonth =
        churned && cancelledAt ? startOfMonth(new Date(cancelledAt)) : monthStart;
      for (
        let cursor = new Date(activMonth);
        cursor.getTime() <= lastMonth.getTime();
        cursor = addMonths(cursor, 1)
      ) {
        const period = monthPeriod(cursor);
        const isCurrent = period === currentPeriod;
        const r = Math.random();

        // Current period intentionally has some unpaid/in-review rows so the
        // Cobranza % is < 100 and "Pendientes" is non-zero. Past periods are
        // almost all paid so history looks healthy.
        let status: "approved" | "in_review" | "pending" | "missing";
        if (isCurrent) {
          status =
            r < 0.72
              ? "approved"
              : r < 0.84
                ? "in_review"
                : r < 0.94
                  ? "pending"
                  : "missing";
        } else {
          status = r < 0.93 ? "approved" : r < 0.97 ? "in_review" : "pending";
        }
        if (status === "missing") continue; // no payment row this period

        const periodStart = cursor.getTime();
        const proofUploadedAt =
          periodStart + rand(9) * DAY_MS + 12 * 60 * 60 * 1000;
        const method = pick(PAYMENT_METHODS);
        const approved = status === "approved";

        await ctx.db.insert("planPayments", {
          organizationId: args.organizationId,
          userId: m.externalId,
          subscriptionId,
          planId: plan.id,
          billingPeriod: period,
          amountArs: plan.priceArs,
          totalAmountArs: plan.priceArs,
          paymentMethod: method,
          recordedBy: method === "cash" && approved ? reviewer : undefined,
          // pending = awaiting proof; in_review = proof up, no review yet.
          proofUploadedAt: status === "pending" ? undefined : proofUploadedAt,
          status: approved ? "approved" : status,
          reviewedBy: approved ? reviewer : undefined,
          reviewedAt: approved
            ? proofUploadedAt + (1 + rand(6)) * 60 * 60 * 1000
            : undefined,
          createdAt: periodStart,
          updatedAt: approved ? proofUploadedAt + 60 * 60 * 1000 : now,
        });
        paymentCount++;
      }
    }

    // 9c. Non-membership finance transactions over the last 6 months. One month
    // gets a large equipment expense so the profitability mini-chart shows a
    // red (negative) bar among the green ones.
    let transactionCount = 0;
    for (let k = 5; k >= 0; k--) {
      const mDate = addMonths(monthStart, -k);
      const period = monthPeriod(mDate);
      const occurredOn = `${period}-15`;
      const createdAtMs = mDate.getTime() + 15 * DAY_MS;

      // 1–2 income rows.
      const incomeRows = 1 + rand(2);
      for (let i = 0; i < incomeRows; i++) {
        const def = pick(FINANCE_INCOME_DEFS);
        await ctx.db.insert("financeTransactions", {
          organizationId: args.organizationId,
          type: "income",
          title: def.title,
          category: def.category,
          amountArs: def.min + rand(def.max - def.min),
          occurredOn,
          period,
          paymentMethod: "cash",
          source: "manual",
          status: "active",
          createdBy: reviewer,
          createdAt: createdAtMs,
          updatedAt: now,
        });
        transactionCount++;
      }

      // Baseline monthly expenses.
      for (const def of FINANCE_EXPENSE_DEFS) {
        await ctx.db.insert("financeTransactions", {
          organizationId: args.organizationId,
          type: "expense",
          title: def.title,
          category: def.category,
          amountArs: def.amountArs,
          occurredOn,
          period,
          paymentMethod: "bank_transfer",
          source: "manual",
          status: "active",
          createdBy: reviewer,
          createdAt: createdAtMs,
          updatedAt: now,
        });
        transactionCount++;
      }

      // A one-off big expense a few months back → negative net that month.
      if (k === 3) {
        await ctx.db.insert("financeTransactions", {
          organizationId: args.organizationId,
          type: "expense",
          title: "Compra de equipamiento",
          category: "Equipamiento",
          amountArs: 450000,
          occurredOn,
          period,
          paymentMethod: "bank_transfer",
          source: "manual",
          status: "active",
          createdBy: reviewer,
          createdAt: createdAtMs,
          updatedAt: now,
        });
        transactionCount++;
      }
    }

    return {
      organizationId: args.organizationId,
      users: roleSequence.length,
      admins: admins.length,
      trainers: trainers.length,
      members: members.length,
      classes: createdClasses.length,
      schedules: scheduleCount,
      reservations: reservationCount,
      planifications: PLAN_TEMPLATES.length,
      assignments: assignmentCount,
      membershipPlans: planRecords.length,
      subscriptions: subscriptionCount,
      payments: paymentCount,
      financeTransactions: transactionCount,
    };
  },
});

// --- Teardown --------------------------------------------------------------

export const clearDemoOrg = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await clearDemo(ctx, args.organizationId);
  },
});

/**
 * Delete every demo-tagged row in the org (children first). Only rows whose
 * linked Clerk-ID string starts with `demo_` are touched — real data is safe.
 */
async function clearDemo(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const deleted = {
    assignments: 0,
    planifications: 0,
    reservations: 0,
    schedules: 0,
    classes: 0,
    payments: 0,
    subscriptions: 0,
    membershipPlans: 0,
    financeTransactions: 0,
    memberships: 0,
    users: 0,
  };

  // Demo planifications (matched by createdBy prefix) + their children.
  const planifications = await ctx.db
    .query("planifications")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const plan of planifications) {
    if (!isDemoId(plan.createdBy)) continue;

    const assignments = await ctx.db
      .query("planificationAssignments")
      .withIndex("by_planification", (q) =>
        q.eq("planificationId", plan._id),
      )
      .collect();
    for (const a of assignments) {
      await ctx.db.delete(a._id);
      deleted.assignments++;
    }

    const days = await ctx.db
      .query("workoutDays")
      .withIndex("by_planification", (q) =>
        q.eq("planificationId", plan._id),
      )
      .collect();
    for (const d of days) await ctx.db.delete(d._id);

    const weeks = await ctx.db
      .query("workoutWeeks")
      .withIndex("by_planification", (q) =>
        q.eq("planificationId", plan._id),
      )
      .collect();
    for (const w of weeks) await ctx.db.delete(w._id);

    const revisions = await ctx.db
      .query("planificationRevisions")
      .withIndex("by_planification", (q) =>
        q.eq("planificationId", plan._id),
      )
      .collect();
    for (const r of revisions) await ctx.db.delete(r._id);

    await ctx.db.delete(plan._id);
    deleted.planifications++;
  }

  // Demo reservations (matched by demo userId).
  const reservations = await ctx.db
    .query("classReservations")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const r of reservations) {
    if (!isDemoId(r.userId)) continue;
    await ctx.db.delete(r._id);
    deleted.reservations++;
  }

  // Demo classes (matched by createdBy prefix) + their schedules.
  const classes = await ctx.db
    .query("classes")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const cls of classes) {
    if (!isDemoId(cls.createdBy)) continue;

    const schedules = await ctx.db
      .query("classSchedules")
      .withIndex("by_class", (q) => q.eq("classId", cls._id))
      .collect();
    for (const s of schedules) {
      await ctx.db.delete(s._id);
      deleted.schedules++;
    }

    await ctx.db.delete(cls._id);
    deleted.classes++;
  }

  // Demo finance data: payments → subscriptions → plans, plus transactions.
  const payments = await ctx.db
    .query("planPayments")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const p of payments) {
    if (!isDemoId(p.userId)) continue;
    await ctx.db.delete(p._id);
    deleted.payments++;
  }

  const subscriptions = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const s of subscriptions) {
    if (!isDemoId(s.userId)) continue;
    await ctx.db.delete(s._id);
    deleted.subscriptions++;
  }

  const membershipPlans = await ctx.db
    .query("membershipPlans")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const p of membershipPlans) {
    if (!isDemoId(p.createdBy)) continue;
    await ctx.db.delete(p._id);
    deleted.membershipPlans++;
  }

  const transactions = await ctx.db
    .query("financeTransactions")
    .withIndex("by_organization_period", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const t of transactions) {
    if (!isDemoId(t.createdBy)) continue;
    await ctx.db.delete(t._id);
    deleted.financeTransactions++;
  }

  // Demo memberships + user records.
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  for (const m of memberships) {
    if (!isDemoId(m.userId)) continue;

    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", m.userId))
      .first();
    if (user) {
      await ctx.db.delete(user._id);
      deleted.users++;
    }

    await ctx.db.delete(m._id);
    deleted.memberships++;
  }

  return deleted;
}
