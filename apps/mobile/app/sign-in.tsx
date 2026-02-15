import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useSignIn, useSSO } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import {
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import AntDesign from '@expo/vector-icons/AntDesign'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#000' : '#fff',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </View>
  )
}

function AuthenticatedRedirect() {
  const router = useRouter()
  const getOrCreateUser = useMutation(api.users.getOrCreateCurrentUser)

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const user = await getOrCreateUser()
        if (user && !user.onboardingCompleted) {
          router.replace('/onboarding')
        } else {
          router.replace('/(tabs)/home')
        }
      } catch (err) {
        console.error('Failed to get/create user:', err)
        router.replace('/(tabs)/home')
      }
    }
    handleRedirect()
  }, [router])

  return <LoadingScreen />
}

function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { startSSOFlow } = useSSO()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const getOrCreateUser = useMutation(api.users.getOrCreateCurrentUser)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePostAuth = async () => {
    try {
      // Create/get user in Convex and check onboarding status
      const user = await getOrCreateUser()

      if (user && !user.onboardingCompleted) {
        router.replace('/onboarding')
      } else {
        router.replace('/(tabs)/home')
      }
    } catch (err) {
      console.error('Failed to get/create user:', err)
      // Fallback to tabs if there's an error
      router.replace('/(tabs)/home')
    }
  }

  const onSignIn = async () => {
    if (!isLoaded) return

    setLoading(true)
    setError('')

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        // Wait a bit for Clerk session to be fully set
        setTimeout(handlePostAuth, 500)
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  const onGoogleSignIn = async () => {
    setLoading(true)
    setError('')

    try {
      const { createdSessionId, setActive: oauthSetActive } =
        await startSSOFlow({ strategy: 'oauth_google' })

      if (createdSessionId) {
        await oauthSetActive!({ session: createdSessionId })
        // Wait a bit for Clerk session to be fully set
        setTimeout(handlePostAuth, 500)
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Error al iniciar sesión con Google')
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          Bienvenido de nuevo
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          Inicia sesión en tu cuenta
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                color: isDark ? '#fff' : '#000',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
            placeholder="Correo electrónico"
            placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                color: isDark ? '#fff' : '#000',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
            placeholder="Contraseña"
            placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <ThemedPressable
            type="primary"
            lightColor="#000"
            darkColor="#fff"
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? '#000' : '#fff'} />
            ) : (
              <Text
                style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}
              >
                Iniciar sesión
              </Text>
            )}
          </ThemedPressable>

          <View style={styles.divider}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
              ]}
            />
            <Text
              style={[
                styles.dividerText,
                { color: isDark ? '#71717a' : '#a1a1aa' },
              ]}
            >
              o
            </Text>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
              ]}
            />
          </View>

          <ThemedPressable
            type="secondary"
            lightColor="#f4f4f5"
            darkColor="#18181b"
            style={[
              styles.oauthButton,
              { borderColor: isDark ? '#27272a' : '#e4e4e7' },
            ]}
            onPress={onGoogleSignIn}
            disabled={loading}
          >
            <AntDesign
              name="google"
              size={22}
              color={isDark ? '#fff' : '#000'}
            />
            <Text
              style={[
                styles.oauthButtonText,
                { color: isDark ? '#fff' : '#000' },
              ]}
            >
              Continuar con Google
            </Text>
          </ThemedPressable>

          <ThemedPressable onPress={() => router.push('/sign-up')}>
            <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
              ¿No tienes cuenta? <Text style={styles.linkBold}>Regístrate</Text>
            </Text>
          </ThemedPressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

export default function SignInScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Unauthenticated>
        <SignInForm />
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  errorContainer: {
    backgroundColor: '#262626',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#fafafa',
    fontSize: 14,
  },
  form: {
    gap: 16,
  },
  input: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
  },
  oauthButton: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  oauthButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  link: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  linkBold: {
    fontWeight: '600',
  },
})
