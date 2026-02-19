import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface ReservationBadgeProps {
  isDark: boolean
  status?: 'confirmed' | 'attended' | 'no_show'
}

export function ReservationBadge({
  isDark,
  status = 'confirmed',
}: ReservationBadgeProps) {
  const palette =
    status === 'attended'
      ? {
          bg: isDark ? 'rgba(34,197,94,0.22)' : '#dcfce7',
          text: isDark ? '#86efac' : '#166534',
          label: 'Asististe',
        }
      : status === 'no_show'
        ? {
            bg: isDark ? 'rgba(239,68,68,0.24)' : '#fee2e2',
            text: isDark ? '#fca5a5' : '#b91c1c',
            label: 'No show',
          }
        : {
            bg: isDark ? 'rgba(234,88,12,0.2)' : '#ffedd5',
            text: isDark ? '#fdba74' : '#c2410c',
            label: 'Reservado',
          }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.text }]}>{palette.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
