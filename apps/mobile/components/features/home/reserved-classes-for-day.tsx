import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { ClassIcon } from '@/components/features/classes/class-icon'

export type ReservationStatus =
  | 'confirmed'
  | 'attended'
  | 'no_show'
  | 'cancelled'

export interface DayReservationItem {
  _id: string
  scheduleId: string
  status: ReservationStatus
  schedule: {
    _id: string
    startTime: number
    endTime: number
  }
  class: { name: string }
}

export interface ReservedClassesForDayProps {
  reservations: DayReservationItem[]
  isDark: boolean
  onPressSchedule: (scheduleId: string) => void
}

export function ReservedClassesForDay({
  reservations,
  isDark,
  onPressSchedule,
}: ReservedClassesForDayProps) {
  if (!reservations.length) return null

  const muted = isDark ? '#a1a1aa' : '#71717a'
  const titleColor = isDark ? '#fafafa' : '#18181b'
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const now = Date.now()

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: muted }]}>
        Clases reservadas
      </Text>
      {reservations.map((r) => {
        if (!r.schedule || !r.class) return null
        const startTime = r.schedule.startTime
        const endTime = r.schedule.endTime
        const timeLabel = `${format(new Date(startTime), 'HH:mm', { locale: es })} – ${format(new Date(endTime), 'HH:mm', { locale: es })}`
        const isPast = endTime < now
        const showAttendance = isPast && (r.status === 'attended' || r.status === 'no_show')

        return (
          <Pressable
            key={r._id}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: cardBg, borderColor: cardBorder },
              pressed && styles.cardPressed,
            ]}
            onPress={() => onPressSchedule(r.schedule._id)}
            accessibilityRole="button"
            accessibilityLabel={`${r.class.name}, ${timeLabel}${showAttendance ? `, ${r.status === 'attended' ? 'Asististe' : 'No asististe'}` : ''}`}
          >
            <ClassIcon className={r.class.name} isDark={isDark} />
            <View style={styles.content}>
              <Text
                style={[styles.className, { color: titleColor }]}
                numberOfLines={1}
              >
                {r.class.name}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.time, { color: muted }]}>{timeLabel}</Text>
                {showAttendance && (
                  <View
                    style={[
                      styles.attendanceBadge,
                      {
                        backgroundColor:
                          r.status === 'attended'
                            ? isDark
                              ? 'rgba(34,197,94,0.2)'
                              : 'rgba(34,197,94,0.12)'
                            : isDark
                              ? 'rgba(234,88,12,0.2)'
                              : 'rgba(234,88,12,0.12)',
                        borderColor:
                          r.status === 'attended'
                            ? isDark
                              ? 'rgba(34,197,94,0.45)'
                              : 'rgba(34,197,94,0.35)'
                            : isDark
                              ? 'rgba(234,88,12,0.45)'
                              : 'rgba(234,88,12,0.35)',
                      },
                    ]}
                  >
                    <IconSymbol
                      name={r.status === 'attended' ? 'checkmark' : 'xmark'}
                      size={14}
                      color={r.status === 'attended' ? '#22c55e' : '#ea580c'}
                    />
                    <Text
                      style={[
                        styles.attendanceLabel,
                        {
                          color:
                            r.status === 'attended'
                              ? isDark
                                ? '#4ade80'
                                : '#16a34a'
                              : isDark
                                ? '#fdba74'
                                : '#c2410c',
                        },
                      ]}
                    >
                      {r.status === 'attended' ? 'Asististe' : 'No asististe'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <IconSymbol
              name="chevron.right"
              size={18}
              color={isDark ? '#a1a1aa' : '#71717a'}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.85,
  },
  content: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  time: {
    fontSize: 13,
  },
  attendanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attendanceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
})
