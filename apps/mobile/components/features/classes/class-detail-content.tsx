import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native'
import { useAuth } from '@clerk/clerk-expo'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as Haptics from 'expo-haptics'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { ClassIcon } from '@/components/features/classes/class-icon'
import { OccupancyBadge } from '@/components/features/classes/occupancy-badge'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { ReservationBadge } from '@/components/features/classes/reservation-badge'
import { UnavailableBadge } from '@/components/features/classes/unavailable-badge'

const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const

export default function ClassDetailContent() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { userId } = useAuth()

  const scheduleWithDetails = useQuery(
    api.classSchedules.getScheduleWithDetails,
    scheduleId ? { id: scheduleId as any } : 'skip'
  )
  const myUpcoming = useQuery(api.classReservations.getUpcomingByUser, {})
  const myPast = useQuery(api.classReservations.getPastByUser, {})
  const reserve = useMutation(api.classReservations.reserve)
  const cancelReservation = useMutation(api.classReservations.cancel)
  const checkInSelf = useMutation(api.classReservations.checkInSelf)
  const fixedSlots = useQuery(
    api.fixedClassSlots.listByUser,
    userId ? { userId } : 'skip'
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reservation = useMemo(() => {
    if (!scheduleId || !myUpcoming || !myPast) return null
    const allReservations = [...myUpcoming, ...myPast]
    return allReservations.find((r) => r.schedule?._id === scheduleId) ?? null
  }, [scheduleId, myUpcoming, myPast])

  const isReserved = useMemo(() => Boolean(reservation), [reservation])

  const canReserve = useMemo(() => {
    if (!scheduleWithDetails || isReserved) return false
    const { currentReservations, capacity, startTime } = scheduleWithDetails
    const now = Date.now()
    if (currentReservations >= capacity) return false
    if (now >= startTime) return false
    const classTemplate = scheduleWithDetails.class
    if (!classTemplate) return false
    const bookingWindowMs =
      classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000
    if (now < startTime - bookingWindowMs) return false
    return true
  }, [scheduleWithDetails, isReserved])

  const canCancel = useMemo(() => {
    if (!reservation?.schedule || !reservation?.class) return false
    if (reservation.status !== 'confirmed') return false
    const schedule = reservation.schedule
    const classTemplate = reservation.class
    const now = Date.now()
    const cancellationWindowMs =
      (classTemplate.cancellationWindowHours ?? 0) * 60 * 60 * 1000
    const latestCancellationTime = schedule.startTime - cancellationWindowMs
    return now <= latestCancellationTime
  }, [reservation])

  const canCheckIn = useMemo(() => {
    if (!reservation?.schedule) return false
    if (reservation.status !== 'confirmed') return false

    const now = Date.now()
    const checkInOpensAt = reservation.schedule.startTime - 20 * 60 * 1000
    const checkInClosesAt = reservation.schedule.endTime + 6 * 60 * 60 * 1000
    return now >= checkInOpensAt && now <= checkInClosesAt
  }, [reservation])

  const isFixedSlot = useMemo(() => {
    if (!reservation || !scheduleWithDetails?.startTime || !fixedSlots?.length)
      return false
    const d = new Date(scheduleWithDetails.startTime)
    const day = d.getUTCDay()
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes()
    return fixedSlots.some(
      (s) =>
        s.classId === scheduleWithDetails.classId &&
        s.dayOfWeek === day &&
        s.startTimeMinutes === mins
    )
  }, [reservation, scheduleWithDetails, fixedSlots])

  const handleReserve = useCallback(() => {
    if (!scheduleId) return
    setError('')
    Alert.alert('Reservar clase', '¿Querés reservar tu lugar en esta clase?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, reservar',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          setBusy(true)
          try {
            await reserve({ scheduleId: scheduleId as any })
          } catch (e: any) {
            setError(e?.message ?? 'No se pudo reservar la clase')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }, [scheduleId, reserve])

  const handleCancel = useCallback(() => {
    if (!reservation?._id) return
    setError('')
    Alert.alert('Cancelar reserva', '¿Querés cancelar tu reserva?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          setBusy(true)
          try {
            await cancelReservation({ id: reservation._id as any })
          } catch (e: any) {
            setError(e?.message ?? 'No se pudo cancelar la reserva')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }, [reservation?._id, cancelReservation])

  const handleCheckIn = useCallback(() => {
    if (!reservation?._id) return
    setError('')
    Alert.alert('Confirmar asistencia', '¿Querés confirmar tu asistencia?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, confirmar',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          setBusy(true)
          try {
            await checkInSelf({ id: reservation._id as any })
          } catch (e: any) {
            setError(e?.message ?? 'No se pudo confirmar la asistencia')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }, [reservation?._id, checkInSelf])

  const addToCalendar = useCallback(() => {
    if (!scheduleWithDetails) return
    const { startTime, endTime } = scheduleWithDetails
    const classTemplate = scheduleWithDetails.class
    const title = classTemplate?.name ?? 'Clase'
    const start = new Date(startTime)
    const end = new Date(endTime)
    const formatForCal = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')
    if (Platform.OS === 'ios') {
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatForCal(start)}/${formatForCal(end)}`
      Linking.openURL(url)
    } else {
      const url = `content://com.android.calendar/time/${startTime}?title=${encodeURIComponent(title)}&endTime=${endTime}`
      Linking.canOpenURL(url).then((ok) => {
        if (ok) Linking.openURL(url)
        else
          Linking.openURL(
            `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatForCal(start)}/${formatForCal(end)}`
          )
      })
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [scheduleWithDetails])

  if (
    scheduleWithDetails === undefined ||
    myUpcoming === undefined ||
    myPast === undefined
  ) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (!scheduleWithDetails) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText style={[styles.notFound, isDark && styles.notFoundDark]}>
          Clase no encontrada
        </ThemedText>
        <ThemedPressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText>Volver</ThemedText>
        </ThemedPressable>
      </ThemedView>
    )
  }

  const { startTime, endTime, currentReservations, capacity } =
    scheduleWithDetails
  const classTemplate = scheduleWithDetails.class
  const scheduleDate = new Date(startTime)
  const timeLabel = `${format(new Date(startTime), 'HH:mm', { locale: es })} – ${format(new Date(endTime), 'HH:mm', { locale: es })}`
  const dateLabel = format(scheduleDate, "EEEE d 'de' MMMM", { locale: es })
  const spotsLeft = capacity - currentReservations

  const muted = isDark ? '#a1a1aa' : '#71717a'
  const titleColor = isDark ? '#fafafa' : '#18181b'
  const cardBg = isDark ? '#1c1c1e' : '#f4f4f5'
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — extra top padding to bring whole view down */}
        <View style={[styles.hero, { paddingTop: 48 }]}>
          <ClassIcon className={classTemplate?.name ?? ''} isDark={isDark} />
          <Text style={[styles.heroTitle, { color: titleColor }]}>
            {classTemplate?.name ?? 'Clase'}
          </Text>
          <Text style={[styles.heroTime, { color: muted }]}>{timeLabel}</Text>
          <Text style={[styles.heroDate, { color: muted }]}>{dateLabel}</Text>
          <View style={[styles.heroBadgeWrap, styles.heroBadgeRow]}>
            {isReserved ? (
              <>
                <ReservationBadge
                  isDark={isDark}
                  status={
                    (reservation?.status ?? 'confirmed') as
                      | 'confirmed'
                      | 'attended'
                      | 'no_show'
                  }
                />
                {isFixedSlot && (
                  <View
                    style={[
                      styles.fixedSlotBadge,
                      {
                        backgroundColor: isDark
                          ? 'rgba(59,130,246,0.22)'
                          : '#dbeafe',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.fixedSlotBadgeText,
                        { color: isDark ? '#93c5fd' : '#1d4ed8' },
                      ]}
                    >
                      Turno fijo
                    </Text>
                  </View>
                )}
              </>
            ) : canReserve ? (
              <OccupancyBadge
                capacity={capacity}
                currentReservations={currentReservations}
                status={scheduleWithDetails.status}
                isDark={isDark}
              />
            ) : scheduleWithDetails.status !== 'scheduled' ||
              currentReservations >= capacity ? (
              <OccupancyBadge
                capacity={capacity}
                currentReservations={currentReservations}
                status={scheduleWithDetails.status}
                isDark={isDark}
              />
            ) : (
              <UnavailableBadge isDark={isDark} />
            )}
          </View>
        </View>

        {/* Trainer (placeholder: schema has trainerId but no name resolution yet) */}
        {classTemplate?.trainerId && (
          <View
            style={[
              styles.sectionRow,
              styles.section,
              { backgroundColor: cardBg, borderColor },
            ]}
          >
            <IconSymbol name="person.fill" size={20} color={muted} />
            <ThemedText style={[styles.sectionLabel, { color: muted }]}>
              Instructor
            </ThemedText>
            <ThemedText style={[styles.sectionValue, { color: titleColor }]}>
              A confirmar
            </ThemedText>
          </View>
        )}

        {/* Description */}
        {classTemplate?.description?.trim() && (
          <View
            style={[
              styles.sectionRow,
              styles.section,
              { backgroundColor: cardBg, borderColor },
            ]}
          >
            <ThemedText style={[styles.sectionLabel, { color: muted }]}>
              Descripción
            </ThemedText>
            <ThemedText style={[styles.sectionValue, { color: titleColor }]}>
              {classTemplate.description}
            </ThemedText>
          </View>
        )}

        {/* Spots */}
        <View
          style={[
            styles.sectionRow,
            styles.section,
            { backgroundColor: cardBg, borderColor },
          ]}
        >
          <View style={styles.sectionLabelRow}>
            <IconSymbol name="person.2.fill" size={20} color={muted} />
            <ThemedText style={[styles.sectionLabel, { color: muted }]}>
              Lugares
            </ThemedText>
          </View>
          <ThemedText style={[styles.sectionValue, { color: titleColor }]}>
            {currentReservations} de {capacity} ocupados
            {spotsLeft > 0 && ` · ${spotsLeft} disponibles`}
          </ThemedText>
        </View>

        {/* Add to calendar — below Lugares card */}
        <ThemedPressable
          style={styles.addToCalendarButton}
          onPress={addToCalendar}
        >
          <IconSymbol
            name="calendar"
            size={20}
            color={isDark ? '#a1a1aa' : '#71717a'}
          />
          <ThemedText style={[styles.ctaSecondaryText, { color: muted }]}>
            Agregar al calendario
          </ThemedText>
        </ThemedPressable>

        {error ? (
          <View style={styles.errorWrap}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky bottom CTA — always visible, thumb-friendly, single primary action */}
      <View
        style={[
          styles.stickyFooter,
          {
            paddingBottom: insets.bottom + SPACING.lg,
            paddingTop: SPACING.lg,
            backgroundColor: isDark ? '#0a0a0a' : '#fff',
            borderTopColor: borderColor,
          },
        ]}
      >
        {isReserved && canCheckIn ? (
          <ThemedPressable
            type="primary"
            style={styles.ctaPrimary}
            onPress={handleCheckIn}
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
                  styles.ctaPrimaryText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Confirmar asistencia
              </Text>
            )}
          </ThemedPressable>
        ) : isReserved && reservation?.status === 'confirmed' ? (
          <ThemedPressable
            type="destructive"
            lightColor="#f87171"
            darkColor="rgba(239,68,68,0.9)"
            style={styles.ctaPrimary}
            onPress={handleCancel}
            disabled={!canCancel || busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.ctaPrimaryText}>Cancelar reserva</Text>
            )}
          </ThemedPressable>
        ) : canReserve ? (
          <ThemedPressable
            type="primary"
            style={styles.ctaPrimary}
            onPress={handleReserve}
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
                  styles.ctaPrimaryText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Reservar lugar
              </Text>
            )}
          </ThemedPressable>
        ) : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
  },
  hero: {
    alignItems: 'center',
    paddingBottom: SPACING.xxl,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  heroTime: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  heroDate: {
    fontSize: 15,
    marginTop: SPACING.xs,
    textTransform: 'capitalize',
  },
  heroBadge: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 12,
  },
  heroBadgeWrap: {
    marginTop: SPACING.md,
    alignSelf: 'center',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  fixedSlotBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  fixedSlotBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  heroBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    padding: SPACING.lg,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  sectionRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  addToCalendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorWrap: {
    padding: SPACING.md,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaPrimary: {
    minHeight: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 17,
    fontWeight: '600',
  },
  ctaSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
  },
  notFound: {
    fontSize: 16,
    marginBottom: SPACING.lg,
  },
  notFoundDark: {
    color: '#fafafa',
  },
  backBtn: {
    padding: SPACING.md,
  },
})
