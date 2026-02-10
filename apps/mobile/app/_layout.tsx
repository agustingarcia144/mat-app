import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { useEffect } from 'react'
import { Pressable, useColorScheme } from 'react-native'
import { useConvexAuth } from 'convex/react'
import { IconSymbol } from '@/components/ui/icon-symbol'
import Providers from '@/components/providers/providers'

function ProfileModalCloseButton() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const tint = colorScheme === 'dark' ? '#fff' : '#000'
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 8 })}
    >
      <IconSymbol name="xmark" size={22} color={tint} />
    </Pressable>
  )
}

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(tabs)'
    const inModal = segments[0] === 'profile' || segments[0] === 'modal'

    if (isAuthenticated && !inAuthGroup && !inModal) {
      // Redirect to tabs if authenticated (unless on a modal)
      router.replace('/(tabs)')
    } else if (!isAuthenticated && inAuthGroup) {
      // Redirect to landing if not authenticated
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, segments, router])

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
          name="modal"
          options={{ presentation: 'modal', title: 'Modal', headerShown: true }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTransparent: true,
            headerTitle: 'Configuración',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: 'transparent' },
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
