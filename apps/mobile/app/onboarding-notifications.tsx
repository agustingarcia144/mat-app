import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, Authenticated } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import {
  registerForPushNotificationsAsync,
  hasNotificationPermissionBeenRequested,
} from '@/lib/push-notifications'

function OnboardingNotificationsContent() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const registerDeviceToken = useMutation(api.pushNotifications.registerDeviceToken)

  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    hasNotificationPermissionBeenRequested().then((alreadyDecided) => {
      if (cancelled) return
      if (alreadyDecided) {
        router.replace('/onboarding')
        return
      }
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [router])

  const handleEnable = async () => {
    setLoading(true)
    setMessage('')

    try {
      const { token, platform } = await registerForPushNotificationsAsync()
      if (!token || !platform) {
        setEnabled(false)
        setMessage('No se pudieron activar. Podés habilitarlas después en Configuración.')
        return
      }

      await registerDeviceToken({ token, platform })
      setEnabled(true)
      setMessage('Listo, vas a recibir avisos importantes.')
    } catch {
      setEnabled(false)
      setMessage('No se pudieron activar. Podés habilitarlas después en Configuración.')
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    router.replace('/onboarding')
  }

  if (checking) {
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

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <View style={styles.bottomSection}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isDark ? '#1a1a1a' : '#f0f4ff' },
          ]}
        >
          <Text style={styles.iconEmoji}>🔔</Text>
        </View>

        <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>
          No te pierdas nada
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#64748b' }]}
        >
          Activá las notificaciones y te avisamos si se cancela una clase reservada, una hora antes de que empiece y cuando falte marcar asistencia.
        </Text>

        <ThemedPressable
          type="primary"
          lightColor="#000"
          darkColor="#fff"
          onPress={handleEnable}
          disabled={loading}
          style={[
            styles.primaryButton,
            enabled && styles.primaryButtonSuccess,
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={isDark ? '#000' : '#fff'} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: enabled ? '#fff' : isDark ? '#000' : '#fff' },
              ]}
            >
              {enabled ? 'Notificaciones activadas' : 'Activar notificaciones'}
            </Text>
          )}
        </ThemedPressable>

        {message ? (
          <Text
            style={[
              styles.message,
              { color: enabled ? '#16a34a' : (isDark ? '#a1a1aa' : '#64748b') },
            ]}
          >
            {message}
          </Text>
        ) : null}

        <ThemedPressable onPress={handleContinue} style={styles.continueButton}>
          <Text
            style={[
              styles.continueButtonText,
              { color: isDark ? '#a1a1aa' : '#64748b' },
            ]}
          >
            Continuar
          </Text>
        </ThemedPressable>
      </View>
    </View>
  )
}

export default function OnboardingNotificationsScreen() {
  return (
    <Authenticated>
      <OnboardingNotificationsContent />
    </Authenticated>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSection: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonSuccess: {
    backgroundColor: '#16a34a',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  continueButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
