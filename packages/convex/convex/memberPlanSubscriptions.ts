import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
  requireActiveOrgContext,
  tryActiveOrgContext,
} from "./permissions";

async function getFamilyGroupSubscriptions(
  ctx: { db: any },
  subscription: {
    _id: Id<"memberPlanSubscriptions">;
    organizationId: Id<"organizations">;
    familyParentSubscriptionId?: Id<"memberPlanSubscriptions">;
    status: "active" | "suspended" | "cancelled";
  },
) {
  const primarySubscription = subscription.familyParentSubscriptionId
    ? await ctx.db.get(subscription.familyParentSubscriptionId)
    : subscription;

  if (!primarySubscription) {
    throw new Error("Suscripción familiar principal no encontrada");
  }

  const childSubscriptions = await ctx.db
    .query("memberPlanSubscriptions")
    .withIndex("by_family_parent", (q: any) =>
      q.eq("familyParentSubscriptionId", primarySubscription._id),
    )
    .collect();

  const familySubscriptions = [primarySubscription, ...childSubscriptions].filter(
    (item) => item.status !== "cancelled",
  );

  return {
    primarySubscription,
    familySubscriptions,
    memberCount: familySubscriptions.length,
  };
}

/**
 * Get the current user's active or suspended subscription (if any).
 * Returns the subscription enriched with plan details.
 */
export const getMySubscription = query({
  args: {},
  handler: async (ctx) => {
    const orgCtx = await tryActiveOrgContext(ctx);
    if (!orgCtx) return null;

    const { identity, membership } = orgCtx;

    const subscription = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (!subscription) return null;

    const plan = await ctx.db.get(subscription.planId);
    return { ...subscription, plan };
  },
});

/**
 * List all subscriptions in the org (admin/trainer only).
 * Enriched with user and plan details.
 */
export const getByOrganization = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    let subscriptions = args.status
      ? await ctx.db
          .query("memberPlanSubscriptions")
          .withIndex("by_organization_status", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("memberPlanSubscriptions")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .collect();

    return await Promise.all(
      subscriptions.map(async (sub) => {
        const [plan, user, familySubscriptions] = await Promise.all([
          ctx.db.get(sub.planId),
          ctx.db
            .query("users")
            .withIndex("by_externalId", (q) => q.eq("externalId", sub.userId))
            .first(),
          sub.familyParentSubscriptionId
            ? Promise.resolve([])
            : getFamilyGroupSubscriptions(ctx, sub).then(
                (result) => result.familySubscriptions,
              ),
        ]);
        const { memberCount, primarySubscription } =
          await getFamilyGroupSubscriptions(ctx, sub);
        const familyAssociatedNames = await Promise.all(
          familySubscriptions
            .filter((item) => item._id !== primarySubscription._id)
            .map(async (item) => {
              const relatedUser = await ctx.db
                .query("users")
                .withIndex("by_externalId", (q) =>
                  q.eq("externalId", item.userId),
                )
                .first();
              return relatedUser?.fullName ?? relatedUser?.email ?? item.userId;
            }),
        );
        return {
          ...sub,
          plan,
          billingSubscriptionId: primarySubscription._id,
          coveredMemberCount: memberCount,
          familyAssociatedNames,
          payableAmountArs: plan ? plan.priceArs * memberCount : 0,
          userFullName: user?.fullName ?? user?.email ?? sub.userId,
        };
      }),
    );
  },
});

