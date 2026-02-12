import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '@clerk/clerk-expo'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedButton } from '@/components/themed-button'
import { format, getISODay, startOfWeek, endOfWeek } from 'date-fns'
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

  const startSession = useMutation(api.workoutDaySessions.startSession)
  const [busy, setBusy] = useState(false)

  const handleOpenWorkout = async () => {
    if (!activeAssignment || !scheduledWorkoutDay) return
    setBusy(true)
    try {
      const sessionId = sessionForSelected
        ? sessionForSelected._id
        : await startSession({
            assignmentId: activeAssignment._id,
            workoutDayId: scheduledWorkoutDay._id,
            performedOn: selectedYmd,
          })
      router.push(`/home/workout/${sessionId}` as Href)
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.welcome}>
            ¡Hola, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
          </ThemedText>
          <ThemedButton
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
          </ThemedButton>
        </View>

        {!activeAssignment ? (
          <View style={[styles.placeholder, styles.centered]}>
            <ThemedText style={styles.emptyText}>
              No tienes una planificación activa
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Ve a Planificaciones para ver tus rutinas
            </ThemedText>
            <ThemedButton
              type="primary"
              onPress={() => router.push('/planifications' as Href)}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Ver planificaciones
              </Text>
            </ThemedButton>
          </View>
        ) : (
          <>
            <CalendarWeekView
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              onWeekChange={handleWeekChange}
              weekSessions={weekSessions}
              workoutDays={
                workoutDays as { dayOfWeek?: number; [key: string]: unknown }[]
              }
            />

            <View style={styles.todaySection}>
              {scheduledWorkoutDay ? (
                <>
                  <ThemedText style={styles.sessionName}>
                    {scheduledWorkoutDay.name}
                  </ThemedText>
                  <ScrollView style={styles.exerciseList} nestedScrollEnabled>
                    {(exercisesByDay[scheduledWorkoutDay._id] ?? []).map(
                      (ex) => (
                        <View key={ex._id} style={styles.exerciseRow}>
                          <ThemedText style={styles.exerciseName}>
                            {ex.exercise?.name ?? 'Ejercicio'}
                          </ThemedText>
                          <ThemedText style={styles.exerciseMeta}>
                            {ex.sets} × {ex.reps}
                            {ex.weight ? ` · ${ex.weight}` : ''}
                          </ThemedText>
                        </View>
                      )
                    )}
                  </ScrollView>
                  <ThemedButton
                    type="primary"
                    onPress={handleOpenWorkout}
                    disabled={busy}
                  >
                    {busy ? (
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
                        {sessionForSelected?.status === 'completed'
                          ? 'Ver sesión completada'
                          : sessionForSelected
                            ? 'Continuar sesión'
                            : 'Comenzar sesión'}
                      </Text>
                    )}
                  </ThemedButton>
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
