/**
 * Test-fixture seeding: one organization on the PRO plan with a sign-in-able
 * admin.
 *
 * Exists so the member-payments sandbox matrix (two gyms, two seller accounts,
 * real members) can be set up in seconds rather than clicked through. It is an
 * internal action, so it is reachable from `npx convex run` and the dashboard
 * but never from a client, and `CLERK_SECRET_KEY` never leaves the backend.
 *
 * Not for production. It creates a real Clerk user with a password you choose.
 */

import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { upsertProPlan } from "./appBillingPlans";
import { MEMBER_PAYMENT_DEFAULTS } from "./organizationSettings";

const CLERK_API_BASE = "https://api.clerk.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function clerkRequest(
  path: string,
  init: { method: string; body?: unknown },
): Promise<any> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Missing CLERK_SECRET_KEY");

  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body?.errors?.[0]?.long_message ??
      body?.errors?.[0]?.message ??
      `Clerk request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

/**
 * Create the admin in Clerk, or reuse the existing one with that address.
 *
 * Reusing rather than failing means the script can be run repeatedly — once
 * per gym — without having to invent a new address each time.
 */
async function ensureClerkUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ userId: string; created: boolean }> {
  const existing = await clerkRequest(
    `/users?email_address=${encodeURIComponent(params.email)}&limit=1`,
    { method: "GET" },
  );

  if (Array.isArray(existing) && existing.length > 0) {
    return { userId: existing[0].id, created: false };
  }

  const created = await clerkRequest("/users", {
    method: "POST",
    body: {
      email_address: [params.email],
      password: params.password,
      first_name: params.firstName,
      last_name: params.lastName,
      // Test fixtures use simple, shared passwords on purpose; Clerk's
      // breach and strength checks would reject them.
      skip_password_checks: true,
      skip_password_requirement: false,
    },
  });

  return { userId: created.id, created: true };
}

/**
 * Create a PRO organization with the given admin, ready for member payments.
 *
 * Idempotent per email at the Clerk level; each run creates a *new*
 * organization, which is what the two-gym isolation scenario needs.
 */
export const createTestOrganization = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    organizationName: v.optional(v.string()),
    adminFirstName: v.optional(v.string()),
    adminLastName: v.optional(v.string()),
    /** Only used when the PRO plan does not exist yet. */
    proPriceArs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    organizationId: Id<"organizations">;
    organizationName: string;
    slug: string;
    clerkUserId: string;
    clerkUserCreated: boolean;
    email: string;
  }> => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("A valid email is required");
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const organizationName = args.organizationName?.trim() || "Gimnasio de prueba";
    const firstName = args.adminFirstName?.trim() || "Admin";
    const lastName = args.adminLastName?.trim() || "Prueba";

    const { userId, created } = await ensureClerkUser({
      email,
      password: args.password,
      firstName,
      lastName,
    });

    const result = await ctx.runMutation(
      internal.seedTestOrg.createTestOrganizationRecords,
      {
        clerkUserId: userId,
        email,
        fullName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        organizationName,
        proPriceArs: args.proPriceArs,
      },
    );

    return {
      ...result,
      clerkUserId: userId,
      clerkUserCreated: created,
      email,
    };
  },
});

/** The database half: organization, settings, admin membership, PRO billing. */
export const createTestOrganizationRecords = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    organizationName: v.string(),
    proPriceArs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // A unique slug, so running this repeatedly gives distinct gyms.
    const baseSlug = slugify(args.organizationName) || "gimnasio-prueba";
    let slug = baseSlug;
    let suffix = 1;
    while (
      await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first()
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const organizationId = await ctx.db.insert("organizations", {
      name: args.organizationName,
      slug,
      email: args.email,
      timezone: "America/Argentina/Buenos_Aires",
      createdAt: now,
      updatedAt: now,
    });

    // Bank transfer on, Mercado Pago off: the admin turns it on themselves
    // after connecting an account, which is the flow being tested.
    await ctx.db.insert("organizationSettings", {
      organizationId,
      planificationsEnabled: true,
      classesEnabled: true,
      financeEnabled: true,
      memberAutoApproval: false,
      memberPayments: { ...MEMBER_PAYMENT_DEFAULTS },
      createdAt: now,
      updatedAt: now,
    });

    // Reuse the Convex user row when the same admin seeds a second gym.
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.clerkUserId))
      .first();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        activeOrganizationId: organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        externalId: args.clerkUserId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        fullName: args.fullName,
        // Skip onboarding: this account exists to test payments.
        onboardingStep1Completed: true,
        onboardingCompleted: true,
        activeOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: args.clerkUserId,
      role: "admin",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // PRO, because member payments are a PRO entitlement. An existing PRO row
    // is used as-is so seeding never rewrites a configured price.
    let proPlan = await ctx.db
      .query("appBillingPlans")
      .withIndex("by_key", (q) => q.eq("key", "pro"))
      .first();

    if (!proPlan) {
      await upsertProPlan(ctx, args.proPriceArs ?? 50_000);
      proPlan = await ctx.db
        .query("appBillingPlans")
        .withIndex("by_key", (q) => q.eq("key", "pro"))
        .first();
    }
    if (!proPlan) throw new Error("Could not resolve the PRO billing plan");

    await ctx.db.insert("organizationBillingSubscriptions", {
      organizationId,
      billingPlanId: proPlan._id,
      source: "manual",
      externalReference: `seed_${organizationId}`,
      status: "authorized",
      entitlementStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * DAY_MS,
      createdBy: args.clerkUserId,
      createdAt: now,
      updatedAt: now,
    });

    const memberPayments = proPlan.entitlements.memberPayments;

    return {
      organizationId,
      organizationName: args.organizationName,
      slug,
      // Surfaced so the caller knows whether member Mercado Pago is actually
      // enabled on this deployment's PRO plan, rather than finding out later.
      proMemberPaymentsEnabled: memberPayments?.mercadoPagoEnabled ?? false,
    };
  },
});