export const getActiveFamilyGroups = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const subscriptions = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();

    const familyHeads = subscriptions.filter(
      (sub) =>
        !sub.familyParentSubscriptionId &&
        sub.status !== "cancelled" &&
        (sub.familyMemberUserIds?.length ?? 0) >= 0,
    );

    const results = await Promise.all(
      familyHeads.map(async (sub) => {
        const [plan, user, childSubscriptions] = await Promise.all([
          ctx.db.get(sub.planId),
          ctx.db
            .query("users")
            .withIndex("by_externalId", (q) => q.eq("externalId", sub.userId))
            .first(),
          ctx.db
            .query("memberPlanSubscriptions")
            .withIndex("by_family_parent", (q) =>
              q.eq("familyParentSubscriptionId", sub._id),
            )
            .filter((q) => q.neq(q.field("status"), "cancelled"))
            .collect(),
        ]);

        if (!plan?.isFamilyPlan) return null;

        const associatedNames = await Promise.all(
          childSubscriptions.map(async (child) => {
            const childUser = await ctx.db
              .query("users")
              .withIndex("by_externalId", (q) =>
                q.eq("externalId", child.userId),
              )
              .first();
            return childUser?.fullName ?? childUser?.email ?? child.userId;
          }),
        );

        return {
          subscriptionId: sub._id,
          userId: sub.userId,
          headName: user?.fullName ?? user?.email ?? sub.userId,
          planId: sub.planId,
          planName: plan.name,
          associatedNames,
          coveredMemberCount: 1 + childSubscriptions.length,
          payableAmountArs: plan.priceArs * (1 + childSubscriptions.length),
        };
      }),
    );

    return results.filter(
      (
        result,
      ): result is {
        subscriptionId: Id<"memberPlanSubscriptions">;
        userId: string;
        headName: string;
        planId: Id<"membershipPlans">;
        planName: string;
        associatedNames: string[];
        coveredMemberCount: number;
        payableAmountArs: number;
      } => result !== null,
    );
  },
});

/**
 * Member activates a plan. Creates a subscription and a pending payment for the current period.
 */
export const activate = mutation({
  args: {
    planId: v.id("membershipPlans"),
    advanceMonths: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      throw new Error("Solo los miembros pueden activar un plan");
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!plan.isActive) {
      throw new Error("Este plan ya no está disponible");
    }

    // Validate advance months against configured discounts
    const advanceMonths = args.advanceMonths ?? 1;
    if (advanceMonths > 1) {
      const discountTier = plan.advancePaymentDiscounts?.find(
        (d) => d.months === advanceMonths,
      );
      if (!discountTier) {
        throw new Error(
          `No hay descuento configurado para ${advanceMonths} meses`,
        );
      }
    }

    // Check no existing active/suspended subscription
    const existing = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (existing) {
      throw new Error(
        "Ya tenés un plan activo. Cancelalo antes de activar otro.",
      );
    }

    const now = Date.now();
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: identity.subject,
      planId: args.planId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Create payment records
    if (advanceMonths > 1) {
      const discountTier = plan.advancePaymentDiscounts!.find(
        (d) => d.months === advanceMonths,
      )!;
      await createAdvancePayments(ctx, {
        organizationId: membership.organizationId,
        userId: identity.subject,
        subscriptionId,
        plan,
        months: advanceMonths,
        discountPercentage: discountTier.discountPercentage,
      });
    } else {
      // Single month — standard flow
      await createPaymentForCurrentPeriod(ctx, {
        organizationId: membership.organizationId,
        userId: identity.subject,
        subscriptionId,
        plan,
      });
    }

    return subscriptionId;
  },
});

/**
 * Admin/trainer assigns a plan to a member. Creates subscription + pending payment.
 */
