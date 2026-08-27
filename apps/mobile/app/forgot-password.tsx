import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { OtpInput } from 'react-native-otp-entry'
import { isClerkAPIResponseError } from '@clerk/expo'
import { useSignIn } from '@clerk/expo/legacy'
import { useRouter } from 'expo-router'
import { Unauthenticated } from 'convex/react'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { captureHandledError } from '@/lib/sentry'

type Step = 'email' | 'reset' | 'second_factor'
type SecondFactorStrategy = 'email_code' | 'totp' | 'backup_code'

/**
 * Clerk returns structured errors; prefer its own message over a generic one so
 * "código incorrecto" and "contraseña muy débil" stay distinguishable.
 */
function messageFrom(err: unknown, fallback: string) {
  if (isClerkAPIResponseError(err)) {
    return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? fallback
  }
  return fallback
}

function ForgotPasswordForm() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [secondFactorCode, setSecondFactorCode] = useState('')
  const [secondFactorStrategy, setSecondFactorStrategy] =
    useState<SecondFactorStrategy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = [
    styles.input,
    {
      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
      color: isDark ? '#fff' : '#000',
      borderColor: isDark ? '#27272a' : '#e4e4e7',
    },
  ]

  const otpTheme = {
    containerStyle: { marginBottom: 8 },
    pinCodeContainerStyle: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: isDark ? '#27272a' : '#e4e4e7',
      backgroundColor: isDark ? '#18181b' : '#f4f4f5',
    },
    pinCodeTextStyle: {
      color: isDark ? '#fff' : '#000',
      fontSize: 18,
    },
  }

  const onRequestCode = async () => {
    if (!isLoaded || !signIn || !email.trim()) return

    setLoading(true)
    setError('')

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      })
      setStep('reset')
    } catch (err) {
      captureHandledError(err, {
        area: 'auth',
        action: 'request_password_reset',
      })
      setError(
        messageFrom(
          err,
          'No pudimos enviar el código. Revisá el correo e intentá de nuevo.'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const startSecondFactor = async (
    factors: { strategy: string }[]
  ): Promise<boolean> => {
    if (!signIn) return false

    const emailFactor = factors.find((f) => f.strategy === 'email_code') as
      | { strategy: 'email_code'; emailAddressId: string }
      | undefined
    const totpFactor = factors.find((f) => f.strategy === 'totp')
    const backupFactor = factors.find((f) => f.strategy === 'backup_code')

    if (emailFactor) {
      await signIn.prepareSecondFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      })
      setSecondFactorStrategy('email_code')
    } else if (totpFactor) {
      setSecondFactorStrategy('totp')
    } else if (backupFactor) {
      setSecondFactorStrategy('backup_code')
    } else {
      return false
    }

    setStep('second_factor')
    return true
  }

  const onResetPassword = async () => {
    if (!isLoaded || !signIn || !code.trim() || !newPassword) return

    setLoading(true)
    setError('')

    try {
      let result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
      })

      if (result.status === 'needs_new_password') {
        result = await signIn.resetPassword({ password: newPassword })
      }

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        // Go through index so AuthenticatedRedirect runs getOrCreateCurrentUser.
        router.replace('/')
        return
      }

      if (result.status === 'needs_second_factor') {
        const started = await startSecondFactor(
          result.supportedSecondFactors ?? []
        )
        if (!started) {
          setError('Verificación en dos pasos no configurada para esta cuenta.')
        }
        return
      }

      setError('Completá los pasos requeridos para restablecer tu contraseña.')
    } catch (err) {
      captureHandledError(err, {
        area: 'auth',
        action: 'reset_password',
      })
      setError(
        messageFrom(
          err,
          'No pudimos restablecer tu contraseña. Revisá el código e intentá de nuevo.'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const onSecondFactorSubmit = async () => {
    if (
      !isLoaded ||
      !signIn ||
      !secondFactorStrategy ||
      !secondFactorCode.trim()
    )
      return

    setLoading(true)
    setError('')

    try {
      const value = secondFactorCode.trim()
      const result =
        secondFactorStrategy === 'email_code'
          ? await signIn.attemptSecondFactor({
              strategy: 'email_code',
              code: value,
            })
          : await signIn.attemptSecondFactor({
              strategy:
                secondFactorStrategy === 'totp' ? 'totp' : 'backup_code',
              code: value,
            })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.replace('/')
        return
      }

      setError('Código inválido o vencido. Revisá e intentá de nuevo.')
    } catch (err) {
      captureHandledError(err, {
        area: 'auth',
        action: 'verify_second_factor_after_reset',
        extras: {
          strategy: secondFactorStrategy,
        },
      })
      setError(messageFrom(err, 'Error al verificar el código'))
    } finally {
      setLoading(false)
    }
  }

  const onBackToEmail = () => {
    setStep('email')
    setCode('')
    setNewPassword('')
    setError('')
  }

  const onBackToSignIn = () => {
    router.replace('/')
  }

  const title =
    step === 'second_factor'
      ? 'Verificación en dos pasos'
      : 'Recuperar contraseña'
  const subtitle =
    step === 'email'
      ? 'Ingresá tu correo y te enviamos un código para restablecerla.'
      : step === 'reset'
        ? 'Revisá tu correo e ingresá el código junto con tu nueva contraseña.'
        : secondFactorStrategy === 'email_code'
          ? 'Revisá tu correo e ingresá el código que te enviamos.'
          : secondFactorStrategy === 'totp'
            ? 'Ingresá el código de tu aplicación de autenticación.'
            : 'Ingresá uno de tus códigos de respaldo.'

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          {title}
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
        >
          {subtitle}
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 'email' ? (
          <View style={styles.form}>
            <TextInput
              style={inputStyle}
              placeholder="Correo electrónico"
              placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!loading}
            />

            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onRequestCode}
              disabled={loading || !email.trim()}
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
                  Enviar código
                </Text>
              )}
            </ThemedPressable>

            <ThemedPressable onPress={onBackToSignIn}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                Volver a inicio de sesión
              </Text>
            </ThemedPressable>
          </View>
        ) : null}

        {step === 'reset' ? (
          <View style={styles.form}>
            <OtpInput
              numberOfDigits={6}
              onTextChange={setCode}
              autoFocus
              disabled={loading}
              focusColor={isDark ? '#fff' : '#000'}
              theme={otpTheme}
            />

            <TextInput
              style={inputStyle}
              placeholder="Nueva contraseña"
              placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
              value={newPassword}
              onChangeText={setNewPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              editable={!loading}
            />

            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onResetPassword}
              disabled={loading || code.trim().length < 6 || !newPassword}
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
                  Restablecer contraseña
                </Text>
              )}
            </ThemedPressable>

            <ThemedPressable onPress={onRequestCode} disabled={loading}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                Reenviar código
              </Text>
            </ThemedPressable>

            <ThemedPressable onPress={onBackToEmail} disabled={loading}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                Usar otro correo
              </Text>
            </ThemedPressable>
          </View>
        ) : null}

        {step === 'second_factor' ? (
          <View style={styles.form}>
            <OtpInput
              numberOfDigits={6}
              onTextChange={setSecondFactorCode}
              autoFocus
              disabled={loading}
              focusColor={isDark ? '#fff' : '#000'}
              theme={otpTheme}
            />

            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onSecondFactorSubmit}
              disabled={loading || !secondFactorCode.trim()}
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
                  Verificar
                </Text>
              )}
            </ThemedPressable>

            <ThemedPressable onPress={onBackToSignIn} disabled={loading}>
              <Text style={[styles.link, { color: isDark ? '#fff' : '#000' }]}>
                Volver a inicio de sesión
              </Text>
            </ThemedPressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  )
}

export default function ForgotPasswordScreen() {
  return (
    <Unauthenticated>
      <ForgotPasswordForm />
    </Unauthenticated>
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
  link: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
})
