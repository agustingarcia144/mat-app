'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { isOrgStaffRole, isWebStaffGuardEnabled } from '@/lib/security/roles'

type DashboardPermissionGuardProps = {
  children: React.ReactNode
}

export default function DashboardPermissionGuard({
  children,
}: DashboardPermissionGuardProps) {
  const router = useRouter()
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization
  )
  const staffOrganizations = useQuery(
    api.organizationMemberships.getMyStaffOrganizations
  )

  const isLoaded =
    currentMembership !== undefined && staffOrganizations !== undefined

  useEffect(() => {
    if (!isWebStaffGuardEnabled()) return
    if (!isLoaded) return

    if (isOrgStaffRole(currentMembership?.role)) {
      return
    }

    if (staffOrganizations.length > 0) {
      router.replace('/select-organization')
      return
    }

    router.replace('/')
  }, [currentMembership, isLoaded, router, staffOrganizations])

  if (!isWebStaffGuardEnabled()) {
    return <>{children}</>
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Cargando acceso...</p>
      </div>
    )
  }

  if (!isOrgStaffRole(currentMembership?.role)) {
    // We already triggered a redirect in the effect; render nothing meanwhile.
    return null
  }

  return <>{children}</>
}

