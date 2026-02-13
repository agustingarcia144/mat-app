import React, { useCallback, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useQuery, useMutation, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { ThemedPressable } from '@/components/themed-pressable'
import { IconSymbol } from '@/components/ui/icon-symbol'

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
  const schedules = useQuery(api.classSchedules.getUpcoming, { limit: 25 })
  const myUpcoming = useQuery(api.classReservations.getUpcomingByUser, {})

  const reserve = useMutation(api.classReservations.reserve)
  const cancelReservation = useMutation(api.classReservations.cancel)

  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null)
  const [busyReservationId, setBusyReservationId] = useState<string | null>(
    null
  )
  const [error, setError] = useState('')

  type ClassItem =
    NonNullable<typeof classes> extends readonly (infer C)[] ? C : never
  type MyUpcomingItemElement =
    NonNullable<typeof myUpcoming> extends readonly (infer R)[] ? R : never

  const activeClassById = useMemo(() => {
    const map = new Map<string, ClassItem>()
    classes?.forEach((c) => map.set(c._id, c))
    return map
  }, [classes])

  const reservationByScheduleId = useMemo(() => {
    const map = new Map<string, MyUpcomingItemElement>()
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
      .filter(Boolean) as {
      schedule: (typeof schedules)[number]
      class: (typeof classes)[number]
    }[]
  }, [activeClassById, classes, schedules])

  type MyUpcomingItem = MyUpcomingItemElement
  type EnrichedItem = (typeof enrichedSchedules)[number]
  type ListItem =
    | {
        type: 'reservation'
        reservation: MyUpcomingItem
        schedule: NonNullable<MyUpcomingItem['schedule']>
        class: NonNullable<MyUpcomingItem['class']>
      }
    | {
        type: 'schedule'
        schedule: EnrichedItem['schedule']
        class: EnrichedItem['class']
      }

  const listItemsByDate = useMemo(() => {
    const map = new Map<string, ListItem[]>()
    const seenScheduleIds = new Set<string>()

    const add = (dateKey: string, item: ListItem) => {
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(item)
    }

    myUpcoming?.forEach((r) => {
      if (!r.schedule || !r.class) return
      seenScheduleIds.add(r.schedule._id)
      const dateKey = format(new Date(r.schedule.startTime), 'yyyy-MM-dd')
      add(dateKey, {
        type: 'reservation',
        reservation: r,
        schedule: r.schedule,
        class: r.class,
      })
    })

    enrichedSchedules.forEach(({ schedule, class: classTemplate }) => {
      const dateKey = format(new Date(schedule.startTime), 'yyyy-MM-dd')
      if (seenScheduleIds.has(schedule._id)) return
      add(dateKey, { type: 'schedule', schedule, class: classTemplate })
    })

    map.forEach((items) =>
      items.sort(
        (a, b) =>
          (a.type === 'reservation'
            ? a.schedule.startTime
            : a.schedule.startTime) -
          (b.type === 'reservation'
            ? b.schedule.startTime
            : b.schedule.startTime)
      )
    )
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [myUpcoming, enrichedSchedules])

  /** One list item = one card: date (left) | divider | class (right). Day repeats per class on same day. */
  type ClassRow = { dateKey: string; date: Date; item: ListItem }

  const listData = useMemo((): ClassRow[] => {
    const rows: ClassRow[] = []
    listItemsByDate.forEach(([dateKey, items]) => {
      const date = new Date(dateKey + 'T12:00:00')
      items.forEach((item) => {
        rows.push({ dateKey, date, item })
      })
    })
    return rows
  }, [listItemsByDate])

  const nextUpcoming = useMemo(() => {
    if (myUpcoming?.length) {
      const r = myUpcoming[0]
      if (r?.schedule && r?.class) return { type: 'reservation' as const, ...r }
    }
    const first = enrichedSchedules[0]
    if (first) return { type: 'schedule' as const, ...first }
    return null
  }, [myUpcoming, enrichedSchedules])

  const getBookingState = useCallback(
    (args: {
      schedule: EnrichedItem['schedule']
      classTemplate: EnrichedItem['class']
    }) => {
      const { schedule, classTemplate } = args
      const now = Date.now()

      const isFull = schedule.currentReservations >= schedule.capacity
      const isCancelled = schedule.status !== 'scheduled'
      const hasStarted = now >= schedule.startTime

      const bookingWindowMs =
        classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000
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
    },
    [reservationByScheduleId]
  )

  const getCancellationState = useCallback((r: MyUpcomingItem) => {
    const schedule = r.schedule
    const classTemplate = r.class
    if (!schedule || !classTemplate) {
      return { canCancel: false, helperText: '' }
    }

    const nowMs = Date.now()
    const cancellationWindowMs =
      classTemplate.cancellationWindowHours * 60 * 60 * 1000
    const latestCancellationTime = schedule.startTime - cancellationWindowMs
    const canCancel = nowMs <= latestCancellationTime

    return {
      canCancel,
      helperText: canCancel
        ? ''
        : `Cancelación hasta ${classTemplate.cancellationWindowHours} horas antes`,
    }
  }, [])

  const loading =
    classes === undefined || schedules === undefined || myUpcoming === undefined

  const handleReserve = useCallback(
    async (scheduleId: string) => {
      setError('')
      setBusyScheduleId(scheduleId)
      try {
        await reserve({ scheduleId: scheduleId as any })
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo reservar la clase')
      } finally {
        setBusyScheduleId(null)
      }
    },
    [reserve]
  )

  const handleCancel = useCallback(
    async (reservationId: string) => {
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
    },
    [cancelReservation]
  )

  const renderClassIcon = useCallback(
    (className: string) => (
      <View
        style={[
          styles.classIcon,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#f97316' },
        ]}
      >
        <Text
          style={[styles.classIconText, { color: isDark ? '#e4e4e7' : '#fff' }]}
        >
          {(className || 'C').charAt(0).toUpperCase()}
        </Text>
      </View>
    ),
    [isDark]
  )

  const listHeader = useMemo(
    () => (
      <View
        style={[
          styles.listHeaderContent,
          {
            paddingTop: insets.top + 24,
            paddingBottom: 16,
          },
        ]}
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
            <Text
              style={[
                styles.errorText,
                { color: isDark ? '#fecdd3' : '#9f1239' },
              ]}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {nextUpcoming?.schedule && nextUpcoming?.class ? (
          <View
            style={[
              styles.highlightCard,
              {
                backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? '#3f3f46' : '#e4e4e7',
              },
            ]}
          >
            <View style={styles.highlightCardInner}>
              {renderClassIcon(nextUpcoming.class.name)}
              <View style={styles.highlightCardContent}>
                <Text
                  style={[
                    styles.highlightCardLabel,
                    {
                      color: isDark ? '#a1a1aa' : '#71717a',
                    },
                  ]}
                >
                  {nextUpcoming.type === 'reservation'
                    ? 'Tu próxima reserva'
                    : 'Próxima clase'}{' '}
                  ·{' '}
                  {format(new Date(nextUpcoming.schedule.startTime), 'd MMM', {
                    locale: es,
                  })}
                </Text>
                <Text
                  style={[
                    styles.highlightCardTitle,
                    { color: isDark ? '#fafafa' : '#18181b' },
                  ]}
                >
                  {nextUpcoming.class.name}
                </Text>
                <Text
                  style={[
                    styles.highlightCardMeta,
                    {
                      color: isDark ? '#a1a1aa' : '#71717a',
                    },
                  ]}
                >
                  {format(new Date(nextUpcoming.schedule.startTime), 'HH:mm', {
                    locale: es,
                  })}
                  –
                  {format(new Date(nextUpcoming.schedule.endTime), 'HH:mm', {
                    locale: es,
                  })}
                  {nextUpcoming.type === 'reservation'
                    ? ' · Reservado'
                    : ` · ${nextUpcoming.schedule.currentReservations}/${nextUpcoming.schedule.capacity}`}
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={20}
                color={isDark ? '#a1a1aa' : '#71717a'}
              />
            </View>
          </View>
        ) : null}
      </View>
    ),
    [insets.top, error, isDark, nextUpcoming, renderClassIcon]
  )

  const renderListItem = useCallback(
    ({ item: row }: { item: ClassRow }) => {
      const { date, item } = row
      const schedule = item.schedule
      const classTemplate = item.class
      const isReservation = item.type === 'reservation'
      const booking = isReservation
        ? null
        : getBookingState({ schedule, classTemplate })
      const cancelState = isReservation
        ? getCancellationState(item.reservation)
        : null
      const isReserving =
        !isReservation && busyScheduleId === schedule._id
      const isCancelling =
        isReservation && busyReservationId === item.reservation._id
      const dividerColor = isDark
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(255,255,255,0.15)'
      const cardBg = isDark ? '#0a0a0a' : '#000'
      const cardBorder = isDark
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(255,255,255,0.15)'
      const listCardMuted = isDark ? '#a1a1aa' : 'rgba(255,255,255,0.7)'
      const listCardTitleColor = '#fff'

      return (
        <View
          style={[
            styles.singleCardRow,
            {
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor: cardBorder,
            },
          ]}
        >
          <View style={styles.singleCardDateColumn}>
            <Text style={[styles.dateMonth, { color: listCardMuted }]}>
              {format(date, 'MMM', { locale: es }).toUpperCase()}
            </Text>
            <Text style={[styles.dateDay, { color: listCardTitleColor }]}>
              {format(date, 'd')}
            </Text>
          </View>
          <View style={[styles.verticalDivider, { backgroundColor: dividerColor }]} />
          <View style={styles.singleCardClassContent}>
            {renderClassIcon(classTemplate.name)}
            <View style={styles.listCardContent}>
              <Text
                style={[styles.listCardTitle, { color: listCardTitleColor }]}
              >
                {classTemplate.name}
              </Text>
              <Text
                style={[styles.listCardSubtitle, { color: listCardMuted }]}
              >
                {format(new Date(schedule.startTime), 'HH:mm', {
                  locale: es,
                })}
                –
                {format(new Date(schedule.endTime), 'HH:mm', {
                  locale: es,
                })}
                {isReservation
                  ? ' · Reservado'
                  : ` · ${schedule.currentReservations}/${schedule.capacity}`}
              </Text>
            </View>
            <View style={styles.listCardAction}>
              {isReservation ? (
                <ThemedPressable
                  type="secondary"
                  lightColor="rgba(255,255,255,0.15)"
                  darkColor="rgba(255,255,255,0.15)"
                  style={[
                    styles.smallButton,
                    (!cancelState?.canCancel || isCancelling) && {
                      opacity: 0.6,
                    },
                  ]}
                  enabled={
                    cancelState?.canCancel === true && !isCancelling
                  }
                  onPress={() => handleCancel(item.reservation._id)}
                >
                  <Text
                    style={[styles.smallButtonText, { color: '#fff' }]}
                  >
                    {isCancelling ? '...' : 'Cancelar'}
                  </Text>
                </ThemedPressable>
              ) : booking?.canReserve ? (
                <ThemedPressable
                  type="primary"
                  style={[
                    styles.smallButton,
                    isReserving && { opacity: 0.6 },
                  ]}
                  disabled={isReserving}
                  onPress={() => handleReserve(schedule._id)}
                >
                  <Text
                    style={[
                      styles.smallButtonText,
                      {
                        color: colorScheme === 'dark' ? '#000' : '#fff',
                      },
                    ]}
                  >
                    {isReserving ? '...' : 'Reservar'}
                  </Text>
                </ThemedPressable>
              ) : (
                <View
                  style={[
                    styles.statusIconWrap,
                    {
                      backgroundColor: booking?.isReserved
                        ? isDark
                          ? '#16a34a'
                          : '#22c55e'
                        : isDark
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  {booking?.isReserved ? (
                    <IconSymbol
                      name="checkmark"
                      size={16}
                      color="#fff"
                    />
                  ) : (
                    <IconSymbol
                      name="lock.fill"
                      size={14}
                      color={listCardMuted}
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      )
    },
    [
      isDark,
      colorScheme,
      busyScheduleId,
      busyReservationId,
      getBookingState,
      getCancellationState,
      handleReserve,
      handleCancel,
      renderClassIcon,
    ]
  )

  const keyExtractor = useCallback((item: ClassRow) => {
    const id =
      item.item.type === 'reservation'
        ? item.item.reservation._id
        : item.item.schedule._id
    return `${item.dateKey}-${id}`
  }, [])

  const listEmpty = useMemo(
    () => (
      <View style={[styles.emptyBlock, { paddingBottom: insets.bottom + 40 }]}>
        <ThemedText style={styles.emptyText}>
          No hay clases programadas
        </ThemedText>
        <ThemedText style={styles.emptySubtext}>
          Consultá más tarde o hablá con tu gimnasio
        </ThemedText>
      </View>
    ),
    [insets.bottom]
  )

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <FlashList
        data={listData}
        renderItem={renderListItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      />
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
  listHeaderContent: {
    paddingHorizontal: 12,
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
  highlightCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  highlightCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  highlightCardContent: {
    flex: 1,
  },
  highlightCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  highlightCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  highlightCardMeta: {
    fontSize: 13,
  },
  singleCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    padding: 0,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  singleCardDateColumn: {
    width: 52,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  singleCardClassContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    minWidth: 0,
  },
  dateGroup: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  dateColumn: {
    width: 44,
    marginRight: 12,
    alignItems: 'center',
  },
  dateColumnPlaceholder: {
    width: 44,
    marginRight: 12,
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateDay: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardsColumn: {
    flex: 1,
    gap: 10,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    gap: 12,
  },
  classIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classIconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  listCardContent: {
    flex: 1,
    minWidth: 0,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  listCardSubtitle: {
    fontSize: 13,
  },
  listCardAction: {
    marginLeft: 8,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlock: {
    paddingVertical: 24,
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
