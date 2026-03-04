import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { BadgeColors } from '@/constants/theme'

interface OccupancyBadgeProps {
  /** Number of spots left (capacity - currentReservations) */
  spotsLeft: number
  isDark: boolean
}

type BadgeState = 'available' | 'last' | 'sold_out'

function getBadgeState(spotsLeft: number): BadgeState {
  if (spotsLeft <= 0) return 'sold_out'
  if (spotsLeft <= 10) return 'last'
  return 'available'
}

function getLabel(spotsLeft: number, state: BadgeState): string {
  switch (state) {
    case 'available':
      return 'Disponible'
    case 'last':
      return `Últimos ${spotsLeft} disponibles`
    case 'sold_out':
      return 'Agotado'
  }
}

export function OccupancyBadge({ spotsLeft, isDark }: OccupancyBadgeProps) {
  const state = getBadgeState(spotsLeft)
  const label = getLabel(spotsLeft, state)

  const palette =
    state === 'available'
      ? BadgeColors.success[isDark ? 'dark' : 'light']
      : state === 'last'
        ? BadgeColors.warning[isDark ? 'dark' : 'light']
        : BadgeColors.destructive[isDark ? 'dark' : 'light']

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
