import { Stack, useRouter } from 'expo-router'
import { Pressable, StyleSheet, useColorScheme } from 'react-native'

import { IconSymbol } from '@/components/ui/icon-symbol'

const SIZE = 36

function HeaderBackButton() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const tint = isDark ? '#fff' : '#000'

  return (
    <Pressable
      onPress={() => router.back()}
      style={({ pressed }) => [
        styles.circle,
        pressed && styles.pressed,
      ]}
      hitSlop={12}
    >
      <IconSymbol name="chevron.left" size={22} color={tint} />
    </Pressable>
  )
}

export default function PlanificationsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[assignmentId]"
        options={{
          headerShown: true,
          headerTransparent: true,
          title: '',
          headerTitle: () => null,
          headerLeft: () => <HeaderBackButton />,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
})
