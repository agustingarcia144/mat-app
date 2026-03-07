'use client'

import { useAuth } from '@clerk/nextjs'
import { useConvexAuth } from 'convex/react'

export function useCanQueryCurrentOrganization() {
  const { isLoaded, userId, orgId } = useAuth()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return (
    isLoaded &&
    !isLoading &&
    isAuthenticated &&
    Boolean(userId) &&
    Boolean(orgId)
  )
}
