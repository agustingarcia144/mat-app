"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export const hashInviteCode = internalAction({
  args: {
    code: v.string(),
  },
  handler: async (_ctx, args) => {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(args.code).digest("hex");
  },
});

export const generateInviteCode = internalAction({
  args: {},
  handler: async () => {
    const { randomBytes } = await import("node:crypto");
    const raw = toHex(randomBytes(6)).toUpperCase();
    return `ORG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  },
});
