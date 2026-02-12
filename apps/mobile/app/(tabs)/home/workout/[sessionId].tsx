import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedButton } from '@/components/themed-button'

function WorkoutContent() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const session = useQuery(
    api.workoutDaySessions.getById,
    sessionId ? { id: sessionId as any } : 'skip'
  )
  const dayExercises = useQuery(
    api.dayExercises.getByWorkoutDay,
    session?.workoutDayId ? { workoutDayId: session.workoutDayId } : 'skip'
  )
  const logs = useQuery(
    api.sessionExerciseLogs.getBySession,
    sessionId ? { sessionId: sessionId as any } : 'skip'
  )

  const setLog = useMutation(api.sessionExerciseLogs.setLog)
  const setSessionStatus = useMutation(api.workoutDaySessions.setStatus)

  const logsByDayExercise = useMemo(() => {
    const map: Record<string, NonNullable<typeof logs>[number]> = {}
    logs?.forEach((log) => {
      map[log.dayExerciseId] = log
    })
    return map
  }, [logs])

  const [localValues, setLocalValues] = useState<
    Record<string, { sets: string; reps: string; weight: string }>
  >({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)

  const getValuesFor = useCallback(
    (dayEx: NonNullable<typeof dayExercises>[number]) => {
      const log = logsByDayExercise[dayEx._id]
      const local = localValues[dayEx._id]
      if (local)
        return {
          sets: local.sets,
          reps: local.reps,
          weight: local.weight,
        }
      if (log)
        return {
          sets: String(log.sets),
          reps: log.reps,
          weight: log.weight ?? '',
        }
      return {
        sets: String(dayEx.sets),
        reps: dayEx.reps,
        weight: dayEx.weight ?? '',
      }
    },
    [logsByDayExercise, localValues]
  )

  const updateLocal = useCallback(
    (dayExerciseId: string, field: 'sets' | 'reps' | 'weight', value: string) => {
      setLocalValues((prev) => ({
        ...prev,
        [dayExerciseId]: {
          ...(prev[dayExerciseId] ?? {
            sets: '',
            reps: '',
            weight: '',
          }),
          [field]: value,
        },
      }))
    },
    []
  )

  const saveLog = useCallback(
    async (dayEx: NonNullable<typeof dayExercises>[number]) => {
      if (!sessionId) return
      const values = getValuesFor(dayEx)
      const sets = parseInt(values.sets, 10)
      if (Number.isNaN(sets) || sets < 0) return
      if (!values.reps.trim()) return
      setSavingId(dayEx._id)
      try {
        await setLog({
          sessionId: sessionId as any,
          dayExerciseId: dayEx._id,
          sets,
          reps: values.reps.trim(),
          weight: values.weight.trim() || undefined,
          order: dayEx.order,
        })
        setLocalValues((prev) => {
          const next = { ...prev }
          delete next[dayEx._id]
          return next
        })
      } catch (e) {
        console.error(e)
      } finally {
        setSavingId(null)
      }
    },
    [sessionId, getValuesFor, setLog]
  )

  const allExercisesFilled = useMemo(() => {
    if (!dayExercises?.length) return false
    return dayExercises.every((dayEx) => {
      const values = getValuesFor(dayEx)
      const sets = parseInt(values.sets, 10)
      return (
        !Number.isNaN(sets) &&
        sets > 0 &&
        values.reps.trim().length > 0
      )
    })
  }, [dayExercises, getValuesFor])

  const handleComplete = async () => {
    if (!sessionId || !allExercisesFilled || session?.status === 'completed')
      return
    setCompleting(true)
    try {
      for (const dayEx of dayExercises ?? []) {
        const values = getValuesFor(dayEx)
        const sets = parseInt(values.sets, 10)
        if (Number.isNaN(sets) || sets < 0 || !values.reps.trim()) continue
        await setLog({
          sessionId: sessionId as any,
          dayExerciseId: dayEx._id,
          sets,
          reps: values.reps.trim(),
          weight: values.weight.trim() || undefined,
          order: dayEx.order,
        })
      }
      await setSessionStatus({
        id: sessionId as any,
        status: 'completed',
      })
      router.back()
    } catch (e) {
      console.error(e)
    } finally {
      setCompleting(false)
    }
  }

  const inputBg = isDark ? '#27272a' : '#e4e4e7'
  const inputColor = isDark ? '#fafafa' : '#18181b'
  const borderColor = isDark ? '#3f3f46' : '#d4d4d8'

  if (session === undefined || dayExercises === undefined || logs === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (!session) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText>Sesión no encontrada</ThemedText>
      </ThemedView>
    )
  }

  const isCompleted = session.status === 'completed'

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText style={styles.hint}>
            Completa series, repeticiones y peso para cada ejercicio. Luego
            pulsa &quot;Completar entrenamiento&quot;.
          </ThemedText>

          {(dayExercises ?? []).map((dayEx) => {
            const values = getValuesFor(dayEx)
            const hasLog = !!logsByDayExercise[dayEx._id]
            const saving = savingId === dayEx._id
            return (
              <View
                key={dayEx._id}
                style={[styles.exerciseCard, { borderColor }]}
              >
                <ThemedText style={styles.exerciseName}>
                  {dayEx.exercise?.name ?? 'Ejercicio'}
                </ThemedText>
                <ThemedText style={styles.planned}>
                  Plan: {dayEx.sets} × {dayEx.reps}
                  {dayEx.weight ? ` · ${dayEx.weight}` : ''}
                </ThemedText>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <ThemedText style={styles.inputLabel}>Series</ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: inputBg, color: inputColor },
                      ]}
                      value={values.sets}
                      onChangeText={(t) =>
                        updateLocal(dayEx._id, 'sets', t.replace(/\D/g, ''))
                      }
                      onBlur={() => saveLog(dayEx)}
                      placeholder="0"
                      placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                      keyboardType="number-pad"
                      editable={!isCompleted}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <ThemedText style={styles.inputLabel}>Reps</ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: inputBg, color: inputColor },
                      ]}
                      value={values.reps}
                      onChangeText={(t) =>
                        updateLocal(dayEx._id, 'reps', t)
                      }
                      onBlur={() => saveLog(dayEx)}
                      placeholder="0"
                      placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                      keyboardType="default"
                      editable={!isCompleted}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <ThemedText style={styles.inputLabel}>Peso</ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: inputBg, color: inputColor },
                      ]}
                      value={values.weight}
                      onChangeText={(t) =>
                        updateLocal(dayEx._id, 'weight', t)
                      }
                      onBlur={() => saveLog(dayEx)}
                      placeholder="kg"
                      placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                      keyboardType="decimal-pad"
                      editable={!isCompleted}
                    />
                  </View>
                </View>
                {saving && (
                  <ActivityIndicator
                    size="small"
                    color={Colors[colorScheme ?? 'light'].tint}
                    style={styles.savingIndicator}
                  />
                )}
                {hasLog && !saving && !isCompleted && (
                  <ThemedText style={styles.savedLabel}>Guardado</ThemedText>
                )}
              </View>
            )
          })}
        </ScrollView>

        {!isCompleted && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 16,
                backgroundColor: isDark ? '#0a0a0a' : '#fff',
              },
            ]}
          >
            <ThemedButton
              type="primary"
              style={{ opacity: allExercisesFilled ? 1 : 0.6 }}
              onPress={handleComplete}
              disabled={!allExercisesFilled || completing}
            >
              {completing ? (
                <ActivityIndicator
                  size="small"
                  color={colorScheme === 'dark' ? '#000' : '#fff'}
                />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: colorScheme === 'dark' ? '#000' : '#fff' },
                  ]}
                >
                  Completar entrenamiento
                </Text>
              )}
            </ThemedButton>
            {!allExercisesFilled && (
              <ThemedText style={styles.footerHint}>
                Completa todos los ejercicios para poder finalizar
              </ThemedText>
            )}
          </View>
        )}

        {isCompleted && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 16,
                backgroundColor: isDark ? '#0a0a0a' : '#fff',
              },
            ]}
          >
            <ThemedText style={styles.completedLabel}>
              Sesión completada
            </ThemedText>
          </View>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default function WorkoutScreen() {
  return <WorkoutContent />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  hint: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 20,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  planned: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    opacity: 0.8,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  savingIndicator: {
    marginTop: 8,
  },
  savedLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerHint: {
    fontSize: 12,
    marginTop: 8,
    opacity: 0.7,
    textAlign: 'center',
  },
  completedLabel: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.8,
  },
})
