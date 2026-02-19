import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as Haptics from 'expo-haptics'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { ClassIcon } from './class-icon'
import { OccupancyBadge } from './occupancy-badge'
import { ReservationBadge } from './reservation-badge'
import { UnavailableBadge } from './unavailable-badge'

/** Schedule shape used by list row (from Convex schedule) */
export interface ListRowSchedule {
  _id: string
  startTime: number
  endTime: number
  currentReservations: number
  capacity: number
  status: string
}

/** Class template shape used by list row */
export interface ListRowClass {
  name: string
}

/** Reservation shape for cancellation (needs schedule + class for window) */
export interface ListRowReservation {
  _id: string
  status: 'confirmed' | 'cancelled' | 'attended' | 'no_show'
  schedule: ListRowSchedule
  class: ListRowClass & { cancellationWindowHours?: number }
}

/** One list row: date + class card (reservation or schedule) */
export interface ClassRowData {
  dateKey: string
  date: Date
  item:
    | {
        type: 'reservation'
        reservation: ListRowReservation
        schedule: ListRowSchedule
        class: ListRowClass
      }
    | {
        type: 'schedule'
        schedule: ListRowSchedule
        class: ListRowClass
      }
}

export interface BookingState {
  canReserve: boolean
  isReserved: boolean
  helperText: string
  isFull: boolean
}

export interface CancellationState {
  canCancel: boolean
  helperText: string
}

export interface CheckInState {
  canCheckIn: boolean
  helperText: string
}

/** Spacing scale: 4, 8, 12, 16, 20, 24. Card uses 16 padding, 12 gaps. */
const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

interface ClassesListRowProps {
  row: ClassRowData
  isDark: boolean
  colorScheme: string | null
  busyScheduleId: string | null
  busyReservationId: string | null
  getBookingState: (args: {
    schedule: ListRowSchedule
    classTemplate: ListRowClass
  }) => BookingState
  getCancellationState: (reservation: ListRowReservation) => CancellationState
  getCheckInState: (reservation: ListRowReservation) => CheckInState
  onReserve: (scheduleId: string) => void
  onCancel: (reservationId: string) => void
  onCheckIn: (reservationId: string) => void
  /** Navigate to class details; card tap triggers this, button does not. */
  onPressCard?: (scheduleId: string) => void
  hideReservationActions?: boolean
  busyCheckInReservationId?: string | null
}

