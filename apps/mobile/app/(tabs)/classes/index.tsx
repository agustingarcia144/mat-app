import React, { useCallback, useMemo, useState } from 'react'
import { StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { useQuery, useMutation, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import {
  ClassesListHeader,
  ClassesListRow,
  ClassesEmptyState,
  type NextUpcomingItem,
  type ClassRowData,
  type BookingState,
  type CancellationState,
  type ListRowSchedule,
  type ListRowClass,
  type ListRowReservation,
} from '@/components/features/classes'

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
  const router = useRouter()
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

  const nextUpcoming = useMemo((): NextUpcomingItem | null => {
    if (myUpcoming?.length) {
      const r = myUpcoming[0]
      if (r?.schedule && r?.class)
        return {
          type: 'reservation' as const,
          schedule: r.schedule,
          class: r.class,
        }
    }
    const first = enrichedSchedules[0]
    if (first)
      return {
        type: 'schedule' as const,
        schedule: first.schedule,
        class: first.class,
      }
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
      (classTemplate.cancellationWindowHours ?? 0) * 60 * 60 * 1000
    const latestCancellationTime = schedule.startTime - cancellationWindowMs
    const canCancel = nowMs <= latestCancellationTime

    return {
      canCancel,
      helperText: canCancel
        ? ''
        : `Cancelación hasta ${classTemplate.cancellationWindowHours ?? 0} horas antes`,
    }
  }, [])

  const loading =
    classes === undefined || schedules === undefined || myUpcoming === undefined

  const handleReserve = useCallback(
    (scheduleId: string) => {
      setError('')
      Alert.alert(
        'Reservar clase',
        '¿Querés reservar tu lugar en esta clase?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Sí, reservar',
            onPress: async () => {
              setBusyScheduleId(scheduleId)
              try {
                await reserve({ scheduleId: scheduleId as any })
              } catch (e: any) {
                setError(e?.message ?? 'No se pudo reservar la clase')
              } finally {
                setBusyScheduleId(null)
              }
            },
          },
        ]
      )
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

  const handlePressCard = useCallback(
    (scheduleId: string) => {
      router.push(`/classes/${scheduleId}` as Href)
    },
    [router]
  )

  const listHeader = useMemo(
    () => (
      <ClassesListHeader
        insetsTop={insets.top}
        error={error}
        isDark={isDark}
        nextUpcoming={nextUpcoming}
        onPressCard={handlePressCard}
      />
    ),
    [insets.top, error, isDark, nextUpcoming, handlePressCard]
  )

  const renderListItem = useCallback(
    ({ item: row }: { item: ClassRow }) => (
      <ClassesListRow
        row={row as ClassRowData}
        isDark={isDark}
        colorScheme={colorScheme ?? null}
        busyScheduleId={busyScheduleId}
        busyReservationId={busyReservationId}
        getBookingState={
          getBookingState as (args: {
            schedule: ListRowSchedule
            classTemplate: ListRowClass
          }) => BookingState
        }
        getCancellationState={
          getCancellationState as (r: ListRowReservation) => CancellationState
        }
        onReserve={handleReserve}
        onCancel={handleCancel}
        onPressCard={handlePressCard}
      />
    ),
    [
      isDark,
      colorScheme,
      busyScheduleId,
      busyReservationId,
      getBookingState,
      getCancellationState,
      handleReserve,
      handleCancel,
      handlePressCard,
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
    () => <ClassesEmptyState paddingBottom={insets.bottom + 40} />,
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
})
