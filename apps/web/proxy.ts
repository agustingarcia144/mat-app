import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { hasUserStaffOrganization } from '@/lib/security/user-org-access'
import { isOrgStaffRole, isWebStaffGuardEnabled } from '@/lib/security/roles'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])
const isOrgSelectionRoute = createRouteMatcher(['/select-organization(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId, orgRole } = await auth()

  if (isProtectedRoute(req)) {
    if (!userId) {
      await auth.protect()
      return
    }
    if (!orgId) {
      return NextResponse.redirect(new URL('/select-organization', req.url))
    }
    if (isWebStaffGuardEnabled() && !isOrgStaffRole(orgRole)) {
      const hasStaffOrg = await hasUserStaffOrganization(userId)
      if (hasStaffOrg) {
        return NextResponse.redirect(new URL('/select-organization', req.url))
      }
      return NextResponse.redirect(new URL('/access-denied', req.url))
    }
  }

  if (isOrgSelectionRoute(req)) {
    if (!userId) {
      await auth.protect()
      return
    }
    // If the staff guard is enabled, only auto-redirect to the dashboard when
    // the active organization is one where the user is staff. Otherwise, let
    // the user land on the selection page so they can pick a valid org.
    if (orgId && (!isWebStaffGuardEnabled() || isOrgStaffRole(orgRole))) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
