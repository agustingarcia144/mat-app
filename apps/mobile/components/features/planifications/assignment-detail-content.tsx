import React, { useMemo } from 'react'
import { View, ScrollView, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from "@clerk/expo"
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { AssignmentDetailHero } from './assignment-detail-hero'
import { AssignmentDetailWeekSection } from './assignment-detail-week-section'
import {
  AssignmentDetailNotFound,
  AssignmentDetailEmptyCard,
} from './assignment-detail-empty'
import { assignmentDetailStyles as styles } from './assignment-detail-styles'
import type { DayExerciseWithDetails, ExerciseBlock } from './types'

const suspendedStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  icon: {
    fontSize: 20,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  body: {
    fontSize: 13,
    color: '#ef4444',
    opacity: 0.85,
    lineHeight: 18,
  },
})

export function AssignmentDetailContent() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>()
  const router = useRouter()
  const { user } = useUser()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : 'skip'
  )
  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription)

  const planificationId = useMemo(() => {
    const a = assignments?.find((a) => a._id === assignmentId)
    return a?.planificationId ?? null
  }, [assignments, assignmentId])
  const revisionId = useMemo(() => {
    const a = assignments?.find((a) => a._id === assignmentId)
    return a?.revisionId ?? null
  }, [assignments, assignmentId])

  const assignment = useMemo(
    () => assignments?.find((a) => a._id === assignmentId),
    [assignments, assignmentId]
  )

  const weeks = useQuery(
    api.workoutWeeks.getByPlanification,
    planificationId ? { planificationId, revisionId: revisionId ?? undefined } : 'skip'
  )

  const days = useQuery(
    api.workoutDays.getByPlanification,
    planificationId ? { planificationId, revisionId: revisionId ?? undefined } : 'skip'
  )

  const dayExercises = useQuery(
    api.dayExercises.getByPlanification,
    planificationId ? { planificationId, revisionId: revisionId ?? undefined } : 'skip'
  )

  const blocks = useQuery(
    api.exerciseBlocks.getByPlanification,
    planificationId ? { planificationId, revisionId: revisionId ?? undefined } : 'skip'
  )

  const blocksByDayId = useMemo(() => {
    const blocksArr = Array.isArray(blocks) ? (blocks as ExerciseBlock[]) : []
    const map: Record<string, ExerciseBlock[]> = {}
    blocksArr.forEach((b) => {
      const dayId = b.workoutDayId
      if (!map[dayId]) map[dayId] = []
      map[dayId].push(b)
    })
    Object.keys(map).forEach((dayId) => {
      map[dayId].sort((a, b) => a.order - b.order)
    })
    return map
  }, [blocks])

  const exercisesByDayId = useMemo((): Record<
    string,
    DayExerciseWithDetails[]
  > => {
    if (!dayExercises) return {}
    const map: Record<string, DayExerciseWithDetails[]> = {}
    dayExercises.forEach((ex) => {
      const dayId = ex.workoutDayId
      if (!map[dayId]) map[dayId] = []
      map[dayId].push(ex as DayExerciseWithDetails)
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
    dayExercises === undefined ||
    blocks === undefined
  ) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (!assignment) {
    return <AssignmentDetailNotFound paddingTop={insets.top + 44 + 24} />
  }

  const planificationName = assignment.planification?.name ?? 'Planificación'
  const planificationDescription = assignment.planification?.description
  const weeksCount = weeks.length
  const startDate = assignment.startDate
    ? format(new Date(assignment.startDate), 'd MMM yyyy', { locale: es })
    : null
  const endDate = assignment.endDate
    ? format(new Date(assignment.endDate), 'd MMM yyyy', { locale: es })
    : null
  const dateRange =
    startDate && endDate
      ? `${startDate} – ${endDate}`
      : startDate
        ? `Desde ${startDate}`
        : endDate
          ? `Hasta ${endDate}`
          : null

  const muted = isDark ? '#a1a1aa' : '#71717a'
  const cardBg = isDark ? '#1c1c1e' : '#ffffff'
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e7'

  const isSuspended = subscription?.status === 'suspended'

  const handleExercisePress = (ex: { exerciseId: string; _id: string }) => {
    router.push(
      `/planifications/${assignmentId}/${ex.exerciseId}?dayExerciseId=${ex._id}`
    )
  }

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
        <AssignmentDetailHero
          name={planificationName}
          weeksCount={weeksCount}
          dateRange={dateRange}
          description={planificationDescription ?? null}
          muted={muted}
          statusLabel={
            assignment.status === 'active'
              ? null
              : assignment.status === 'cancelled'
                ? 'Historial (cancelada)'
                : 'Historial (completada)'
          }
        />

        {subscription?.status === 'suspended' && (
          <View style={suspendedStyles.banner}>
            <Text style={suspendedStyles.icon}>🔒</Text>
            <View style={suspendedStyles.textWrap}>
              <Text style={suspendedStyles.title}>Plan suspendido</Text>
              <Text style={suspendedStyles.body}>
                Tu plan está suspendido por falta de pago. Realizá el pago para volver a acceder a tus entrenamientos.
              </Text>
            </View>
          </View>
        )}

        {weeks.length === 0 ? (
          <AssignmentDetailEmptyCard
            message="Esta planificación no tiene semanas ni días configurados."
            muted={muted}
          />
        ) : (
          <View style={styles.section}>
            {weeks.map((week) => {
              const weekDays = daysByWeekId[week._id] ?? []
              if (weekDays.length === 0) return null
              return (
                <AssignmentDetailWeekSection
                  key={week._id}
                  week={week}
                  weekDays={weekDays}
                  exercisesByDayId={exercisesByDayId}
                  blocksByDayId={blocksByDayId}
                  isDark={isDark}
                  muted={muted}
                  cardBg={cardBg}
                  cardBorder={cardBorder}
                  onExercisePress={isSuspended ? undefined : handleExercisePress}
                />
              )
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  )
}
