import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAuth,
  requireAdminOrTrainer,
  requireCurrentOrganizationMembership,
} from "./permissions";

/**
 * Compute folder path for breadcrumbs
 */
async function computeFolderPath(
  ctx: any,
  folderId: string | null,
): Promise<string> {
  if (!folderId) return "";

  const folder = await ctx.db.get(folderId);
  if (!folder) return "";

  if (!folder.parentId) {
    return folder.name;
  }

  const parentPath = await computeFolderPath(ctx, folder.parentId);
  return parentPath ? `${parentPath}/${folder.name}` : folder.name;
}

/**
 * Check if moving folder would create a circular reference
 */
async function wouldCreateCircularReference(
  ctx: any,
  folderId: string,
  newParentId: string | null,
): Promise<boolean> {
  if (!newParentId) return false;
  if (folderId === newParentId) return true;

  let currentParent = newParentId;
  while (currentParent) {
    const parent = await ctx.db.get(currentParent);
    if (!parent) break;
    if (parent._id === folderId) return true;
    currentParent = parent.parentId;
  }

  return false;
}

async function requireFolderInOrganization(
  ctx: MutationCtx,
  folderId: Id<"folders">,
  organizationId: Id<"organizations">,
) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.organizationId !== organizationId) {
    throw new Error("Invalid parent folder for this organization");
  }
  return folder;
}

/**
 * Create a new folder
 */
export const create = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const membership = await requireCurrentOrganizationMembership(ctx);

    await requireAdminOrTrainer(ctx, membership.organizationId);

    if (args.parentId) {
      await requireFolderInOrganization(
        ctx,
        args.parentId,
        membership.organizationId,
      );
    }

    const now = Date.now();

    // Get next order number for this parent
    const siblings = await ctx.db
      .query("folders")
      .withIndex("by_organization_parent", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("parentId", args.parentId ?? undefined),
      )
      .collect();

    const order = siblings.length;

    // Compute path
    const path = await computeFolderPath(ctx, args.parentId ?? null);
    const fullPath = path ? `${path}/${args.name}` : args.name;

    const folderId = await ctx.db.insert("folders", {
      organizationId: membership.organizationId,
      name: args.name,
      parentId: args.parentId,
      path: fullPath,
      order,
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });

    return folderId;
  },
});

/**
 * Update folder name
 */
export const update = mutation({
  args: {
    id: v.id("folders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    await requireAdminOrTrainer(ctx, folder.organizationId);

    // Recompute path for this folder and all descendants
    const newPath = await computeFolderPath(ctx, folder.parentId ?? null);
    const fullPath = newPath ? `${newPath}/${args.name}` : args.name;

    await ctx.db.patch(args.id, {
      name: args.name,
      path: fullPath,
      updatedAt: Date.now(),
    });

    // Update paths for all descendants
    await updateDescendantPaths(ctx, args.id, folder.organizationId);
  },
});

/**
 * Helper: Update paths for all descendant folders
 */
async function updateDescendantPaths(
  ctx: MutationCtx,
  folderId: Id<"folders">,
  organizationId: Id<"organizations">,
) {
  const children = await ctx.db
    .query("folders")
    .withIndex("by_organization_parent", (q) =>
      q.eq("organizationId", organizationId).eq("parentId", folderId),
    )
    .collect();

  for (const child of children) {
    const newPath = await computeFolderPath(ctx, child.parentId ?? null);
    await ctx.db.patch(child._id, {
      path: newPath,
      updatedAt: Date.now(),
    });
    // Recursively update children
    await updateDescendantPaths(ctx, child._id, organizationId);
  }
}

/**
 * Move folder to a new parent
 */
export const move = mutation({
  args: {
    id: v.id("folders"),
    newParentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    await requireAdminOrTrainer(ctx, folder.organizationId);

    if (args.newParentId) {
      await requireFolderInOrganization(
        ctx,
        args.newParentId,
        folder.organizationId,
      );
    }

    // Check for circular reference
    const wouldBeCircular = await wouldCreateCircularReference(
      ctx,
      args.id,
      args.newParentId ?? null,
    );
    if (wouldBeCircular) {
      throw new Error("Cannot move folder: would create circular reference");
    }

    // Recompute path
    const newPath = await computeFolderPath(ctx, args.newParentId ?? null);
    const fullPath = newPath ? `${newPath}/${folder.name}` : folder.name;

    await ctx.db.patch(args.id, {
      parentId: args.newParentId,
      path: fullPath,
      updatedAt: Date.now(),
    });

    // Update paths for all descendants
    await updateDescendantPaths(ctx, args.id, folder.organizationId);
  },
});

/**
 * Delete a folder
 */
export const remove = mutation({
  args: {
    id: v.id("folders"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folder = await ctx.db.get(args.id);
    if (!folder) {
      throw new Error("Folder not found");
    }

    await requireAdminOrTrainer(ctx, folder.organizationId);

    // Check for child folders
    const hasChildren = await ctx.db
      .query("folders")
      .withIndex("by_organization_parent", (q) =>
        q.eq("organizationId", folder.organizationId).eq("parentId", args.id),
      )
      .first();

    if (hasChildren) {
      throw new Error("Cannot delete folder: it contains subfolders");
    }

    // Check for planifications
    const hasPlanifications = await ctx.db
      .query("planifications")
      .withIndex("by_folder", (q) => q.eq("folderId", args.id))
      .first();

    if (hasPlanifications) {
      throw new Error("Cannot delete folder: it contains planifications");
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Get folder tree for the current user's organization
 */
export const getTree = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    return await ctx.db
      .query("folders")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();
  },
});

/**
 * Get folder IDs that can be deleted (no subfolders, no planifications).
 * Used to show "Eliminar" only for empty folders.
 */
export const getDeletableFolderIds = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .collect();

    const deletableIds: Id<"folders">[] = [];
    for (const folder of folders) {
      const hasChildren = await ctx.db
        .query("folders")
        .withIndex("by_organization_parent", (q) =>
          q
            .eq("organizationId", membership.organizationId)
            .eq("parentId", folder._id),
        )
        .first();
      if (hasChildren) continue;

      const hasPlanifications = await ctx.db
        .query("planifications")
        .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
        .first();
      if (hasPlanifications) continue;

      deletableIds.push(folder._id);
    }
    return deletableIds;
  },
});

/**
 * Get folders by parent for the current user's organization (for lazy loading)
 */
export const getByParent = query({
  args: {
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const membership = await requireCurrentOrganizationMembership(ctx);

    return await ctx.db
      .query("folders")
      .withIndex("by_organization_parent", (q) =>
        q
          .eq("organizationId", membership.organizationId)
          .eq("parentId", args.parentId ?? undefined),
      )
      .collect();
  },
});