export const assignToMember = mutation({
  args: {
    userId: v.string(),
    planId: v.id("membershipPlans"),
    familyMemberUserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    // Verify the target user is a member of this org
    const targetMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!targetMembership) {
      throw new Error("El usuario no es miembro activo de esta organización");
    }
    if (targetMembership.role !== "member") {
      throw new Error("Solo se puede asignar un plan a un miembro");
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!plan.isActive) {
      throw new Error("Este plan no está activo");
    }

    const familyMemberUserIds = Array.from(
      new Set(
        (args.familyMemberUserIds ?? []).filter((userId) => userId !== args.userId),
      ),
    );

    if (!plan.isFamilyPlan && familyMemberUserIds.length > 0) {
      throw new Error("Solo podés asociar miembros en planes familiares");
    }

    // Check no existing active/suspended subscription
    const existing = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", args.userId),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    if (existing) {
      throw new Error(
        "El miembro ya tiene un plan activo. Cancelalo antes de asignar otro.",
      );
    }

    for (const familyUserId of familyMemberUserIds) {
      const familyMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", familyUserId),
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (!familyMembership || familyMembership.role !== "member") {
        throw new Error("Todos los asociados deben ser miembros activos");
      }

      const existingFamilySubscription = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", familyUserId),
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .first();

      if (existingFamilySubscription) {
        throw new Error(
          "Uno de los miembros asociados ya tiene un plan activo o suspendido",
        );
      }
    }

    const now = Date.now();
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: args.userId,
      planId: args.planId,
      familyHeadUserId: plan.isFamilyPlan ? args.userId : undefined,
      familyMemberUserIds:
        plan.isFamilyPlan && familyMemberUserIds.length
          ? familyMemberUserIds
          : undefined,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (plan.isFamilyPlan && familyMemberUserIds.length > 0) {
      for (const familyUserId of familyMemberUserIds) {
        await ctx.db.insert("memberPlanSubscriptions", {
          organizationId: membership.organizationId,
          userId: familyUserId,
          planId: args.planId,
          familyHeadUserId: args.userId,
          familyParentSubscriptionId: subscriptionId,
          status: "active",
          activatedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Create payment record for current billing period
    await createPaymentForCurrentPeriod(ctx, {
      organizationId: membership.organizationId,
      userId: args.userId,
      subscriptionId,
      plan,
    });

    return subscriptionId;
  },
});

export const associateToFamilyGroup = mutation({
  args: {
    userId: v.string(),
    parentSubscriptionId: v.id("memberPlanSubscriptions"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdminOrTrainer(ctx, membership.organizationId);

    const [targetMembership, existingSubscription, parentSubscription] =
      await Promise.all([
        ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("userId", args.userId),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first(),
        ctx.db
          .query("memberPlanSubscriptions")
          .withIndex("by_organization_user", (q) =>
            q
              .eq("organizationId", membership.organizationId)
              .eq("userId", args.userId),
          )
          .filter((q) => q.neq(q.field("status"), "cancelled"))
          .first(),
        ctx.db.get(args.parentSubscriptionId),
      ]);

    if (!targetMembership || targetMembership.role !== "member") {
      throw new Error("El usuario debe ser un miembro activo");
    }
    if (existingSubscription) {
      throw new Error("El miembro ya tiene un plan activo o suspendido");
    }
    if (
      !parentSubscription ||
      parentSubscription.organizationId !== membership.organizationId
    ) {
      throw new Error("Grupo familiar no encontrado");
    }
    if (parentSubscription.familyParentSubscriptionId) {
      throw new Error("Debés seleccionar una suscripción titular");
    }
    if (parentSubscription.status === "cancelled") {
      throw new Error("El grupo familiar no está activo");
    }
    if (parentSubscription.userId === args.userId) {
      throw new Error("El titular ya pertenece a ese grupo");
    }

    const plan = await ctx.db.get(parentSubscription.planId);
    if (!plan?.isFamilyPlan) {
      throw new Error("La suscripción seleccionada no corresponde a un plan familiar");
    }

    const activeChildSubscriptions = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_family_parent", (q) =>
        q.eq("familyParentSubscriptionId", parentSubscription._id),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .collect();

    const currentMemberIds = Array.from(
      new Set(activeChildSubscriptions.map((subscription) => subscription.userId)),
    );

    if (currentMemberIds.includes(args.userId)) {
      throw new Error("El miembro ya está asociado a este grupo familiar");
    }

    const now = Date.now();
    await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: args.userId,
      planId: parentSubscription.planId,
      familyHeadUserId: parentSubscription.userId,
      familyParentSubscriptionId: parentSubscription._id,
      status: parentSubscription.status === "suspended" ? "suspended" : "active",
      activatedAt: parentSubscription.activatedAt ?? now,
      suspendedAt:
        parentSubscription.status === "suspended" ? parentSubscription.suspendedAt ?? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(parentSubscription._id, {
      familyMemberUserIds: [...currentMemberIds, args.userId],
      updatedAt: now,
    });
  },
});

/**
 * Cancel a subscription (member cancels own, or admin cancels for any member).
 */
export const cancel = mutation({
  args: {
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    let subscription;
    if (args.subscriptionId) {
      // Admin cancelling for a specific member
      await requireAdminOrTrainer(ctx, membership.organizationId);
      subscription = await ctx.db.get(args.subscriptionId);
    } else {
      // Member cancelling their own
      subscription = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_user", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("userId", identity.subject),
        )
        .filter((q) => q.neq(q.field("status"), "cancelled"))
        .first();
    }

    if (!subscription) {
      throw new Error("Suscripción no encontrada");
    }
    if (subscription.organizationId !== membership.organizationId) {
      throw new Error("Suscripción no encontrada");
    }
    if (subscription.status === "cancelled") {
      throw new Error("La suscripción ya está cancelada");
    }

    // If member is cancelling, verify it's their own
    if (!args.subscriptionId && subscription.userId !== identity.subject) {
      throw new Error("No podés cancelar la suscripción de otro miembro");
    }

    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    const childSubscriptions = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_family_parent", (q) =>
        q.eq("familyParentSubscriptionId", subscription._id),
      )
      .collect();

    for (const childSubscription of childSubscriptions) {
      if (childSubscription.status === "cancelled") continue;
      await ctx.db.patch(childSubscription._id, {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      });
    }

    // Auto-revoke active bonification if subscription is cancelled
    const activeBonification = await ctx.db
      .query("planBonifications")
      .withIndex("by_subscription_status", (q) =>
        q.eq("subscriptionId", subscription._id).eq("status", "active"),
      )
      .first();
    if (activeBonification) {
      await ctx.db.patch(activeBonification._id, {
        status: "revoked",
        revokedAt: now,
        revokedBy: identity.subject,
        revokeReason: "Suscripción cancelada",
        updatedAt: now,
      });
    }
  },
});

/**
 * Member changes plan: cancels current and activates new one.
 */
export const changePlan = mutation({
  args: {
    newPlanId: v.id("membershipPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    if (membership.role !== "member") {
      throw new Error("Solo los miembros pueden cambiar de plan");
    }

    const newPlan = await ctx.db.get(args.newPlanId);
    if (!newPlan || newPlan.organizationId !== membership.organizationId) {
      throw new Error("Plan no encontrado");
    }
    if (!newPlan.isActive) {
      throw new Error("Este plan ya no está disponible");
    }

    // Find and cancel current subscription
    const current = await ctx.db
      .query("memberPlanSubscriptions")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("userId", identity.subject),
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .first();

    const now = Date.now();
    if (current) {
      if (current.planId === args.newPlanId) {
        throw new Error("Ya estás en este plan");
      }
      await ctx.db.patch(current._id, {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      });
    }

    // Create new subscription
    const subscriptionId = await ctx.db.insert("memberPlanSubscriptions", {
      organizationId: membership.organizationId,
      userId: identity.subject,
      planId: args.newPlanId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Create payment for current period
    await createPaymentForCurrentPeriod(ctx, {
      organizationId: membership.organizationId,
      userId: identity.subject,
      subscriptionId,
      plan: newPlan,
    });

    return subscriptionId;
  },
});

/**
 * Internal mutation: auto-suspend subscriptions with no approved payment
 * past the payment window.
 */
export const autoSuspendUnpaid = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all organizations
    const orgs = await ctx.db.query("organizations").collect();

    let suspendedCount = 0;

    for (const org of orgs) {
      const timezone =
        org.timezone && org.timezone.trim() !== "" ? org.timezone : "UTC";

      // Determine current date in org timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const currentDay = parseInt(partMap.day!, 10);
      const currentMonth = partMap.month!;
      const currentYear = partMap.year!;
      const billingPeriod = `${currentYear}-${currentMonth}`;

      // Get all active subscriptions for this org
      const activeSubscriptions = await ctx.db
        .query("memberPlanSubscriptions")
        .withIndex("by_organization_status", (q) =>
          q.eq("organizationId", org._id).eq("status", "active"),
        )
        .collect();

      for (const sub of activeSubscriptions) {
        if (sub.familyParentSubscriptionId) continue;

        const plan = await ctx.db.get(sub.planId);
        if (!plan) continue;

        // Plans with interest tiers never auto-suspend — they charge more instead
        if (plan.interestTiers && plan.interestTiers.length > 0) continue;

        // Skip bonified subscriptions — they never auto-suspend
        const activeBonification = await ctx.db
          .query("planBonifications")
          .withIndex("by_subscription_status", (q) =>
            q.eq("subscriptionId", sub._id).eq("status", "active"),
          )
          .first();
        if (activeBonification) continue;

        // Skip if payment window hasn't closed yet
        if (currentDay <= plan.paymentWindowEndDay) continue;

        // Grace period: skip if activated after the payment window closed this month
        // (i.e., member joined mid-month past the window)
        const activatedDate = new Date(sub.activatedAt);
        const activatedFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
        });
        const activatedParts = activatedFormatter.formatToParts(activatedDate);
        const activatedPartMap = Object.fromEntries(
          activatedParts.map((p) => [p.type, p.value]),
        );
        const activatedPeriod = `${activatedPartMap.year}-${activatedPartMap.month}`;

        if (activatedPeriod === billingPeriod) {
          // Member activated this month — check if they activated after the window closed
          const activatedDayFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            day: "2-digit",
          });
          const activatedDayParts =
            activatedDayFormatter.formatToParts(activatedDate);
          const activatedDay = parseInt(
            activatedDayParts.find((p) => p.type === "day")?.value ?? "0",
            10,
          );
          if (activatedDay > plan.paymentWindowEndDay) {
            continue; // Grace period: skip this month
          }
        }

        // Check if there's an approved payment for this period
        const approvedPayment = await ctx.db
          .query("planPayments")
          .withIndex("by_subscription_period", (q) =>
            q.eq("subscriptionId", sub._id).eq("billingPeriod", billingPeriod),
          )
          .filter((q) => q.eq(q.field("status"), "approved"))
          .first();

        if (!approvedPayment) {
          const now = Date.now();
          const { familySubscriptions } = await getFamilyGroupSubscriptions(
            ctx,
            sub,
          );
          for (const familySubscription of familySubscriptions) {
            if (familySubscription.status === "suspended") continue;
            await ctx.db.patch(familySubscription._id, {
              status: "suspended",
              suspendedAt: now,
              updatedAt: now,
            });
            suspendedCount++;
          }
        }
      }
    }

    return { suspendedCount };
  },
});

