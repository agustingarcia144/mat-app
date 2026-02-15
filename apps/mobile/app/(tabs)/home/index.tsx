import { Authenticated, AuthLoading } from 'convex/react'
import LoadingScreen from '@/components/shared/screens/loading-screen'
import DashboardContent from '@/components/features/home/dashboard-content'

export default function DashboardScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Authenticated>
        <DashboardContent />
      </Authenticated>
    </>
  )
}
