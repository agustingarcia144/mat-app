import { v } from "convex/values";

const card = v.union(
  v.literal("pending"),
  v.literal("classes"),
  v.literal("members"),
  v.literal("payments"),
  v.literal("planifications"),
);
export const dashboardLayoutValidator = v.object({
  left: v.array(card),
  right: v.array(card),
});
