import { ThemedView } from '@/components/ui/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ActivityIndicator, StyleSheet } from 'react-native'

export default function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
})
