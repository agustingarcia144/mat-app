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
  ScrollView,
} from 'react-native'
import { useSignUp, useSSO } from '@clerk/clerk-expo'
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
import LoadingScreen from '@/components/shared/screens/loading-screen'

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
        router.replace('/onboarding')
      }
    }
    handleRedirect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  return <LoadingScreen />
}

function SignUpForm() {
  const { signUp, setActive, isLoaded } = useSignUp()
  const { startSSOFlow } = useSSO()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const getOrCreateUser = useMutation(api.users.getOrCreateCurrentUser)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const onSignUp = async () => {
    if (!isLoaded) return

    setLoading(true)
    setError('')

    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
      })

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })

      setVerifying(true)
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const handlePostAuth = async () => {
    try {
      // Create user in Convex (first time user, so onboarding not completed)
      await getOrCreateUser()
      // Always go to onboarding for new sign ups
      router.replace('/onboarding')
    } catch (err) {
      console.error('Failed to create user:', err)
      // Fallback to onboarding even if there's an error
      router.replace('/onboarding')
    }
  }

  const onVerify = async () => {
    if (!isLoaded) return

    setLoading(true)
    setError('')

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        // Wait a bit for Clerk session to be fully set
        setTimeout(handlePostAuth, 500)
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Error al verificar el correo')
      setLoading(false)
    }
  }

  const onGoogleSignUp = async () => {
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
      setError(err.errors?.[0]?.message || 'Error al registrarse con Google')
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.container,
          { backgroundColor: isDark ? '#000' : '#fff' },
        ]}
      >
        <View style={styles.content}>
          <Image
            source={require('@/assets/images/mat-wolf.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Mat wolf mascot"
          />
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
            Verifica tu correo
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
          >
            Ingresa el código enviado a {email}
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
              placeholder="Código de verificación"
              placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              editable={!loading}
            />

            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? '#000' : '#fff' },
                  ]}
                >
                  Verificar correo
                </Text>
              )}
            </ThemedPressable>

            <ThemedPressable onPress={() => setVerifying(false)}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                Volver al registro
              </Text>
            </ThemedPressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Image
            source={require('@/assets/images/mat-wolf.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Mat wolf mascot"
          />
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
            Crear una cuenta
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
          >
            Ingresa tus datos para comenzar
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.row}>
              <TextInput
                style={[
                  styles.input,
                  styles.halfInput,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    color: isDark ? '#fff' : '#000',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                placeholder="Nombre"
                placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                value={firstName}
                onChangeText={setFirstName}
                editable={!loading}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.halfInput,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    color: isDark ? '#fff' : '#000',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                placeholder="Apellido"
                placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                value={lastName}
                onChangeText={setLastName}
                editable={!loading}
              />
            </View>

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
              onPress={onSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? '#000' : '#fff' },
                  ]}
                >
                  Registrarse
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
              onPress={onGoogleSignUp}
              disabled={loading}
            >
              <Text
                style={[
                  styles.oauthButtonText,
                  { color: isDark ? '#fff' : '#000' },
                ]}
              >
                Continuar con Google
              </Text>
            </ThemedPressable>

            <ThemedPressable onPress={() => router.push('/sign-in')}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                ¿Ya tienes cuenta?{' '}
                <Text style={styles.linkBold}>Iniciar sesión</Text>
              </Text>
            </ThemedPressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default function SignUpScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Unauthenticated>
        <SignUpForm />
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logo: {
    width: 120,
    height: 120,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  halfInput: {
    flex: 1,
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
