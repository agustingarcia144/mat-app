import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])
const isOrgSelectionRoute = createRouteMatcher(['/select-organization(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth()

  if (isProtectedRoute(req)) {
    if (!userId) {
      await auth.protect()
      return
    }
    if (!orgId) {
      return NextResponse.redirect(new URL('/select-organization', req.url))
    }
  }

  if (isOrgSelectionRoute(req)) {
    if (!userId) {
      await auth.protect()
      return
    }
    if (orgId) {
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
