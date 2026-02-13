import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { PressableScale } from 'pressto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Href } from 'expo-router'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { setLogSetSaveCallback } from '@/lib/log-set-bridge'
import {
  ExerciseCard,
  WorkoutFooter,
  type DayExerciseForCard,
} from '@/components/features/workout'

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
  const [expandedSetsByDayEx, setExpandedSetsByDayEx] = useState<
    Record<string, boolean>
  >({})

  const toggleSetsExpanded = useCallback((dayExId: string) => {
    setExpandedSetsByDayEx((prev) => ({
      ...prev,
      [dayExId]: !(prev[dayExId] ?? true),
    }))
  }, [])

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

  const saveLog = useCallback(
    async (
      dayEx: NonNullable<typeof dayExercises>[number],
      valuesOverride?: { reps: string; weight: string }[]
    ) => {
      if (isNewSession || !sessionId) return
      const values = valuesOverride ?? getValuesFor(dayEx)
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
        // Don't clear local state here: the logs query may not have refetched yet,
        // so the UI would briefly show stale data. Keep showing current local values.
      } catch (e) {
        console.error(e)
      } finally {
        setSavingId(null)
      }
    },
    [isNewSession, sessionId, getValuesFor, setLog]
  )

  const applyLogSetResult = useCallback(
    (result: {
      dayExId: string
      setIndex: number
      reps: number
      weight: number
      applyToAllSets?: boolean
    }) => {
      if (!dayExercises?.length) return
      const dayEx = dayExercises.find((d) => d._id === result.dayExId)
      if (!dayEx || result.setIndex < 0 || result.setIndex >= dayEx.sets) return
      const oneSet = {
        reps: String(result.reps),
        weight: String(result.weight),
      }
      // Build the full values array so we can persist immediately.
      const currentValues = getValuesFor(dayEx)
      const updatedValues = result.applyToAllSets
        ? Array.from({ length: dayEx.sets }, () => oneSet)
        : currentValues.map((set, idx) =>
            idx === result.setIndex ? oneSet : set
          )
      setLocalValues((prev) => {
        const next = result.applyToAllSets
          ? Array.from({ length: dayEx.sets }, () => oneSet)
          : (() => {
              const current = prev[result.dayExId] ?? []
              const arr = [...current]
              while (arr.length <= result.setIndex)
                arr.push({ reps: '', weight: '' })
              arr[result.setIndex] = oneSet
              return arr
            })()
        return { ...prev, [result.dayExId]: next }
      })
      saveLog(dayEx, updatedValues)
    },
    [dayExercises, getValuesFor, saveLog]
  )

  useFocusEffect(
    useCallback(() => {
      setLogSetSaveCallback(applyLogSetResult)
    }, [applyLogSetResult])
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
          {unblockedExercises.map((dayEx) => (
            <ExerciseCard
              key={dayEx._id}
              dayEx={dayEx as DayExerciseForCard}
              values={getValuesFor(dayEx)}
              saving={savingId === dayEx._id}
              isExpanded={expandedSetsByDayEx[dayEx._id] ?? true}
              onToggleExpand={() => toggleSetsExpanded(dayEx._id)}
              isNewSession={isNewSession}
              isCompleted={isCompleted}
              inputBg={inputBg}
              inputColor={inputColor}
              borderColor={borderColor}
              isDark={isDark}
              onPressExercise={() =>
                router.push(
                  `/home/exercise/${dayEx.exerciseId}?dayExerciseId=${dayEx._id}` as Href
                )
              }
              onPressSet={(setIndex) => {
                if (isNewSession || isCompleted) return
                const setValues = getValuesFor(dayEx)[setIndex] ?? {
                  reps: '',
                  weight: '',
                }
                router.push(
                  `/home/workout/log-set?dayExId=${encodeURIComponent(dayEx._id)}&setIndex=${setIndex}&reps=${encodeURIComponent(setValues.reps || '')}&weight=${encodeURIComponent(setValues.weight || '')}` as Href
                )
              }}
            />
          ))}
          {[...(blocks ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((block) => {
              const blockExercises = exercisesByBlock.get(block._id) ?? []
              if (blockExercises.length === 0) return null
              return (
                <View key={block._id} style={styles.blockSection}>
                  <ThemedText style={styles.blockTitle}>{block.name}</ThemedText>
                  {blockExercises.map((dayEx) => (
                    <ExerciseCard
                      key={dayEx._id}
                      dayEx={dayEx as DayExerciseForCard}
                      values={getValuesFor(dayEx)}
                      saving={savingId === dayEx._id}
                      isExpanded={expandedSetsByDayEx[dayEx._id] ?? true}
                      onToggleExpand={() => toggleSetsExpanded(dayEx._id)}
                      isNewSession={isNewSession}
                      isCompleted={isCompleted}
                      inputBg={inputBg}
                      inputColor={inputColor}
                      borderColor={borderColor}
                      isDark={isDark}
                      onPressExercise={() =>
                        router.push(
                          `/home/exercise/${dayEx.exerciseId}?dayExerciseId=${dayEx._id}` as Href
                        )
                      }
                      onPressSet={(setIndex) => {
                        if (isNewSession || isCompleted) return
                        const setValues = getValuesFor(dayEx)[setIndex] ?? {
                          reps: '',
                          weight: '',
                        }
                        router.push(
                          `/home/workout/log-set?dayExId=${encodeURIComponent(dayEx._id)}&setIndex=${setIndex}&reps=${encodeURIComponent(setValues.reps || '')}&weight=${encodeURIComponent(setValues.weight || '')}` as Href
                        )
                      }}
                    />
                  ))}
                </View>
              )
            })}
        </ScrollView>

        <WorkoutFooter
          isNewSession={isNewSession}
          isCompleted={isCompleted}
          starting={starting}
          completing={completing}
          onStartWorkout={handleStartWorkout}
          onComplete={handleComplete}
          paddingBottom={insets.bottom + 60}
          isDark={isDark}
          colorScheme={colorScheme ?? 'light'}
        />
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
})