export function ClassesListRow({
  row,
  isDark,
  colorScheme,
  busyScheduleId,
  busyReservationId,
  getBookingState,
  getCancellationState,
  getCheckInState,
  onReserve,
  onCancel,
  onCheckIn,
  onPressCard,
  hideReservationActions = false,
  busyCheckInReservationId = null,
}: ClassesListRowProps) {
  const { date, item } = row
  const schedule = item.schedule
  const classTemplate = item.class
  const isReservation = item.type === 'reservation'
  const booking = isReservation
    ? null
    : getBookingState({ schedule, classTemplate })
  const cancelState = isReservation
    ? getCancellationState(item.reservation as ListRowReservation)
    : null
  const checkInState = isReservation
    ? getCheckInState(item.reservation as ListRowReservation)
    : null
  const isReserving = !isReservation && busyScheduleId === schedule._id
  const isCancelling =
    isReservation && busyReservationId === item.reservation._id
  const isCheckingIn =
    isReservation && busyCheckInReservationId === item.reservation._id

  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e7'
  const cardBg = isDark ? '#141414' : '#ffffff'
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const muted = isDark ? '#a1a1aa' : '#71717a'
  const titleColor = isDark ? '#fafafa' : '#18181b'
  const timeColor = isDark ? '#d4d4d8' : '#3f3f46'

  const handleCardPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPressCard?.(schedule._id)
  }

  const handleReservePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onReserve(schedule._id)
  }

  const handleCancelPress = () => {
    if (item.type !== 'reservation') return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onCancel(item.reservation._id)
  }

  const handleCheckInPress = () => {
    if (item.type !== 'reservation') return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onCheckIn(item.reservation._id)
  }

  const timeLabel = `${format(new Date(schedule.startTime), 'HH:mm', { locale: es })} – ${format(new Date(schedule.endTime), 'HH:mm', { locale: es })}`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: cardBorder,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.cardTapArea,
          pressed && styles.cardPressed,
        ]}
        onPress={handleCardPress}
        accessibilityRole="button"
        accessibilityLabel={`${classTemplate.name}, ${timeLabel}. ${isReservation ? 'Reservado' : 'Disponible'}`}
      >
        <View style={[styles.dateStrip, { borderRightColor: dividerColor }]}>
          <Text style={[styles.dateMonth, { color: muted }]}>
            {format(date, 'MMM', { locale: es }).toUpperCase()}
          </Text>
          <Text style={[styles.dateDay, { color: titleColor }]}>
            {format(date, 'd')}
          </Text>
        </View>
        <View style={styles.main}>
          <ClassIcon className={classTemplate.name} isDark={isDark} />
          <View style={styles.content}>
            <Text
              style={[styles.title, { color: titleColor }]}
              numberOfLines={1}
            >
              {classTemplate.name}
            </Text>
            <View style={styles.metaBlock}>
              <Text style={[styles.time, { color: timeColor }]}>
                {timeLabel}
              </Text>
              <View style={styles.badgeRow}>
                {isReservation ? (
                  <ReservationBadge
                    isDark={isDark}
                    status={
                      (item.reservation.status ?? 'confirmed') as
                        | 'confirmed'
                        | 'attended'
                        | 'no_show'
                    }
                  />
                ) : booking?.canReserve ? (
                  <OccupancyBadge
                    spotsLeft={schedule.capacity - schedule.currentReservations}
                    isDark={isDark}
                  />
                ) : (
                  <UnavailableBadge isDark={isDark} showIcon={false} />
                )}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
      <View style={styles.action}>
        {isReservation &&
        hideReservationActions &&
        !checkInState?.canCheckIn ? null : isReservation &&
          checkInState?.canCheckIn ? (
          <ThemedPressable
            type="primary"
            style={styles.quickButton}
            disabled={isCheckingIn}
            onPress={handleCheckInPress}
          >
            {isCheckingIn ? (
              <ActivityIndicator
                size="small"
                color={colorScheme === 'dark' ? '#000' : '#fff'}
              />
            ) : (
              <Text
                style={[
                  styles.quickButtonText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Confirmar
              </Text>
            )}
          </ThemedPressable>
        ) : isReservation &&
          (item.reservation.status === 'attended' ||
            item.reservation.status === 'no_show') ? (
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor:
                  item.reservation.status === 'attended'
                    ? isDark
                      ? '#16a34a'
                      : '#22c55e'
                    : isDark
                      ? 'rgba(239,68,68,0.3)'
                      : '#fee2e2',
              },
            ]}
          >
            <IconSymbol
              name={
                item.reservation.status === 'attended' ? 'checkmark' : 'xmark'
              }
              size={16}
              color={
                item.reservation.status === 'attended'
                  ? '#fff'
                  : isDark
                    ? '#fca5a5'
                    : '#b91c1c'
              }
            />
          </View>
        ) : isReservation ? (
          <ThemedPressable
            type="secondary"
            lightColor="#f87171"
            darkColor="rgba(239,68,68,0.85)"
            style={[
              styles.quickButton,
              (!cancelState?.canCancel || isCancelling) && { opacity: 0.6 },
            ]}
            enabled={cancelState?.canCancel === true && !isCancelling}
            onPress={handleCancelPress}
          >
            {isCancelling ? (
              <ActivityIndicator
                size="small"
                color={isDark ? '#fff' : '#000'}
              />
            ) : (
              <Text style={[styles.quickButtonText, { color: '#fff' }]}>
                Cancelar
              </Text>
            )}
          </ThemedPressable>
        ) : booking?.canReserve ? (
          <ThemedPressable
            type="primary"
            style={styles.quickButton}
            disabled={isReserving}
            onPress={handleReservePress}
          >
            {isReserving ? (
              <ActivityIndicator
                size="small"
                color={colorScheme === 'dark' ? '#000' : '#fff'}
              />
            ) : (
              <Text
                style={[
                  styles.quickButtonText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Reservar
              </Text>
            )}
          </ThemedPressable>
        ) : (
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor: booking?.isReserved
                  ? isDark
                    ? '#16a34a'
                    : '#22c55e'
                  : isDark
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.06)',
              },
            ]}
          >
            {booking?.isReserved ? (
              <IconSymbol name="checkmark" size={16} color="#fff" />
            ) : (
              <IconSymbol name="lock.fill" size={14} color={muted} />
            )}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    // Subtle elevation for dark; avoid heavy shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minWidth: 0,
  },
  cardPressed: {
    opacity: 0.92,
  },
  dateStrip: {
    width: 44,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    gap: SPACING.md,
    minWidth: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  metaBlock: {
    flexDirection: 'column',
    gap: SPACING.xs,
  },
  badgeRow: {
    alignSelf: 'flex-start',
  },
  time: {
    fontSize: 15,
    fontWeight: '500',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  action: {
    justifyContent: 'center',
    paddingRight: SPACING.lg,
    paddingLeft: SPACING.sm,
  },
  quickButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 88,
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