/**
 * Helper: create advance payment records for multiple months with a discount.
 * Each month gets its own payment record with the discounted per-month amount.
 */
async function createAdvancePayments(
  ctx: MutationCtx,
  params: {
    organizationId: Id<"organizations">;
    userId: string;
    subscriptionId: Id<"memberPlanSubscriptions">;
    plan: {
      _id: Id<"membershipPlans">;
      priceArs: number;
    };
    months: number;
    discountPercentage: number;
  },
) {
  const now = Date.now();
  const d = new Date(now);
  const { memberCount } = await getFamilyGroupSubscriptions(ctx, {
    _id: params.subscriptionId,
    organizationId: params.organizationId,
    status: "active",
  });
  const discountedPricePerMember = Math.round(
    params.plan.priceArs * (1 - params.discountPercentage / 100),
  );
  const discountedPrice = discountedPricePerMember * memberCount;

  for (let i = 0; i < params.months; i++) {
    const monthDate = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const billingPeriod = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

    // Check if a payment already exists for this period
    const existing = await ctx.db
      .query("planPayments")
      .withIndex("by_subscription_period", (q) =>
        q
          .eq("subscriptionId", params.subscriptionId)
          .eq("billingPeriod", billingPeriod),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("planPayments", {
        organizationId: params.organizationId,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        planId: params.plan._id,
        billingPeriod,
        amountArs: discountedPrice,
        totalAmountArs: discountedPrice,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Helper: create a payment record for the current billing period.
 */
async function createPaymentForCurrentPeriod(
  ctx: MutationCtx,
  params: {
    organizationId: Id<"organizations">;
    userId: string;
    subscriptionId: Id<"memberPlanSubscriptions">;
    plan: {
      _id: Id<"membershipPlans">;
      priceArs: number;
    };
  },
) {
  const now = Date.now();
  const d = new Date(now);
  const billingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const { memberCount } = await getFamilyGroupSubscriptions(ctx, {
    _id: params.subscriptionId,
    organizationId: params.organizationId,
    status: "active",
  });

  // Check if a payment already exists for this period and subscription
  const existing = await ctx.db
    .query("planPayments")
    .withIndex("by_subscription_period", (q) =>
      q
        .eq("subscriptionId", params.subscriptionId)
        .eq("billingPeriod", billingPeriod),
    )
    .first();

  if (existing) return existing._id;

  return await ctx.db.insert("planPayments", {
    organizationId: params.organizationId,
    userId: params.userId,
    subscriptionId: params.subscriptionId,
    planId: params.plan._id,
    billingPeriod,
    amountArs: params.plan.priceArs * memberCount,
    totalAmountArs: params.plan.priceArs * memberCount,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
}
