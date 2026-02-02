import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import { useColorScheme } from '@/hooks/use-color-scheme'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[
        styles.container,
        styles.centered,
        { backgroundColor: isDark ? '#000' : '#fff' },
      ]}
    >
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </View>
  )
}

function LandingContent() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          Bienvenido a Mat App
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          Gestiona tu camino fitness
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: isDark ? '#fff' : '#000' },
            ]}
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
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
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
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function AuthenticatedRedirect() {
  const router = useRouter()

  React.useEffect(() => {
    router.replace('/(tabs)')
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
