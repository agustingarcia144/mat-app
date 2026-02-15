import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native'
import { PressableScale } from 'pressto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '@clerk/clerk-expo'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useQuery, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { format, getISODay, startOfWeek, endOfWeek } from 'date-fns'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { CalendarWeekView } from '@/components/features/home/calendar-week-view'
import { RestDayPlaceholder } from '@/components/features/home/rest-day-placeholder'

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const }

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

function DashboardContent() {
  const { user } = useUser()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [selectedDate, setSelectedDate] = useState(() => new Date())

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : 'skip'
  )

  const activeAssignment = useMemo(
    () => assignments?.find((a) => a.status === 'active'),
    [assignments]
  )

  const { monday, sunday } = useMemo(
    () => ({
      monday: startOfWeek(selectedDate, WEEK_STARTS_MONDAY),
      sunday: endOfWeek(selectedDate, WEEK_STARTS_MONDAY),
    }),
    [selectedDate]
  )

  const weekSessions = useQuery(
    api.workoutDaySessions.getMyWeekSessions,
    user?.id
      ? {
          startOn: format(monday, 'yyyy-MM-dd'),
          endOn: format(sunday, 'yyyy-MM-dd'),
        }
      : 'skip'
  )

  const handleWeekChange = (newDate: Date) => {
    setSelectedDate(newDate)
  }

  const workoutDays = useQuery(
    api.workoutDays.getByPlanification,
    activeAssignment?.planificationId
      ? { planificationId: activeAssignment.planificationId }
      : 'skip'
  )

  const allExercises = useQuery(
    api.dayExercises.getByPlanification,
    activeAssignment?.planificationId
      ? { planificationId: activeAssignment.planificationId }
      : 'skip'
  )

  const exercisesByDay = useMemo(() => {
    if (!allExercises) return {} as Record<string, typeof allExercises>
    const map: Record<string, typeof allExercises> = {}
    allExercises.forEach((ex) => {
      const dayId = ex.workoutDayId
      if (!map[dayId]) map[dayId] = []
      map[dayId].push(ex)
    })
    Object.keys(map).forEach((dayId) => {
      map[dayId].sort((a, b) => a.order - b.order)
    })
    return map
  }, [allExercises])

  const selectedYmd = format(selectedDate, 'yyyy-MM-dd')
  const selectedISOWeekday = getISODay(selectedDate)
  const scheduledWorkoutDay = useMemo(
    () => workoutDays?.find((d) => d.dayOfWeek === selectedISOWeekday) ?? null,
    [workoutDays, selectedISOWeekday]
  )
  const sessionForSelected = useMemo(
    () =>
      weekSessions?.find(
        (s) =>
          s.performedOn === selectedYmd &&
          s.workoutDayId === scheduledWorkoutDay?._id
      ) ??
      weekSessions?.find((s) => s.performedOn === selectedYmd) ??
      null,
    [weekSessions, selectedYmd, scheduledWorkoutDay?._id]
  )

  const blocksForSelectedDay = useQuery(
    api.exerciseBlocks.getByWorkoutDay,
    scheduledWorkoutDay?._id
      ? { workoutDayId: scheduledWorkoutDay._id }
      : 'skip'
  )

  const { statusBadgeLabel, statusBadgeVariant } = useMemo(() => {
    if (!sessionForSelected) {
      return {
        statusBadgeLabel: 'No Iniciado',
        statusBadgeVariant: 'notStarted' as const,
      }
    }
    if (sessionForSelected.status === 'completed') {
      return {
        statusBadgeLabel: 'Completado',
        statusBadgeVariant: 'completed' as const,
      }
    }
    if (sessionForSelected.status === 'skipped') {
      return {
        statusBadgeLabel: 'Omitido',
        statusBadgeVariant: 'skipped' as const,
      }
    }
    return {
      statusBadgeLabel: 'En curso',
      statusBadgeVariant: 'inProgress' as const,
    }
  }, [sessionForSelected])

  const handleOpenWorkout = () => {
    if (!activeAssignment || !scheduledWorkoutDay) return
    if (sessionForSelected) {
      router.push(`/home/workout/${sessionForSelected._id}` as Href)
    } else {
      router.push(
        `/home/workout/new?workoutDayId=${scheduledWorkoutDay._id}&performedOn=${selectedYmd}&assignmentId=${activeAssignment._id}` as Href
      )
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.welcome}>
            ¡Hola, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
          </ThemedText>
          <ThemedPressable
            type="secondary"
            onPress={() => router.push('/profile' as Href)}
            style={styles.avatarButton}
            accessibilityLabel="Abrir perfil"
          >
            {user?.imageUrl ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text
                style={[
                  styles.avatarPlaceholder,
                  { color: isDark ? '#a1a1aa' : '#52525b' },
                ]}
              >
                {(
                  user?.firstName?.[0] ||
                  user?.emailAddresses?.[0]?.emailAddress?.[0] ||
                  '?'
                ).toUpperCase()}
              </Text>
            )}
          </ThemedPressable>
        </View>

        {!activeAssignment ? (
          <View style={[styles.placeholder, styles.centered]}>
            <ThemedText style={styles.emptyText}>
              No tienes una planificación activa
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Ve a Planificaciones para ver tus rutinas
            </ThemedText>
            <ThemedPressable
              type="primary"
              onPress={() => router.push('/planifications' as Href)}
              style={{ paddingHorizontal: 12 }}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Ver planificaciones
              </Text>
            </ThemedPressable>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.calendarFullWidth,
                { width: windowWidth, marginLeft: -24 },
              ]}
            >
              <CalendarWeekView
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                onWeekChange={handleWeekChange}
                weekSessions={weekSessions}
                workoutDays={
                  workoutDays as {
                    dayOfWeek?: number
                    [key: string]: unknown
                  }[]
                }
              />
            </View>

            <View style={styles.todaySection}>
              {scheduledWorkoutDay ? (
                <>
                  <PressableScale
                    style={[
                      styles.workoutCard,
                      isDark && styles.workoutCardDark,
                    ]}
                    onPress={handleOpenWorkout}
                  >
                    <View style={styles.workoutCardContent}>
                      <ThemedText style={styles.workoutCardTitle}>
                        {scheduledWorkoutDay.name}
                      </ThemedText>
                      <View style={styles.workoutCardStatusRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                statusBadgeVariant === 'completed'
                                  ? isDark
                                    ? '#16a34a'
                                    : '#22c55e'
                                  : statusBadgeVariant === 'inProgress'
                                    ? isDark
                                      ? '#2563eb'
                                      : '#3b82f6'
                                    : statusBadgeVariant === 'notStarted'
                                      ? isDark
                                        ? '#ea580c'
                                        : '#f97316'
                                      : isDark
                                        ? 'rgba(255,255,255,0.12)'
                                        : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              (statusBadgeVariant === 'completed' ||
                                statusBadgeVariant === 'inProgress' ||
                                statusBadgeVariant === 'notStarted') && {
                                color: '#fff',
                              },
                              statusBadgeVariant === 'skipped' && {
                                color: isDark ? '#a1a1aa' : '#52525b',
                              },
                            ]}
                          >
                            {statusBadgeLabel}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.workoutCardMeta}>
                        <ThemedText style={styles.workoutCardMetaText}>
                          {blocksForSelectedDay?.length ?? 0}{' '}
                          {(blocksForSelectedDay?.length ?? 0) === 1
                            ? 'bloque'
                            : 'bloques'}
                        </ThemedText>
                        <ThemedText style={styles.workoutCardMetaDot}>
                          ·
                        </ThemedText>
                        <ThemedText style={styles.workoutCardMetaText}>
                          {exercisesByDay[scheduledWorkoutDay._id]?.length ?? 0}{' '}
                          {(exercisesByDay[scheduledWorkoutDay._id]?.length ??
                            0) === 1
                            ? 'ejercicio'
                            : 'ejercicios'}
                        </ThemedText>
                      </View>
                    </View>
                    <IconSymbol
                      name="chevron.right"
                      size={20}
                      color={isDark ? '#a1a1aa' : '#71717a'}
                    />
                  </PressableScale>
                </>
              ) : (
                <RestDayPlaceholder />
              )}
            </View>
          </>
        )}
      </View>
    </ThemedView>
  )
}

export default function DashboardScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Authenticated>
        <DashboardContent />
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  calendarFullWidth: {
    marginLeft: -24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  welcome: {
    flex: 1,
    marginTop: 8,
    marginBottom: 0,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  avatarPlaceholder: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    padding: 24,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    textAlign: 'center',
  },
  todaySection: {
    flex: 1,
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  workoutCardContent: {
    flex: 1,
  },
  workoutCardDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  workoutCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  workoutCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  workoutCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workoutCardMetaText: {
    fontSize: 13,
    opacity: 0.75,
  },
  workoutCardMetaDot: {
    fontSize: 13,
    opacity: 0.5,
  },
  workoutCardButton: {
    marginTop: 0,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  exerciseList: {
    maxHeight: 180,
    marginBottom: 16,
  },
  exerciseRow: {
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 0, 0, 0.25)',
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '500',
  },
  exerciseMeta: {
    fontSize: 13,
    marginTop: 2,
    opacity: 0.8,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
