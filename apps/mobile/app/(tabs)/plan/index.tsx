import React from 'react'
import { Authenticated, AuthLoading } from 'convex/react'

import LoadingScreen from '@/components/shared/screens/loading-screen'
import PlanContent from '@/components/features/plan/plan-content'

export default function PlanScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <PlanContent />
      </Authenticated>
    </>
  )
}
