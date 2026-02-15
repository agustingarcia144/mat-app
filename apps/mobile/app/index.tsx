import React from 'react'
import { View, Text, StyleSheet, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import LoadingScreen from '@/components/shared/screens/loading-screen'

function LandingContent() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
    >
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/mat-wolf.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Mat wolf mascot"
        />
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          Bienvenido a Mat App
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          Gestiona tu camino fitness
        </Text>

        <View style={styles.buttons}>
          <ThemedPressable
            type="primary"
            lightColor="#000"
            darkColor="#fff"
            style={styles.primaryButton}
            onPress={() => router.push('/sign-in')}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: isDark ? '#000' : '#fff' },
              ]}
            >
              Iniciar sesión
            </Text>
          </ThemedPressable>

          <ThemedPressable
            type="secondary"
            lightColor="#f4f4f5"
            darkColor="#18181b"
            style={[
              styles.secondaryButton,
              { borderColor: isDark ? '#27272a' : '#e4e4e7' },
            ]}
            onPress={() => router.push('/sign-up')}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Registrarse
            </Text>
          </ThemedPressable>
        </View>
      </View>
    </View>
  )
}

function AuthenticatedRedirect() {
  const router = useRouter()

  React.useEffect(() => {
    router.replace('/(tabs)/home')
  }, [router])

  return null
}

export default function LandingScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Unauthenticated>
        <LandingContent />
      </Unauthenticated>

      <Authenticated>
        <AuthenticatedRedirect />
      </Authenticated>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logo: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    marginBottom: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 48,
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    height: 56,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '500',
  },
})
