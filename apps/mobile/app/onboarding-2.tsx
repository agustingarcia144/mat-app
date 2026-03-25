import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Picker } from '@react-native-picker/picker'
import { useRouter } from 'expo-router'
import { useMutation, Authenticated } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'

const HEIGHT_CM = Array.from({ length: 151 }, (_, i) => 100 + i) // 100–250 cm
const WEIGHT_KG = Array.from({ length: 171 }, (_, i) => 30 + i) // 30–200 kg

function Onboarding2Content() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const insets = useSafeAreaInsets()

  const completeOnboarding2 = useMutation(api.users.completeOnboarding2)

  const [heightCm, setHeightCm] = useState<number | null>(null)
  const [weightKg, setWeightKg] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activePicker, setActivePicker] = useState<'height' | 'weight' | null>(
    null,
  )

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      await completeOnboarding2({
        height: heightCm ?? HEIGHT_CM[50],
        weight: weightKg ?? WEIGHT_KG[40],
        description: description.trim() || undefined,
      })
      router.replace('/')
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar la información'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setLoading(true)
    setError('')
    try {
      await completeOnboarding2({})
      router.replace('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al omitir')
    } finally {
      setLoading(false)
    }
  }

  const selectedHeight = heightCm ?? HEIGHT_CM[50]
  const selectedWeight = weightKg ?? WEIGHT_KG[40]

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
            source={require('@/assets/images/mat-wolf-measure.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Mat wolf mascot"
          />
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
            Un poco más sobre vos
          </Text>
          <Text
            style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#71717a' }]}
          >
            Altura, peso y descripción (opcional)
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#fff' : '#000' }]}>
                Altura (cm)
              </Text>
              <ThemedPressable
                onPress={() => !loading && setActivePicker('height')}
                style={[
                  styles.input,
                  styles.pickerInput,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerInputText,
                    { color: isDark ? '#fff' : '#000' },
                  ]}
                >
                  {`${selectedHeight} cm`}
                </Text>
              </ThemedPressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#fff' : '#000' }]}>
                Peso (kg)
              </Text>
              <ThemedPressable
                onPress={() => !loading && setActivePicker('weight')}
                style={[
                  styles.input,
                  styles.pickerInput,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerInputText,
                    { color: isDark ? '#fff' : '#000' },
                  ]}
                >
                  {`${selectedWeight} kg`}
                </Text>
              </ThemedPressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#fff' : '#000' }]}>
                Descripción (opcional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                    color: isDark ? '#fff' : '#000',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                  },
                ]}
                placeholder="Objetivos, notas para tu entrenador..."
                placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>

            <Modal
              visible={activePicker !== null}
              transparent
              animationType="slide"
              onRequestClose={() => setActivePicker(null)}
            >
              <Pressable
                style={styles.sheetBackdrop}
                // Android pickers often don't behave well with iOS-style dismissal UX.
                // Restrict backdrop dismissal to Android so iOS Picker interactions don't
                // inadvertently bubble up and close the sheet.
                onPress={() => {
                  if (Platform.OS === 'android') setActivePicker(null)
                }}
              >
                <View
                  style={[
                    styles.sheet,
                  {
                    backgroundColor: isDark ? '#000' : '#fff',
                    // Keep content above Android nav bar.
                    paddingBottom: 96 + insets.bottom,
                  },
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetTitle,
                      { color: isDark ? '#fff' : '#000' },
                    ]}
                  >
                    {activePicker === 'height' ? 'Altura (cm)' : 'Peso (kg)'}
                  </Text>
                  {activePicker === 'height' ? (
                    <Picker
                      selectedValue={selectedHeight}
                      onValueChange={(v) => setHeightCm(v as number)}
                    >
                      {HEIGHT_CM.map((cm) => (
                        <Picker.Item key={cm} label={`${cm} cm`} value={cm} />
                      ))}
                    </Picker>
                  ) : (
                    <Picker
                      selectedValue={selectedWeight}
                      onValueChange={(v) => setWeightKg(v as number)}
                    >
                      {WEIGHT_KG.map((kg) => (
                        <Picker.Item key={kg} label={`${kg} kg`} value={kg} />
                      ))}
                    </Picker>
                  )}
                  <ThemedPressable
                    onPress={() => setActivePicker(null)}
                    hitSlop={12}
                    style={[
                      styles.sheetDone,
                      {
                        bottom: 16 + insets.bottom,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sheetDoneText,
                        { color: isDark ? '#fff' : '#000' },
                      ]}
                    >
                      Listo
                    </Text>
                  </ThemedPressable>
                </View>
              </Pressable>
            </Modal>

            <ThemedPressable
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
            </ThemedPressable>

            <ThemedPressable
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
            </ThemedPressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default function Onboarding2Screen() {
  return (
    <Authenticated>
      <Onboarding2Content />
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
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    borderRadius: 16,
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  pickerInput: {
    height: 48,
    justifyContent: 'center',
  },
  pickerInputText: {
    fontSize: 16,
  },
  pickerWrap: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  picker: {
    height: 48,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 96,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  sheetDone: {
    position: 'absolute',
    right: 16,
    // bottom is overridden from component with safe area inset.
    bottom: 16,
    alignSelf: 'flex-end',
    zIndex: 50,
    elevation: 50,
  },
  sheetDoneText: {
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
