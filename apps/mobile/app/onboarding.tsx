import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useRouter } from 'expo-router'
import { useMutation, Authenticated } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedButton } from '@/components/themed-button'

function OnboardingContent() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const completeOnboarding = useMutation(api.users.completeOnboarding)

  const [birthday, setBirthday] = useState('')
  const [birthdayDate, setBirthdayDate] = useState<Date | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const displayBirthday =
    birthday ||
    (birthdayDate
      ? birthdayDate.toISOString().slice(0, 10)
      : '')

  const onBirthdayChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios')
    if (selectedDate) {
      setBirthdayDate(selectedDate)
      setBirthday(selectedDate.toISOString().slice(0, 10))
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      await completeOnboarding({
        birthday: birthday || undefined,
        phone: phone || undefined,
      })

      // Navigate to tabs after completing onboarding
      router.replace('/(tabs)/home')
    } catch (err: any) {
      setError(err.message || 'Error al guardar la información')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setLoading(true)
    try {
      // Mark onboarding as completed even if skipped
      await completeOnboarding({})
      router.replace('/(tabs)/home')
    } catch (err: any) {
      setError(err.message || 'Error al omitir')
    } finally {
      setLoading(false)
    }
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
            source={require('@/assets/images/mat-wolf-notes.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Mat wolf mascot"
          />
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
            Completa tu perfil
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
          >
            Ayúdanos a personalizar tu experiencia
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#fff' : '#000' }]}>
                Fecha de nacimiento (opcional)
              </Text>
              <Pressable
                style={[
                  styles.input,
                  styles.dateInput,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                onPress={() => !loading && setShowDatePicker(true)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.dateInputText,
                    {
                      color: displayBirthday
                        ? isDark ? '#fff' : '#000'
                        : isDark ? '#71717a' : '#a1a1aa',
                    },
                  ]}
                >
                  {displayBirthday || 'YYYY-MM-DD'}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={birthdayDate ?? new Date(2000, 0, 1)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onBirthdayChange}
                  maximumDate={new Date()}
                  minimumDate={new Date(1900, 0, 1)}
                  locale="es-ES"
                  style={Platform.OS === 'android' ? styles.androidPicker : undefined}
                />
              )}
              {Platform.OS === 'ios' && showDatePicker && (
                <ThemedButton
                  onPress={() => setShowDatePicker(false)}
                  style={styles.datePickerDone}
                >
                  <Text style={[styles.datePickerDoneText, { color: isDark ? '#fff' : '#000' }]}>
                    Listo
                  </Text>
                </ThemedButton>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#fff' : '#000' }]}>
                Teléfono (opcional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    color: isDark ? '#fff' : '#000',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>

            <ThemedButton
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
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
                  Continuar
                </Text>
              )}
            </ThemedButton>

            <ThemedButton
              onPress={handleSkip}
              disabled={loading}
              style={styles.skipButton}
            >
              <Text
                style={[
                  styles.skipText,
                  { color: isDark ? '#a1a1aa' : '#71717a' },
                ]}
              >
                Omitir por ahora
              </Text>
            </ThemedButton>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default function OnboardingScreen() {
  return (
    <Authenticated>
      <OnboardingContent />
    </Authenticated>
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
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  dateInput: {
    justifyContent: 'center',
  },
  dateInputText: {
    fontSize: 16,
  },
  androidPicker: {
    marginTop: 8,
  },
  datePickerDone: {
    marginTop: 12,
  },
  datePickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    height: 48,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
