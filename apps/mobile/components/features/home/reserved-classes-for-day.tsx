import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { ClassIcon } from '@/components/features/classes/class-icon'

export interface DayReservationItem {
  _id: string
  scheduleId: string
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

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: muted }]}>
        Clases reservadas
      </Text>
      {reservations.map((r) => {
        if (!r.schedule || !r.class) return null
        const timeLabel = `${format(new Date(r.schedule.startTime), 'HH:mm', { locale: es })} – ${format(new Date(r.schedule.endTime), 'HH:mm', { locale: es })}`
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
            accessibilityLabel={`${r.class.name}, ${timeLabel}`}
          >
            <ClassIcon className={r.class.name} isDark={isDark} />
            <View style={styles.content}>
              <Text
                style={[styles.className, { color: titleColor }]}
                numberOfLines={1}
              >
                {r.class.name}
              </Text>
              <Text style={[styles.time, { color: muted }]}>{timeLabel}</Text>
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
  time: {
    fontSize: 13,
    marginTop: 2,
  },
})
