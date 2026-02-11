'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface BlocksLoaderProps {
  dayIds: string[]
  onBlocksLoaded: (blocksByDay: Map<string, any[]>) => void
}

// Helper component to load blocks for a single day
function DayBlocksLoader({
  dayId,
  onLoaded,
}: {
  dayId: string
  onLoaded: (dayId: string, blocks: any[]) => void
}) {
  const blocks = useQuery(api.exerciseBlocks.getByWorkoutDay, {
    workoutDayId: dayId as any,
  })

  const prevBlocksRef = useRef<any[] | undefined>(undefined)

  useEffect(() => {
    if (blocks !== undefined && blocks !== prevBlocksRef.current) {
      prevBlocksRef.current = blocks
      onLoaded(dayId, blocks || [])
    }
  }, [dayId, blocks, onLoaded])

  return null
}

export default function BlocksLoader({
  dayIds,
  onBlocksLoaded,
}: BlocksLoaderProps) {
  const [loadedBlocks, setLoadedBlocks] = useState<Map<string, any[]>>(new Map())
  const hasCalledCallback = useRef(false)
  const prevDayIdsLength = useRef(dayIds.length)
  const onBlocksLoadedRef = useRef(onBlocksLoaded)

  // Keep ref updated
  useEffect(() => {
    onBlocksLoadedRef.current = onBlocksLoaded
  }, [onBlocksLoaded])

  const handleDayLoaded = useCallback((dayId: string, blocks: any[]) => {
    setLoadedBlocks((prev) => {
      const next = new Map(prev)
      next.set(dayId, blocks)
      return next
    })
  }, [])

  useEffect(() => {
    // Reset callback flag if dayIds length changes
    if (prevDayIdsLength.current !== dayIds.length) {
      hasCalledCallback.current = false
      prevDayIdsLength.current = dayIds.length
      setLoadedBlocks(new Map()) // Reset loaded blocks when dayIds change
      return
    }

    // Only call callback when we have blocks for all days (or empty arrays) and haven't called it yet
    if (
      loadedBlocks.size === dayIds.length &&
      dayIds.length > 0 &&
      !hasCalledCallback.current
    ) {
      hasCalledCallback.current = true
      // Create a new Map to avoid reference issues
      const blocksMap = new Map(loadedBlocks)
      onBlocksLoadedRef.current(blocksMap)
    }
  }, [dayIds.length, loadedBlocks])

  return (
    <>
      {dayIds.map((dayId) => (
        <DayBlocksLoader
          key={dayId}
          dayId={dayId}
          onLoaded={handleDayLoaded}
        />
      ))}
    </>
  )
}
