"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface BlocksLoaderProps {
  dayIds: string[];
  onBlocksLoaded: (blocksByDay: Map<string, any[]>) => void;
}

// Helper component to load blocks for a single day
function DayBlocksLoader({
  dayId,
  onLoaded,
}: {
  dayId: string;
  onLoaded: (dayId: string, blocks: any[]) => void;
}) {
  const blocks = useQuery(api.exerciseBlocks.getByWorkoutDay, {
    workoutDayId: dayId as any,
  });

  const prevBlocksRef = useRef<any[] | undefined>(undefined);

  useEffect(() => {
    if (blocks !== undefined && blocks !== prevBlocksRef.current) {
      prevBlocksRef.current = blocks;
      onLoaded(dayId, blocks || []);
    }
  }, [dayId, blocks, onLoaded]);

  return null;
}

export default function BlocksLoader({
  dayIds,
  onBlocksLoaded,
}: BlocksLoaderProps) {
  const [loadedBlocks, setLoadedBlocks] = useState<Map<string, any[]>>(
    new Map(),
  );
  const hasCalledCallback = useRef(false);
  const prevDayIdsLength = useRef(dayIds.length);
  const onBlocksLoadedRef = useRef(onBlocksLoaded);

  // Keep ref updated
  useEffect(() => {
    onBlocksLoadedRef.current = onBlocksLoaded;
  }, [onBlocksLoaded]);

  const handleDayLoaded = useCallback((dayId: string, blocks: any[]) => {
    setLoadedBlocks((prev) => {
      const next = new Map(prev);
      next.set(dayId, blocks);
      return next;
    });
  }, []);

  useEffect(() => {
    // Reset callback flag when dayIds change (no setState — avoids cascading renders)
    if (prevDayIdsLength.current !== dayIds.length) {
      hasCalledCallback.current = false;
      prevDayIdsLength.current = dayIds.length;
    }

    // Consider only blocks for current dayIds (ignore stale entries when dayIds changed)
    const dayIdsSet = new Set(dayIds);
    const entries = Array.from(loadedBlocks.entries()).filter(([dayId]) =>
      dayIdsSet.has(dayId),
    );
    const blocksForCurrentDays = new Map<string, any[]>(entries);

    // Only call callback when we have blocks for all current days and haven't called it yet
    if (
      blocksForCurrentDays.size === dayIds.length &&
      dayIds.length > 0 &&
      !hasCalledCallback.current
    ) {
      hasCalledCallback.current = true;
      onBlocksLoadedRef.current(blocksForCurrentDays);
    }
  }, [dayIds.length, dayIds, loadedBlocks]);

  return (
    <>
      {dayIds.map((dayId) => (
        <DayBlocksLoader key={dayId} dayId={dayId} onLoaded={handleDayLoaded} />
      ))}
    </>
  );
}
