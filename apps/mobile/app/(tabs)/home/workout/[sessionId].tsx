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
  Image,
  Alert,
} from 'react-native'
import { PressableScale } from 'pressto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Href } from 'expo-router'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedPressable } from '@/components/themed-pressable'

function WorkoutContent() {
  const {
    sessionId,
    workoutDayId: paramWorkoutDayId,
    performedOn: paramPerformedOn,
    assignmentId: paramAssignmentId,
  } = useLocalSearchParams<{
    sessionId: string
    workoutDayId?: string
    performedOn?: string
    assignmentId?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const isNewSession = sessionId === 'new'

  const session = useQuery(
    api.workoutDaySessions.getById,
    !isNewSession && sessionId ? { id: sessionId as any } : 'skip'
  )
  const resolvedWorkoutDayId = isNewSession
    ? (paramWorkoutDayId as any)
    : session?.workoutDayId
  const dayExercises = useQuery(
    api.dayExercises.getByWorkoutDay,
    resolvedWorkoutDayId ? { workoutDayId: resolvedWorkoutDayId } : 'skip'
  )
  const blocks = useQuery(
    api.exerciseBlocks.getByWorkoutDay,
    resolvedWorkoutDayId ? { workoutDayId: resolvedWorkoutDayId } : 'skip'
  )
  const logs = useQuery(
    api.sessionExerciseLogs.getBySession,
    !isNewSession && sessionId ? { sessionId: sessionId as any } : 'skip'
  )

  const setLog = useMutation(api.sessionExerciseLogs.setLog)
  const setSessionStatus = useMutation(api.workoutDaySessions.setStatus)
  const startSession = useMutation(api.workoutDaySessions.startSession)

  const logsByDayExercise = useMemo(() => {
    const map: Record<string, NonNullable<typeof logs>[number]> = {}
    logs?.forEach((log) => {
      map[log.dayExerciseId] = log
    })
    return map
  }, [logs])

  type DayExercise = NonNullable<typeof dayExercises>[number]
  const { exercisesByBlock, unblockedExercises } = useMemo(() => {
    if (!dayExercises || !blocks) {
      return {
        exercisesByBlock: new Map<string, DayExercise[]>(),
        unblockedExercises: [] as DayExercise[],
      }
    }
    const byBlock = new Map<string, DayExercise[]>()
    const unblocked: DayExercise[] = []
    dayExercises.forEach((ex) => {
      if (ex.blockId) {
        const list = byBlock.get(ex.blockId) ?? []
        list.push(ex)
        byBlock.set(ex.blockId, list)
      } else {
        unblocked.push(ex)
      }
    })
    byBlock.forEach((list) => list.sort((a, b) => a.order - b.order))
    unblocked.sort((a, b) => a.order - b.order)
    return { exercisesByBlock: byBlock, unblockedExercises: unblocked }
  }, [dayExercises, blocks])

  const [localValues, setLocalValues] = useState<
    Record<string, { reps: string; weight: string }[]>
  >({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleStartWorkout = async () => {
    if (!paramAssignmentId || !paramWorkoutDayId || !paramPerformedOn) return
    setStarting(true)
    try {
      const newSessionId = await startSession({
        assignmentId: paramAssignmentId as any,
        workoutDayId: paramWorkoutDayId as any,
        performedOn: paramPerformedOn,
      })
      router.replace(`/home/workout/${newSessionId}` as Href)
    } catch (e) {
      console.error(e)
    } finally {
      setStarting(false)
    }
  }

  const getValuesFor = useCallback(
    (dayEx: NonNullable<typeof dayExercises>[number]) => {
      const log = logsByDayExercise[dayEx._id]
      const local = localValues[dayEx._id]
      const numSets = dayEx.sets
      const defaultReps = dayEx.reps
      const defaultWeight = dayEx.weight ?? ''

      // If we have local values with correct length, use them (they take priority)
      if (local && local.length === numSets) {
        return local.map((set) => ({
          reps: set.reps ?? defaultReps,
          weight: set.weight ?? defaultWeight,
        }))
      }

      // Build base values from log or defaults
      let baseValues: { reps: string; weight: string }[] = []

      // Parse comma-separated values from log if they exist
      if (log?.reps && log.reps.includes(',')) {
        const repsArray = log.reps
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
        const weightArray = log.weight
          ? log.weight.split(',').map((w) => {
              const trimmed = w.trim()
              return trimmed === '-' || trimmed === '' ? '' : trimmed
            })
          : []

        // If we have parsed values matching the number of sets, use them
        if (repsArray.length === numSets) {
          baseValues = Array.from({ length: numSets }, (_, index) => ({
            reps: repsArray[index] || defaultReps,
            weight: (weightArray[index] || defaultWeight) ?? '',
          }))
        }
      } else if (log?.reps && !log.reps.includes(',')) {
        // If log exists but doesn't have comma-separated values, use the single value for all sets
        const logWeight = log.weight && log.weight !== '-' ? log.weight : ''
        baseValues = Array.from({ length: numSets }, () => ({
          reps: log.reps,
          weight: (logWeight || defaultWeight) ?? '',
        }))
      } else {
        // Initialize from default values
        baseValues = Array.from({ length: numSets }, () => ({
          reps: defaultReps,
          weight: defaultWeight,
        }))
      }

      // Merge with local values if they exist (preserve any partial local edits)
      if (local && local.length > 0) {
        return baseValues.map((base, index) => {
          const localSet = local[index]
          if (localSet) {
            return {
              reps: localSet.reps ?? base.reps,
              weight: localSet.weight ?? base.weight,
            }
          }
          return base
        })
      }

      return baseValues
    },
    [logsByDayExercise, localValues]
  )

  const updateLocal = useCallback(
    (
      dayEx: NonNullable<typeof dayExercises>[number],
      setIndex: number,
      field: 'reps' | 'weight',
      value: string,
      currentDisplayedValues: { reps: string; weight: string }[]
    ) => {
      setLocalValues((prev) => {
        const current = prev[dayEx._id]
        const numSets = dayEx.sets

        // If we already have local values with correct length, update just the one field
        if (current && current.length === numSets) {
          const updated = current.map((set, idx) => {
            if (idx === setIndex) {
              return { ...set, [field]: value }
            }
            return { ...set }
          })
          return {
            ...prev,
            [dayEx._id]: updated,
          }
        }

        // Otherwise, initialize from current displayed values and update the one field
        const updated = currentDisplayedValues.map((set, idx) => {
          if (idx === setIndex) {
            return { ...set, [field]: value }
          }
          return { ...set }
        })

        return {
          ...prev,
          [dayEx._id]: updated,
        }
      })
    },
    []
  )

  const saveLog = useCallback(
    async (dayEx: NonNullable<typeof dayExercises>[number]) => {
      if (isNewSession || !sessionId) return
      const values = getValuesFor(dayEx)
      const numSets = dayEx.sets

      // Check if all sets have reps filled
      const allSetsFilled = values.every((set) => set.reps.trim().length > 0)
      if (!allSetsFilled) return

      setSavingId(dayEx._id)
      try {
        // For now, save the first set's values (backend doesn't support per-set tracking yet)
        // TODO: Update backend to support per-set reps/weight
        await setLog({
          sessionId: sessionId as any,
          dayExerciseId: dayEx._id,
          sets: numSets,
          reps: values.map((s) => s.reps.trim()).join(', '),
          weight: values.map((s) => s.weight.trim() || '-').join(', '),
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
    [isNewSession, sessionId, getValuesFor, setLog]
  )

  const allExercisesFilled = useMemo(() => {
    if (!dayExercises?.length) return false
    return dayExercises.every((dayEx) => {
      // Check if user has entered values (local state or saved logs)
      const hasLocalValues =
        localValues[dayEx._id] && localValues[dayEx._id].length === dayEx.sets
      const hasLog = !!logsByDayExercise[dayEx._id]

      // If no user input exists, exercise is not filled
      if (!hasLocalValues && !hasLog) return false

      // If user has entered values, check all sets have reps AND weight filled
      // (matching the completion icon logic)
      const values = getValuesFor(dayEx)
      return values.every(
        (set) => set.reps.trim().length > 0 && set.weight.trim().length > 0
      )
    })
  }, [dayExercises, getValuesFor, localValues, logsByDayExercise])

  const handleComplete = async () => {
    if (isNewSession || !sessionId || session?.status === 'completed') return

    // Show warning if exercises aren't all filled
    if (!allExercisesFilled) {
      Alert.alert(
        'Ejercicios incompletos',
        'Aún quedan ejercicios por completar, ¿estás seguro que quieres guardar?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Guardar',
            onPress: async () => {
              await completeWorkout()
            },
          },
        ]
      )
      return
    }

    await completeWorkout()
  }

  const completeWorkout = async () => {
    if (isNewSession || !sessionId) return
    setCompleting(true)
    try {
      for (const dayEx of dayExercises ?? []) {
        const values = getValuesFor(dayEx)
        const allSetsFilled = values.every((set) => set.reps.trim().length > 0)
        if (!allSetsFilled) continue
        await setLog({
          sessionId: sessionId as any,
          dayExerciseId: dayEx._id,
          sets: dayEx.sets,
          reps: values.map((s) => s.reps.trim()).join(', '),
          weight: values.map((s) => s.weight.trim() || '-').join(', '),
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

  const loading = isNewSession
    ? dayExercises === undefined || blocks === undefined
    : session === undefined ||
      dayExercises === undefined ||
      blocks === undefined ||
      logs === undefined

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (isNewSession) {
    if (!paramWorkoutDayId || !paramPerformedOn || !paramAssignmentId) {
      return (
        <ThemedView style={[styles.container, styles.centered]}>
          <ThemedText>Faltan datos para cargar el entrenamiento</ThemedText>
          <PressableScale
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
          >
            <ThemedText style={{ opacity: 0.8 }}>Volver</ThemedText>
          </PressableScale>
        </ThemedView>
      )
    }
  } else if (!session) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText>Sesión no encontrada</ThemedText>
      </ThemedView>
    )
  }

  const isCompleted = !isNewSession && session?.status === 'completed'

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
            {
              paddingTop: insets.top + 60,
              paddingBottom: insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {(() => {
            const renderExerciseCard = (dayEx: DayExercise) => {
              const values = getValuesFor(dayEx)
              const hasLog = !!logsByDayExercise[dayEx._id]
              const saving = savingId === dayEx._id
              return (
                <View
                  key={dayEx._id}
                  style={[styles.exerciseCard, { borderColor }]}
                >
                  <PressableScale
                    style={styles.exerciseHeader}
                    onPress={() =>
                      router.push(
                        `/home/exercise/${dayEx.exerciseId}?dayExerciseId=${dayEx._id}` as Href
                      )
                    }
                  >
                    <ThemedText style={styles.exerciseName}>
                      {dayEx.exercise?.name ?? 'Ejercicio'}
                    </ThemedText>
                    {dayEx.exercise?.videoUrl && (
                      <Image
                        source={{
                          uri:
                            getVideoThumbnailUrl(dayEx.exercise.videoUrl) ??
                            undefined,
                        }}
                        style={styles.exerciseThumbnail}
                        resizeMode="cover"
                      />
                    )}
                  </PressableScale>
                  <ThemedText style={styles.planned}>
                    Plan: {dayEx.sets} × {dayEx.reps}
                    {dayEx.weight ? ` · ${dayEx.weight}` : ''}
                  </ThemedText>
                  <View style={styles.setsGrid}>
                    <View style={styles.setsColumn}>
                      {Array.from({ length: dayEx.sets }).map((_, setIndex) => {
                        const setValues = values[setIndex] ?? {
                          reps: '',
                          weight: '',
                        }
                        const isSetCompleted =
                          setValues.reps?.trim().length > 0 &&
                          setValues.weight?.trim().length > 0
                        return (
                          <View key={`set-${setIndex}`} style={styles.setRow}>
                            <View style={styles.setInputs}>
                              <View style={styles.setInputGroup}>
                                <ThemedText style={styles.inputLabel}>
                                  Reps
                                </ThemedText>
                                <TextInput
                                  style={[
                                    styles.input,
                                    {
                                      backgroundColor: inputBg,
                                      color: inputColor,
                                    },
                                  ]}
                                  value={setValues.reps}
                                  onChangeText={(t) =>
                                    updateLocal(
                                      dayEx,
                                      setIndex,
                                      'reps',
                                      t,
                                      values
                                    )
                                  }
                                  onBlur={() => saveLog(dayEx)}
                                  placeholder="0"
                                  placeholderTextColor={
                                    isDark ? '#71717a' : '#a1a1aa'
                                  }
                                  keyboardType="default"
                                  editable={!isNewSession && !isCompleted}
                                />
                              </View>
                              <View style={styles.setInputGroup}>
                                <ThemedText style={styles.inputLabel}>
                                  Peso
                                </ThemedText>
                                <TextInput
                                  style={[
                                    styles.input,
                                    {
                                      backgroundColor: inputBg,
                                      color: inputColor,
                                    },
                                  ]}
                                  value={setValues.weight}
                                  onChangeText={(t) =>
                                    updateLocal(
                                      dayEx,
                                      setIndex,
                                      'weight',
                                      t,
                                      values
                                    )
                                  }
                                  onBlur={() => saveLog(dayEx)}
                                  placeholder="kg"
                                  placeholderTextColor={
                                    isDark ? '#71717a' : '#a1a1aa'
                                  }
                                  keyboardType="decimal-pad"
                                  editable={!isNewSession && !isCompleted}
                                />
                              </View>
                              <View style={styles.statusColumn}>
                                <View style={styles.statusSpacer} />
                                <View style={styles.statusIconContainer}>
                                  <MaterialIcons
                                    name={
                                      isSetCompleted
                                        ? 'check-circle'
                                        : 'radio-button-unchecked'
                                    }
                                    size={24}
                                    color={
                                      isSetCompleted
                                        ? '#22c55e'
                                        : isDark
                                          ? '#71717a'
                                          : '#a1a1aa'
                                    }
                                  />
                                </View>
                              </View>
                            </View>
                          </View>
                        )
                      })}
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
            }

            const sortedBlocks = [...(blocks ?? [])].sort(
              (a, b) => a.order - b.order
            )

            return (
              <>
                {unblockedExercises.map((dayEx) => renderExerciseCard(dayEx))}
                {sortedBlocks.map((block) => {
                  const blockExercises = exercisesByBlock.get(block._id) ?? []
                  if (blockExercises.length === 0) return null
                  return (
                    <View key={block._id} style={styles.blockSection}>
                      <ThemedText style={styles.blockTitle}>
                        {block.name}
                      </ThemedText>
                      {blockExercises.map((dayEx) => renderExerciseCard(dayEx))}
                    </View>
                  )
                })}
              </>
            )
          })()}
        </ScrollView>

        {isNewSession && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 60,
                backgroundColor: isDark ? '#0a0a0a' : '#fff',
              },
            ]}
          >
            <ThemedPressable
              type="primary"
              onPress={handleStartWorkout}
              disabled={starting}
            >
              {starting ? (
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
                  Empezar entrenamiento
                </Text>
              )}
            </ThemedPressable>
          </View>
        )}

        {!isNewSession && !isCompleted && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 60,
                backgroundColor: isDark ? '#0a0a0a' : '#fff',
              },
            ]}
          >
            <ThemedPressable
              type="primary"
              onPress={handleComplete}
              disabled={completing}
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
            </ThemedPressable>
          </View>
        )}

        {isCompleted && (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + 60,
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
  },
  blockSection: {
    marginTop: 20,
    marginBottom: 4,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.9,
    marginBottom: 12,
    paddingLeft: 4,
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
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  exerciseThumbnail: {
    width: 60,
    height: 40,
    borderRadius: 6,
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
  setsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  setsColumn: {
    flex: 1,
    gap: 12,
  },
  setRow: {
    gap: 8,
  },
  setLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.9,
    marginBottom: 4,
  },
  setInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  setInputGroup: {
    flex: 1,
    minWidth: 0, // Ensures flex items can shrink below their content size
  },
  statusColumn: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: 40,
    flexShrink: 0, // Don't shrink the status column
  },
  statusSpacer: {
    height: 20, // Match inputLabel height + marginBottom (12px label + 4px margin + 4px for alignment)
  },
  statusIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 40, // Match input field height (paddingVertical: 10 * 2 + line height ~20),
    marginTop: 8,
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
    width: '100%', // Ensure inputs take full width of their container
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
