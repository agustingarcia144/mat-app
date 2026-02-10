import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'

/** ISO weekday: 1 = Monday, 7 = Sunday */
function getISOWeekday(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Get Monday and Sunday of the week containing `date` */
function getWeekRange(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date)
  const iso = getISOWeekday(d)
  const monday = new Date(d)
  monday.setDate(d.getDate() - (iso - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { monday, sunday }
}

const SHORT_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
    () => getWeekRange(selectedDate),
    [selectedDate]
  )

  const weekSessions = useQuery(
    api.workoutDaySessions.getMyWeekSessions,
    user?.id
      ? {
          startOn: formatYYYYMMDD(monday),
          endOn: formatYYYYMMDD(sunday),
        }
      : 'skip'
  )

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

  const weekDays = useMemo(() => {
    const days: { date: Date; label: string; ymd: string }[] = []
    const curr = new Date(monday)
    for (let i = 0; i < 7; i++) {
      days.push({
        date: new Date(curr),
        label: SHORT_DAY_NAMES[i],
        ymd: formatYYYYMMDD(curr),
      })
      curr.setDate(curr.getDate() + 1)
    }
    return days
  }, [monday])

  const selectedYmd = formatYYYYMMDD(selectedDate)
  const selectedISOWeekday = getISOWeekday(selectedDate)
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
  const setSessionStatus = useMutation(api.workoutDaySessions.setStatus)
  const [busy, setBusy] = useState(false)

  const handleStartOrComplete = async () => {
    if (!activeAssignment || !scheduledWorkoutDay) return
    setBusy(true)
    try {
      if (sessionForSelected) {
        await setSessionStatus({
          id: sessionForSelected._id,
          status:
            sessionForSelected.status === 'completed' ? 'started' : 'completed',
        })
      } else {
        await startSession({
          assignmentId: activeAssignment._id,
          workoutDayId: scheduledWorkoutDay._id,
          performedOn: selectedYmd,
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  const completedForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === 'completed'
    ) ?? false

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.welcome}>
            ¡Hola, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
          </ThemedText>
          <TouchableOpacity
            onPress={() => router.push('/profile' as Href)}
            style={[
              styles.avatarButton,
              { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
            ]}
            accessibilityLabel="Abrir perfil"
          >
            {user?.imageUrl ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={[styles.avatarPlaceholder, { color: isDark ? '#a1a1aa' : '#52525b' }]}>
                {(user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0] || '?').toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {!activeAssignment ? (
          <View style={[styles.placeholder, styles.centered]}>
            <ThemedText style={styles.emptyText}>
              No tienes una planificación activa
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Ve a Planificaciones para ver tus rutinas
            </ThemedText>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: Colors[colorScheme ?? 'light'].tint },
              ]}
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
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.weekStrip}>
              {weekDays.map(({ date, label, ymd }) => {
                const isSelected = selectedYmd === ymd
                const hasCompleted = completedForDay(ymd)
                return (
                  <TouchableOpacity
                    key={ymd}
                    style={[
                      styles.dayCell,
                      {
                        backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                        borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedDate(date)}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.dayCellLabel}>{label}</ThemedText>
                    <ThemedText style={styles.dayCellNum}>
                      {date.getDate()}
                    </ThemedText>
                    {hasCompleted && (
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              Colors[colorScheme ?? 'light'].tint,
                          },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.todaySection}>
              {scheduledWorkoutDay ? (
                <>
                  <ThemedText style={styles.todayTitle}>
                    {selectedYmd === formatYYYYMMDD(new Date())
                      ? 'Hoy'
                      : 'Día seleccionado'}
                  </ThemedText>
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
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: Colors[colorScheme ?? 'light'].tint },
                    ]}
                    onPress={handleStartOrComplete}
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
                          ? 'Marcar como no completado'
                          : sessionForSelected
                            ? 'Marcar como completado'
                            : 'Comenzar sesión'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={[styles.placeholder, styles.centered]}>
                  <ThemedText style={styles.emptyText}>
                    Día de descanso
                  </ThemedText>
                  <ThemedText style={styles.emptySubtext}>
                    No hay rutina programada para este día
                  </ThemedText>
                </View>
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
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dayCell: {
    width: 40,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  dayCellLabel: {
    fontSize: 11,
    opacity: 0.9,
  },
  dayCellNum: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
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
