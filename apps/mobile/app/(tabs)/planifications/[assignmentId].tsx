import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '@clerk/clerk-expo'
import { useLocalSearchParams } from 'expo-router'
import { useQuery, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

function AssignmentDetailContent() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>()
  const { user } = useUser()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : 'skip'
  )

  const planificationId = useMemo(() => {
    const a = assignments?.find((a) => a._id === assignmentId)
    return a?.planificationId ?? null
  }, [assignments, assignmentId])

  const assignment = useMemo(
    () => assignments?.find((a) => a._id === assignmentId),
    [assignments, assignmentId]
  )

  const weeks = useQuery(
    api.workoutWeeks.getByPlanification,
    planificationId ? { planificationId } : 'skip'
  )

  const days = useQuery(
    api.workoutDays.getByPlanification,
    planificationId ? { planificationId } : 'skip'
  )

  const dayExercises = useQuery(
    api.dayExercises.getByPlanification,
    planificationId ? { planificationId } : 'skip'
  )

  const exercisesByDayId = useMemo(() => {
    if (!dayExercises) return {} as Record<string, typeof dayExercises>
    const map: Record<string, typeof dayExercises> = {}
    dayExercises.forEach((ex) => {
      const dayId = ex.workoutDayId
      if (!map[dayId]) map[dayId] = []
      map[dayId].push(ex)
    })
    Object.keys(map).forEach((dayId) => {
      map[dayId].sort((a, b) => a.order - b.order)
    })
    return map
  }, [dayExercises])

  const daysByWeekId = useMemo(() => {
    if (!days || !weeks) return {} as Record<string, typeof days>
    const map: Record<string, typeof days> = {}
    weeks.forEach((w) => {
      map[w._id] = days
        .filter((d) => d.weekId === w._id)
        .sort((a, b) => a.order - b.order)
    })
    return map
  }, [days, weeks])

  if (
    assignments === undefined ||
    weeks === undefined ||
    days === undefined ||
    dayExercises === undefined
  ) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (!assignment) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + 44 + 24 }]}>
          <ThemedText type="title" style={styles.title}>
            No encontrada
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Esta planificación no existe o no tienes acceso.
          </ThemedText>
        </View>
      </ThemedView>
    )
  }

  const planificationName = assignment.planification?.name ?? 'Planificación'
  const planificationDescription = assignment.planification?.description
  const statusLabel = STATUS_LABEL[assignment.status] ?? assignment.status

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 48 + 24,
            paddingBottom: insets.bottom + 48,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          {planificationName}
        </ThemedText>

        {planificationDescription ? (
          <ThemedText style={styles.description}>
            {planificationDescription}
          </ThemedText>
        ) : null}

        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                assignment.status === 'active'
                  ? Colors[colorScheme ?? 'light'].tint
                  : isDark
                    ? '#3f3f46'
                    : '#e4e4e7',
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color:
                  assignment.status === 'active'
                    ? colorScheme === 'dark'
                      ? '#000'
                      : '#fff'
                    : isDark
                      ? '#a1a1aa'
                      : '#52525b',
              },
            ]}
          >
            {statusLabel}
          </Text>
        </View>

        {weeks.length === 0 ? (
          <ThemedText style={styles.emptyText}>
            Esta planificación no tiene semanas ni días configurados.
          </ThemedText>
        ) : (
          <View style={styles.section}>
            {weeks.map((week) => {
              const weekDays = daysByWeekId[week._id] ?? []
              if (weekDays.length === 0) return null

              return (
                <View key={week._id} style={styles.weekBlock}>
                  <ThemedText style={styles.weekTitle}>{week.name}</ThemedText>
                  {weekDays.map((day) => {
                    const exercises = exercisesByDayId[day._id] ?? []
                    return (
                      <View
                        key={day._id}
                        style={[
                          styles.dayCard,
                          {
                            backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                            borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                          },
                        ]}
                      >
                        <ThemedText style={styles.dayName}>
                          {day.name}
                        </ThemedText>
                        {day.dayOfWeek != null ? (
                          <ThemedText style={styles.dayMeta}>
                            Día {day.dayOfWeek} de la semana
                          </ThemedText>
                        ) : null}
                        {exercises.length === 0 ? (
                          <ThemedText style={styles.noExercises}>
                            Sin ejercicios
                          </ThemedText>
                        ) : (
                          <View style={styles.exerciseList}>
                            {exercises.map((ex) => {
                              const thumbnailUrl = ex.exercise?.videoUrl
                                ? getVideoThumbnailUrl(ex.exercise.videoUrl)
                                : null
                              return (
                                <View
                                  key={ex._id}
                                  style={[
                                    styles.exerciseRow,
                                    {
                                      borderLeftColor: isDark
                                        ? '#52525b'
                                        : 'rgba(0,0,0,0.2)',
                                    },
                                  ]}
                                >
                                  {thumbnailUrl ? (
                                    <Image
                                      source={{ uri: thumbnailUrl }}
                                      style={[
                                        styles.exerciseThumbnail,
                                        {
                                          backgroundColor: isDark
                                            ? '#3f3f46'
                                            : '#e4e4e7',
                                        },
                                      ]}
                                      resizeMode="cover"
                                      accessibilityLabel={
                                        ex.exercise?.name ?? 'Ejercicio'
                                      }
                                    />
                                  ) : null}
                                  <View style={styles.exerciseContent}>
                                    <ThemedText style={styles.exerciseName}>
                                      {ex.exercise?.name ?? 'Ejercicio'}
                                    </ThemedText>
                                    <ThemedText style={styles.exerciseMeta}>
                                      {ex.sets} × {ex.reps}
                                      {ex.weight ? ` · ${ex.weight}` : ''}
                                    </ThemedText>
                                  </View>
                                </View>
                              )
                            })}
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  )
}

export default function AssignmentDetailScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <AssignmentDetailContent />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  title: {
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    opacity: 0.85,
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 24,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: 20,
  },
  weekBlock: {
    gap: 12,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  dayCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  dayMeta: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
  },
  noExercises: {
    fontSize: 14,
    opacity: 0.7,
  },
  exerciseList: {
    marginTop: 4,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    borderLeftWidth: 2,
    gap: 12,
  },
  exerciseThumbnail: {
    width: 56,
    height: 42,
    borderRadius: 6,
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '500',
  },
  exerciseMeta: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 24,
  },
  subtitle: {
    marginTop: 8,
    opacity: 0.8,
  },
  emptyText: {
    fontSize: 15,
    opacity: 0.8,
  },
})
