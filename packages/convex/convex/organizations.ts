import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireAdmin,
  requireCurrentOrganizationMembership,
} from "./permissions";

type StaffInviteRole = "admin" | "trainer";

function normalizeRole(value: string): StaffInviteRole | null {
  if (value === "admin" || value === "trainer") {
    return value;
  }
  return null;
}

type InvitationValidationReason =
  | "invalid"
  | "expired"
  | "revoked"
  | "accepted";

function getInvitationRoleLabel(role: StaffInviteRole) {
  return role === "admin" ? "Admin" : "Entrenador";
}

async function resolveLogoUrl(
  ctx: any,
  logoStorageId: unknown,
  logoUrl: string | undefined,
) {
  if (logoStorageId) {
    try {
      const storageUrl = await ctx.storage.getUrl(logoStorageId);
      if (storageUrl) return storageUrl;
    } catch {
      // Ignore stale storage references and use legacy value.
    }
  }
  return logoUrl ?? "";
}

export const getCurrentOrganization = query({
  args: {},
  handler: async (ctx) => {
    try {
      const membership = await requireCurrentOrganizationMembership(ctx);
      const organization = await ctx.db.get(membership.organizationId);
      if (!organization) {
        return null;
      }
      const resolvedLogoUrl = await resolveLogoUrl(
        ctx,
        organization.logoStorageId,
        organization.logoUrl,
      );
      return {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        address: organization.address ?? "",
        phone: organization.phone ?? "",
        email: organization.email ?? "",
        logoUrl: resolvedLogoUrl,
        logoStorageId: organization.logoStorageId ?? null,
        role: membership.role,
      };
    } catch {
      return null;
    }
  },
});

export const generateOrganizationLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateCurrentOrganization = mutation({
  args: {
    name: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        address: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        logoStorageId: v.optional(v.id("_storage")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const organization = await ctx.db.get(membership.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const patch: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      logoStorageId?: Id<"_storage">;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (typeof args.name === "string") {
      patch.name = args.name.trim();
    }
    if (args.metadata?.address !== undefined) {
      patch.address = args.metadata.address.trim();
    }
    if (args.metadata?.phone !== undefined) {
      patch.phone = args.metadata.phone.trim();
    }
    if (args.metadata?.email !== undefined) {
      patch.email = args.metadata.email.trim();
    }
    if (args.metadata?.logoStorageId !== undefined) {
      patch.logoStorageId = args.metadata.logoStorageId;
      if (
        organization.logoStorageId &&
        organization.logoStorageId !== args.metadata.logoStorageId
      ) {
        await ctx.storage.delete(organization.logoStorageId);
      }
    }

    await ctx.db.patch(organization._id, patch);
    return { success: true };
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    if (membership.role !== "admin") {
      return [];
    }

    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organization_status", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("status", "pending"),
      )
      .collect();

    return invitations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((invitation) => ({
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        roleLabel: invitation.role === "admin" ? "Admin" : "Entrenador",
        status: invitation.status,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
      }));
  },
});

export const getInvitationEmailPayloadInternal = internalQuery({
  args: {
    invitationId: v.id("organizationInvitations"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    const organization = await ctx.db.get(invitation.organizationId);
    if (!organization) {
      return null;
    }

    const inviter = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", invitation.invitedBy),
      )
      .first();

    const inviterFallback = [inviter?.firstName, inviter?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const inviterName = (inviter?.fullName ?? inviterFallback) || undefined;

    return {
      invitationId: invitation._id,
      email: invitation.email,
      role: invitation.role,
      roleLabel: getInvitationRoleLabel(invitation.role),
      organizationName: organization.name,
      inviterName,
      invitedAt: invitation.createdAt,
    };
  },
});

export const getInvitationByTokenHashInternal = internalQuery({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (!invitation) {
      return null;
    }

    const organization = await ctx.db.get(invitation.organizationId);
    return {
      invitation,
      organizationName: organization?.name ?? null,
    };
  },
});

export const attachInvitationTokenInternal = internalMutation({
  args: {
    invitationId: v.id("organizationInvitations"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status !== "pending") {
      return { attached: false as const };
    }

    await ctx.db.patch(args.invitationId, {
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
    return { attached: true as const };
  },
});

export const acceptInvitationInternal = internalMutation({
  args: {
    invitationId: v.id("organizationInvitations"),
    userId: v.string(),
    userEmail: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }
    if (invitation.status === "revoked") {
      throw new Error("La invitacion fue revocada.");
    }
    if (invitation.status === "accepted") {
      throw new Error("La invitacion ya fue aceptada.");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is not pending");
    }
    if (!invitation.tokenHash) {
      throw new Error("La invitacion no tiene un token valido.");
    }
    if (
      typeof invitation.expiresAt === "number" &&
      Date.now() > invitation.expiresAt
    ) {
      throw new Error("La invitacion expiro.");
    }
    if (invitation.email !== args.userEmail) {
      throw new Error(
        "Debes ingresar con el email al que se envio la invitacion.",
      );
    }

    const now = Date.now();
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) =>
        q
          .eq("organizationId", invitation.organizationId)
          .eq("userId", args.userId),
      )
      .first();

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, {
        role: invitation.role,
        status: "active",
        lastActiveAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationMemberships", {
        organizationId: invitation.organizationId,
        userId: args.userId,
        role: invitation.role,
        status: "active",
        joinedAt: now,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.userId))
      .first();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        firstName: existingUser.firstName ?? args.firstName,
        lastName: existingUser.lastName ?? args.lastName,
        fullName: existingUser.fullName ?? args.fullName,
        email: existingUser.email ?? args.userEmail,
        imageUrl: existingUser.imageUrl ?? args.imageUrl,
        username: existingUser.username ?? args.username,
        activeOrganizationId: invitation.organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        externalId: args.userId,
        firstName: args.firstName,
        lastName: args.lastName,
        fullName: args.fullName,
        email: args.userEmail,
        imageUrl: args.imageUrl,
        username: args.username,
        onboardingCompleted: false,
        activeOrganizationId: invitation.organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: args.userId,
      updatedAt: now,
    });

    return {
      success: true as const,
      organizationId: invitation.organizationId,
      role: invitation.role,
    };
  },
});

