import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '@clerk/clerk-expo'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { format, getISODay, startOfWeek, endOfWeek } from 'date-fns'
import { CalendarWeekView } from '@/components/features/home/calendar-week-view'
import { NoActivePlanificationPlaceholder } from '@/components/features/home/no-active-planification-placeholder'
import { ReservedClassesForDay } from '@/components/features/home/reserved-classes-for-day'
import { RestDayPlaceholder } from '@/components/features/home/rest-day-placeholder'
import { ScheduledWorkoutCard } from '@/components/features/home/scheduled-workout-card'
import { ScrollView } from 'react-native-gesture-handler'

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const }

export default function DashboardContent() {
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
      ? {
          planificationId: activeAssignment.planificationId,
          revisionId: activeAssignment.revisionId,
        }
      : 'skip'
  )

  const allExercises = useQuery(
    api.dayExercises.getByPlanification,
    activeAssignment?.planificationId
      ? {
          planificationId: activeAssignment.planificationId,
          revisionId: activeAssignment.revisionId,
        }
      : 'skip'
  )

  const weekSessionsForActiveAssignment = useMemo(() => {
    if (!weekSessions || !activeAssignment) return []
    return weekSessions.filter((session) => {
      if (session.assignmentId !== activeAssignment._id) return false
      if (activeAssignment.revisionId && session.revisionId) {
        return session.revisionId === activeAssignment.revisionId
      }
      return true
    })
  }, [weekSessions, activeAssignment])
  const completedSessionsFromOtherAssignments = useMemo(() => {
    if (!weekSessions || !activeAssignment) return []
    return weekSessions.filter(
      (session) =>
        session.assignmentId !== activeAssignment._id && session.status === 'completed'
    )
  }, [weekSessions, activeAssignment])
  const weekSessionsForDisplay = useMemo(
    () => [
      ...weekSessionsForActiveAssignment,
      ...completedSessionsFromOtherAssignments,
    ],
    [weekSessionsForActiveAssignment, completedSessionsFromOtherAssignments]
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

  const { startOfDay, endOfDay } = useMemo(() => {
    const d = new Date(selectedDate)
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
    return { startOfDay: start.getTime(), endOfDay: end.getTime() }
  }, [selectedDate])

  const { startOfWeekMs, endOfWeekMs } = useMemo(
    () => ({
      startOfWeekMs: monday.getTime(),
      endOfWeekMs: sunday.getTime(),
    }),
    [monday, sunday]
  )

  const reservationsForDay = useQuery(api.classReservations.getByUserForDate, {
    startOfDay,
    endOfDay,
  })

  const reservationsForWeek = useQuery(
    api.classReservations.getByUserForDateRange,
    { startOfRange: startOfWeekMs, endOfRange: endOfWeekMs }
  )

  const daysWithClasses = useMemo(
    () =>
      Array.from(
        new Set(
          (reservationsForWeek ?? [])
            .filter((r) => r.schedule != null)
            .map((r) => format(new Date(r.schedule!.startTime), 'yyyy-MM-dd'))
        )
      ),
    [reservationsForWeek]
  )

  const reservedClassesItems = useMemo(
    () =>
      reservationsForDay?.filter(
        (
          r
        ): r is typeof r & {
          schedule: NonNullable<typeof r.schedule>
          class: NonNullable<typeof r.class>
        } => r.schedule != null && r.class != null
      ) ?? [],
    [reservationsForDay]
  )

  const scheduledWorkoutDay = useMemo(
    () => workoutDays?.find((d) => d.dayOfWeek === selectedISOWeekday) ?? null,
    [workoutDays, selectedISOWeekday]
  )
  const sessionForSelected = useMemo(
    () =>
      weekSessionsForActiveAssignment.find(
        (s) =>
          s.performedOn === selectedYmd &&
          s.workoutDayId === scheduledWorkoutDay?._id
      ) ??
      weekSessionsForDisplay.find(
        (s) =>
          s.status === 'completed' &&
          s.performedOn === selectedYmd &&
          s.workoutDayId === scheduledWorkoutDay?._id
      ) ??
      weekSessionsForActiveAssignment.find((s) => s.performedOn === selectedYmd) ??
      weekSessionsForDisplay.find(
        (s) => s.status === 'completed' && s.performedOn === selectedYmd
      ) ??
      null,
    [weekSessionsForActiveAssignment, weekSessionsForDisplay, selectedYmd, scheduledWorkoutDay?._id]
  )

  const historicalWorkoutDay = useQuery(
    api.workoutDays.getById,
    sessionForSelected && !scheduledWorkoutDay
      ? { id: sessionForSelected.workoutDayId }
      : 'skip'
  )
  const workoutDayToDisplay = scheduledWorkoutDay ?? historicalWorkoutDay ?? null
  const blocksForDisplayDay = useQuery(
    api.exerciseBlocks.getByWorkoutDay,
    workoutDayToDisplay?._id ? { workoutDayId: workoutDayToDisplay._id } : 'skip'
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
    if (sessionForSelected) {
      router.push(`/home/workout/${sessionForSelected._id}` as Href)
    } else {
      if (!activeAssignment || !scheduledWorkoutDay) return
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
          <NoActivePlanificationPlaceholder
            onPress={() => router.push('/planifications' as Href)}
            isDark={isDark}
          />
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
                weekSessions={weekSessionsForDisplay}
                workoutDays={
                  workoutDays as {
                    dayOfWeek?: number
                    [key: string]: unknown
                  }[]
                }
                daysWithClasses={daysWithClasses}
              />
            </View>

            <ScrollView contentContainerStyle={styles.todaySection}>
              {workoutDayToDisplay && (
                <ScheduledWorkoutCard
                  name={workoutDayToDisplay.name}
                  isDark={isDark}
                  statusBadgeVariant={statusBadgeVariant}
                  statusBadgeLabel={statusBadgeLabel}
                  blockCount={blocksForDisplayDay?.length ?? 0}
                  exerciseCount={
                    exercisesByDay[workoutDayToDisplay._id]?.length ?? 0
                  }
                  onPress={handleOpenWorkout}
                />
              )}
              {reservedClassesItems.length > 0 && (
                <ReservedClassesForDay
                  reservations={reservedClassesItems}
                  isDark={isDark}
                  onPressSchedule={(scheduleId) =>
                    router.push(`/home/schedule/${scheduleId}` as Href)
                  }
                />
              )}
              {reservedClassesItems.length === 0 &&
                workoutDayToDisplay === null &&
                sessionForSelected === null && <RestDayPlaceholder />}
            </ScrollView>
          </>
        )}
      </View>
    </ThemedView>
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
  todaySection: {
    flex: 1,
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
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
})
