import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { IconSymbol } from '@/components/ui/icon-symbol'
import Providers from '@/components/providers/providers'
import { Colors } from '@/constants/theme'
import { PressableScale } from 'pressto'

function ProfileModalCloseButton() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const tint = colorScheme === 'dark' ? '#fff' : '#000'
  return (
    <PressableScale
      enabled={true}
      onPress={() => router.back()}
      hitSlop={12}
      style={{ padding: 8 }}
    >
      <IconSymbol name="xmark" size={22} color={tint} />
    </PressableScale>
  )
}

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const convexUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : 'skip'
  )
  const segments = useSegments()
  const router = useRouter()
  const colorScheme = useColorScheme()

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(tabs)'
    const inModal = segments[0] === 'profile'
    const inOnboarding = segments[0] === 'onboarding'

    if (!isAuthenticated) {
      if (inAuthGroup) {
        router.replace('/')
      }
      return
    }

    // Authenticated: wait for Convex user to decide where to send
    if (convexUser === undefined) return

    if (inOnboarding) return

    if (!inAuthGroup && !inModal) {
      const needsOnboarding =
        convexUser == null || !convexUser.onboardingCompleted
      if (needsOnboarding) {
        router.replace('/onboarding')
      } else {
        router.replace('/(tabs)/home')
      }
    }
  }, [isAuthenticated, isLoading, convexUser, segments, router])

  const backgroundColor = Colors[colorScheme ?? 'light'].background
  const headerTintColor = Colors[colorScheme ?? 'light'].text

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="select-organization" />
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
            headerRight: () => <ProfileModalCloseButton />,
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
