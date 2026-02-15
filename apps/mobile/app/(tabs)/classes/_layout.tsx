import { Stack } from 'expo-router'
import HeaderBackButton from '@/components/ui/header-back-button'

export default function ClassesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[scheduleId]"
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
