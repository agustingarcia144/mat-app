import { Stack, useRouter } from 'expo-router'
import { StyleSheet, useColorScheme } from 'react-native'
import { PressableScale } from 'pressto'

import { IconSymbol } from '@/components/ui/icon-symbol'

const SIZE = 36

function HeaderBackButton() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const tint = isDark ? '#fff' : '#000'

  return (
    <PressableScale
      onPress={() => router.back()}
      style={styles.circle}
      hitSlop={12}
    >
      <IconSymbol name="chevron.left" size={22} color={tint} />
    </PressableScale>
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
      <Stack.Screen
        name="[assignmentId]/[exerciseId]"
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

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
