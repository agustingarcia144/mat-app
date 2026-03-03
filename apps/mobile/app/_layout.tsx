import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '@repo/convex'
import Providers from '@/components/providers/providers'
import { Colors } from '@/constants/theme'
import HeaderCloseButton from '@/components/ui/header-close-button'
import { usePendingJoin } from '@/contexts/pending-join-context'

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { pendingToken, isLoading: pendingLoading } = usePendingJoin()
  const convexUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : 'skip'
  )
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembership,
    isAuthenticated ? {} : 'skip'
  )
  const segments = useSegments()
  const router = useRouter()
  const colorScheme = useColorScheme()

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(tabs)'
    const inModal = segments[0] === 'profile'
    const inOnboarding =
      segments[0] === 'onboarding' || segments[0] === 'onboarding-2'
    const inOrgSelection = segments[0] === 'select-organization'
    const inJoinConfirm = segments[0] === 'join-gym-confirm'
    const inAuthPage =
      segments[0] === undefined ||
      segments[0] === 'sign-in' ||
      segments[0] === 'sign-up'

    if (!isAuthenticated) {
      if (inAuthGroup || inModal || inOnboarding || inOrgSelection || inJoinConfirm) {
        router.replace('/')
      }
      return
    }

    // Deferred deep link: show join confirmation when we have a pending token
    if (
      !pendingLoading &&
      pendingToken &&
      !inJoinConfirm &&
      !inAuthPage
    ) {
      router.replace('/join-gym-confirm')
      return
    }

    if (
      convexUser === undefined ||
      currentMembership === undefined
    ) {
      return
    }

    const hasActiveOrganization = currentMembership != null

    // Authenticated users must always have an active org before they can access app content.
    if (!hasActiveOrganization) {
      if (!inOrgSelection && !inJoinConfirm) {
        router.replace('/select-organization')
      }
      return
    }

    const needsOnboarding = convexUser == null || !convexUser.onboardingCompleted

    if (inOrgSelection) {
      if (needsOnboarding) {
        router.replace('/onboarding')
      } else {
        router.replace('/(tabs)/home')
      }
      return
    }

    if (needsOnboarding) {
      if (!inOnboarding) {
        const goToStep2 =
          convexUser?.onboardingStep1Completed === true
        router.replace(goToStep2 ? '/onboarding-2' : '/onboarding')
      }
      return
    }

    if (inOnboarding || inAuthPage) {
      router.replace('/(tabs)/home')
      return
    }

    if (!inAuthGroup && !inModal) {
      router.replace('/(tabs)/home')
    }
  }, [
    isAuthenticated,
    isLoading,
    pendingToken,
    pendingLoading,
    convexUser,
    currentMembership,
    segments,
    router,
  ])

  const backgroundColor = Colors[colorScheme ?? 'light'].background
  const headerTintColor = Colors[colorScheme ?? 'light'].text

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding-2" />
        <Stack.Screen name="select-organization" />
        <Stack.Screen name="join-gym-confirm" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTransparent: true,
            headerTitle: 'Configuración',
            headerShadowVisible: false,
            headerStyle: { backgroundColor },
            headerTintColor,
            headerRight: () => <HeaderCloseButton />,
            headerLeft: () => null,
            gestureEnabled: true,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}

export default function RootLayout() {
  return (
    <Providers>
      <RootLayoutNav />
    </Providers>
  )
}
