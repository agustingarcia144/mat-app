import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedButton } from '@/components/themed-button'

function LoadingScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ThemedView style={[styles.container, styles.centered]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
    </ThemedView>
  )
}

function ClassesContent() {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const classes = useQuery(api.classes.getByOrganization, { activeOnly: true })
  const schedules = useQuery(api.classSchedules.getUpcoming, { limit: 50 })
  const myUpcoming = useQuery(api.classReservations.getUpcomingByUser, {})

  const reserve = useMutation(api.classReservations.reserve)
  const cancelReservation = useMutation(api.classReservations.cancel)

  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null)
  const [busyReservationId, setBusyReservationId] = useState<string | null>(
    null
  )
  const [error, setError] = useState('')

  const activeClassById = useMemo(() => {
    const map = new Map<string, (typeof classes)[number]>()
    classes?.forEach((c) => map.set(c._id, c))
    return map
  }, [classes])

  const reservationByScheduleId = useMemo(() => {
    const map = new Map<string, (typeof myUpcoming)[number]>()
    myUpcoming?.forEach((r) => {
      if (r.schedule?._id) map.set(r.schedule._id, r)
    })
    return map
  }, [myUpcoming])

  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return []

    return schedules
      .map((s) => {
        const classTemplate = activeClassById.get(s.classId)
        if (!classTemplate) return null
        return { schedule: s, class: classTemplate }
      })
      .filter(Boolean) as { schedule: (typeof schedules)[number]; class: (typeof classes)[number] }[]
  }, [activeClassById, classes, schedules])

  const now = Date.now()

  const getBookingState = (args: {
    schedule: (typeof enrichedSchedules)[number]['schedule']
    classTemplate: (typeof enrichedSchedules)[number]['class']
  }) => {
    const { schedule, classTemplate } = args

    const isFull = schedule.currentReservations >= schedule.capacity
    const isCancelled = schedule.status !== 'scheduled'
    const hasStarted = now >= schedule.startTime

    const bookingWindowMs = classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000
    const earliestBookingTime = schedule.startTime - bookingWindowMs
    const bookingNotOpenYet = now < earliestBookingTime

    const isReserved = reservationByScheduleId.has(schedule._id)

    const canReserve =
      !isReserved &&
      !isFull &&
      !isCancelled &&
      !hasStarted &&
      !bookingNotOpenYet

    let helperText = ''
    if (isReserved) helperText = 'Ya reservaste esta clase'
    else if (isCancelled) helperText = 'Clase no disponible'
    else if (hasStarted) helperText = 'La clase ya comenzó'
    else if (bookingNotOpenYet)
      helperText = `Reservas habilitadas ${classTemplate.bookingWindowDays} días antes`
    else if (isFull) helperText = 'Clase completa'

    return { canReserve, isReserved, helperText, isFull }
  }

  const getCancellationState = (r: (typeof myUpcoming)[number]) => {
    const schedule = r.schedule
    const classTemplate = r.class
    if (!schedule || !classTemplate) {
      return { canCancel: false, helperText: '' }
    }

    const cancellationWindowMs =
      classTemplate.cancellationWindowHours * 60 * 60 * 1000
    const latestCancellationTime = schedule.startTime - cancellationWindowMs
    const canCancel = now <= latestCancellationTime

    return {
      canCancel,
      helperText: canCancel
        ? ''
        : `Cancelación hasta ${classTemplate.cancellationWindowHours} horas antes`,
    }
  }

  const loading =
    classes === undefined || schedules === undefined || myUpcoming === undefined

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  const handleReserve = async (scheduleId: string) => {
    setError('')
    setBusyScheduleId(scheduleId)
    try {
      await reserve({ scheduleId: scheduleId as any })
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo reservar la clase')
    } finally {
      setBusyScheduleId(null)
    }
  }

  const handleCancel = async (reservationId: string) => {
    setError('')
    Alert.alert('Cancelar reserva', '¿Quieres cancelar tu reserva?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          setBusyReservationId(reservationId)
          try {
            await cancelReservation({ id: reservationId as any })
          } catch (e: any) {
            setError(e?.message ?? 'No se pudo cancelar la reserva')
          } finally {
            setBusyReservationId(null)
          }
        },
      },
    ])
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Clases
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Reservá tu lugar en las próximas clases
        </ThemedText>

        {error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: isDark ? '#3f1d2a' : '#ffe4e6' },
            ]}
          >
            <Text style={[styles.errorText, { color: isDark ? '#fecdd3' : '#9f1239' }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* My upcoming reservations */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Tus reservas</ThemedText>
          {myUpcoming.length === 0 ? (
            <View style={styles.emptyBlock}>
              <ThemedText style={styles.emptyText}>
                No tenés reservas próximas
              </ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Elegí una clase abajo para reservar tu lugar
              </ThemedText>
            </View>
          ) : (
            myUpcoming.map((r) => {
              const schedule = r.schedule
              const classTemplate = r.class
              if (!schedule || !classTemplate) return null

              const { canCancel, helperText } = getCancellationState(r)
              const isCancelling = busyReservationId === r._id

              return (
                <View
                  key={r._id}
                  style={[
                    styles.card,
                    isDark && styles.cardDark,
                    { borderColor: isDark ? '#3f3f46' : '#e4e4e7' },
                  ]}
                >
                  <View style={styles.cardHeaderRow}>
                    <ThemedText style={styles.cardTitle}>
                      {classTemplate.name}
                    </ThemedText>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255,255,255,0.12)'
                            : 'rgba(0,0,0,0.08)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isDark ? '#e4e4e7' : '#3f3f46' },
                        ]}
                      >
                        Reservado
                      </Text>
                    </View>
                  </View>

                  <ThemedText style={styles.cardMeta}>
                    {format(new Date(schedule.startTime), 'EEE d MMM · HH:mm', {
                      locale: es,
                    })}
                    –
                    {format(new Date(schedule.endTime), 'HH:mm', {
                      locale: es,
                    })}
                  </ThemedText>

                  {!canCancel && helperText ? (
                    <ThemedText style={styles.helperText}>{helperText}</ThemedText>
                  ) : null}

                  <View style={styles.cardActionsRow}>
                    <ThemedButton
                      type="secondary"
                      lightColor="#f4f4f5"
                      darkColor="#27272a"
                      style={[
                        styles.secondaryButton,
                        { borderColor: isDark ? '#3f3f46' : '#e4e4e7' },
                        (!canCancel || isCancelling) && { opacity: 0.6 },
                      ]}
                      disabled={!canCancel || isCancelling}
                      onPress={() => handleCancel(r._id)}
                    >
                      <Text style={[styles.secondaryButtonText, { color: isDark ? '#fff' : '#000' }]}>
                        {isCancelling ? 'Cancelando...' : 'Cancelar'}
                      </Text>
                    </ThemedButton>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* Available upcoming schedules */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Próximas clases</ThemedText>

          {enrichedSchedules.length === 0 ? (
            <View style={styles.emptyBlock}>
              <ThemedText style={styles.emptyText}>
                No hay clases programadas
              </ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Consultá más tarde o hablá con tu gimnasio
              </ThemedText>
            </View>
          ) : (
            enrichedSchedules.map(({ schedule, class: classTemplate }, idx) => {
              const booking = getBookingState({ schedule, classTemplate })
              const isReserving = busyScheduleId === schedule._id

              const prev = idx > 0 ? enrichedSchedules[idx - 1].schedule : null
              const showDayHeader =
                !prev ||
                format(new Date(prev.startTime), 'yyyy-MM-dd') !==
                  format(new Date(schedule.startTime), 'yyyy-MM-dd')

              return (
                <View key={schedule._id}>
                  {showDayHeader ? (
                    <ThemedText style={styles.dayHeader}>
                      {format(new Date(schedule.startTime), 'EEEE d MMMM', {
                        locale: es,
                      })}
                    </ThemedText>
                  ) : null}

                  <View
                    style={[
                      styles.card,
                      isDark && styles.cardDark,
                      { borderColor: isDark ? '#3f3f46' : '#e4e4e7' },
                    ]}
                  >
                    <View style={styles.cardHeaderRow}>
                      <ThemedText style={styles.cardTitle}>
                        {classTemplate.name}
                      </ThemedText>
                      {booking.isReserved ? (
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255,255,255,0.12)'
                                : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: isDark ? '#e4e4e7' : '#3f3f46' },
                            ]}
                          >
                            Reservado
                          </Text>
                        </View>
                      ) : booking.isFull ? (
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255,255,255,0.12)'
                                : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: isDark ? '#e4e4e7' : '#3f3f46' },
                            ]}
                          >
                            Completa
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <ThemedText style={styles.cardMeta}>
                      {format(new Date(schedule.startTime), 'HH:mm')}–{format(new Date(schedule.endTime), 'HH:mm')} ·{' '}
                      {schedule.currentReservations}/{schedule.capacity}
                    </ThemedText>

                    {booking.helperText ? (
                      <ThemedText style={styles.helperText}>
                        {booking.helperText}
                      </ThemedText>
                    ) : null}

                    <View style={styles.cardActionsRow}>
                      <ThemedButton
                        type="primary"
                        style={[
                          styles.primaryButton,
                          (!booking.canReserve || isReserving) && { opacity: 0.6 },
                        ]}
                        disabled={!booking.canReserve || isReserving}
                        onPress={() => handleReserve(schedule._id)}
                      >
                        <Text
                          style={[
                            styles.primaryButtonText,
                            {
                              color: colorScheme === 'dark' ? '#000' : '#fff',
                            },
                          ]}
                        >
                          {isReserving ? 'Reservando...' : 'Reservar'}
                        </Text>
                      </ThemedButton>
                    </View>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </ThemedView>
  )
}

export default function ClassesScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <ClassesContent />
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.8,
    marginBottom: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    marginBottom: 12,
  },
  dayHeader: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
    marginTop: 10,
    marginBottom: 8,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    fontSize: 13,
    opacity: 0.75,
  },
  helperText: {
    fontSize: 13,
    opacity: 0.75,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardActionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyBlock: {
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    textAlign: 'center',
  },
})

