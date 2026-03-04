import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { BadgeColors } from '@/constants/theme'

interface ReservationBadgeProps {
  isDark: boolean
  status?: 'confirmed' | 'attended' | 'no_show'
}

export function ReservationBadge({
  isDark,
  status = 'confirmed',
}: ReservationBadgeProps) {
  const colorPalette =
    status === 'attended'
      ? BadgeColors.success[isDark ? 'dark' : 'light']
      : status === 'no_show'
        ? BadgeColors.destructive[isDark ? 'dark' : 'light']
        : BadgeColors.warning[isDark ? 'dark' : 'light']

  const label =
    status === 'attended' ? 'Asististe' : status === 'no_show' ? 'No show' : 'Reservado'

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colorPalette.bg },
      ]}
    >
      <Text style={[styles.badgeText, { color: colorPalette.text }]}>{label}</Text>
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
