import { useState } from "react";

/**
 * Local-day window for the class queries. Shared so the KPI row and the
 * today panel send identical args and Convex serves both from one query.
 */
export function useTodayBounds() {
  const [bounds] = useState(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return { dayStartTime: start, dayEndTime: start + 24 * 60 * 60 * 1000 - 1 };
  });
  return bounds;
}
