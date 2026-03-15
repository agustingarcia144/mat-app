import { Stack } from 'expo-router'
import HeaderBackButton from '@/components/ui/header-back-button'
import HeaderCloseButton from '@/components/ui/header-close-button'

export default function InicioLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="workout/[sessionId]"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="workout/log-set"
        options={{
          presentation: 'formSheet',
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerRight: () => <HeaderCloseButton />,
          headerShadowVisible: false,
          gestureEnabled: true,
          sheetAllowedDetents: [0.75],
        }}
      />
      <Stack.Screen
        name="exercise/[exerciseId]"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="exercise/video/[exerciseId]"
        options={{
          presentation: 'formSheet',
          headerShown: true,
          headerTransparent: true,
          contentStyle: { backgroundColor: 'transparent' },
          title: '',
          headerRight: () => <HeaderCloseButton />,
          headerLeft: () => null,
          headerShadowVisible: false,
          gestureEnabled: true,
          sheetAllowedDetents: [0.7],
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="schedule/[scheduleId]"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  )
}
