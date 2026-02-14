import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ThemedPressable } from '@/components/themed-pressable'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { ClassIcon } from './class-icon'

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
  onReserve: (scheduleId: string) => void
  onCancel: (reservationId: string) => void
}

export function ClassesListRow({
  row,
  isDark,
  colorScheme,
  busyScheduleId,
  busyReservationId,
  getBookingState,
  getCancellationState,
  onReserve,
  onCancel,
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
  const isReserving = !isReservation && busyScheduleId === schedule._id
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
        <ClassIcon className={classTemplate.name} isDark={isDark} />
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
              onPress={() => onCancel(item.reservation._id)}
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
              onPress={() => onReserve(schedule._id)}
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
}

const styles = StyleSheet.create({
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
  dateMonth: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateDay: {
    fontSize: 22,
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
})