export const createInvitation = mutation({
  args: {
    email: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const role = normalizeRole(args.role);
    if (!role) {
      throw new Error("Invalid role");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const now = Date.now();

    const existingPending = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organization_email", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("email", normalizedEmail),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existingPending) {
      throw new Error("Ya existe una invitacion pendiente para este email");
    }

    const invitationId = await ctx.db.insert("organizationInvitations", {
      organizationId: membership.organizationId,
      email: normalizedEmail,
      role,
      status: "pending",
      invitedBy: membership.userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.organizationsNode.sendStaffInvitationEmail,
      {
        invitationId,
      },
    );

    return {
      invitation: {
        id: invitationId,
        email: normalizedEmail,
        role,
        roleLabel: role === "admin" ? "Admin" : "Entrenador",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    };
  },
});

export const revokeInvitation = mutation({
  args: {
    invitationId: v.id("organizationInvitations"),
  },
  handler: async (ctx, args) => {
    const membership = await requireCurrentOrganizationMembership(ctx);
    await requireAdmin(ctx, membership.organizationId);

    const invitation = await ctx.db.get(args.invitationId);
    if (
      !invitation ||
      invitation.organizationId !== membership.organizationId
    ) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    await ctx.db.patch(invitation._id, {
      status: "revoked",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const validateInvitationToken: ReturnType<typeof action> = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      return {
        valid: false as const,
        reason: "invalid" as InvitationValidationReason,
      };
    }

    const tokenHash = await ctx.runAction(
      internal.organizationsNode.hashInvitationToken,
      {
        token,
      },
    );

    const result = await ctx.runQuery(
      internal.organizations.getInvitationByTokenHashInternal,
      {
        tokenHash,
      },
    );

    if (!result) {
      return {
        valid: false as const,
        reason: "invalid" as InvitationValidationReason,
      };
    }

    if (result.invitation.status === "revoked") {
      return {
        valid: false as const,
        reason: "revoked" as InvitationValidationReason,
      };
    }
    if (result.invitation.status === "accepted") {
      return {
        valid: false as const,
        reason: "accepted" as InvitationValidationReason,
      };
    }
    if (
      typeof result.invitation.expiresAt === "number" &&
      Date.now() > result.invitation.expiresAt
    ) {
      return {
        valid: false as const,
        reason: "expired" as InvitationValidationReason,
      };
    }

    return {
      valid: true as const,
      reason: null,
      invitation: {
        email: result.invitation.email,
        role: result.invitation.role,
        roleLabel: getInvitationRoleLabel(result.invitation.role),
        organizationName: result.organizationName ?? "Organizacion",
      },
    };
  },
});

export const acceptInvitationByToken: ReturnType<typeof action> = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Debes iniciar sesion para aceptar la invitacion.");
    }

    const normalizedEmail = identity.email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Tu cuenta no tiene email disponible en Clerk.");
    }

    const token = args.token.trim();
    if (!token) {
      throw new Error("Token de invitacion invalido.");
    }

    const tokenHash = await ctx.runAction(
      internal.organizationsNode.hashInvitationToken,
      {
        token,
      },
    );
    const invitationData = await ctx.runQuery(
      internal.organizations.getInvitationByTokenHashInternal,
      { tokenHash },
    );
    if (!invitationData) {
      throw new Error("La invitacion no existe o no es valida.");
    }

    if (invitationData.invitation.status === "revoked") {
      throw new Error("La invitacion fue revocada.");
    }
    if (invitationData.invitation.status === "accepted") {
      return {
        success: true,
        organizationId: invitationData.invitation.organizationId,
        role: invitationData.invitation.role,
      };
    }
    if (
      typeof invitationData.invitation.expiresAt === "number" &&
      Date.now() > invitationData.invitation.expiresAt
    ) {
      throw new Error("La invitacion expiro.");
    }
    if (invitationData.invitation.email !== normalizedEmail) {
      throw new Error(
        "Debes ingresar con el email al que se envio la invitacion.",
      );
    }

    return await ctx.runMutation(
      internal.organizations.acceptInvitationInternal,
      {
        invitationId: invitationData.invitation._id,
        userId: identity.subject,
        userEmail: normalizedEmail,
        firstName: identity.givenName ?? undefined,
        lastName: identity.familyName ?? undefined,
        fullName: identity.name ?? undefined,
        imageUrl: identity.pictureUrl ?? undefined,
        username: identity.nickname ?? undefined,
      },
    );
  },
});
