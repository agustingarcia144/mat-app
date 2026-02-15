import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

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

  const backgroundColor =
    state === 'available'
      ? isDark
        ? 'rgba(34,197,94,0.2)'
        : '#dcfce7'
      : state === 'last'
        ? isDark
          ? 'rgba(234,88,12,0.2)'
          : '#ffedd5'
        : isDark
          ? 'rgba(185,28,28,0.2)'
          : '#fee2e2'

  const textColor =
    state === 'available'
      ? isDark
        ? '#86efac'
        : '#166534'
      : state === 'last'
        ? isDark
          ? '#fdba74'
          : '#c2410c'
        : isDark
          ? '#fca5a5'
          : '#991b1b'

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]} numberOfLines={1}>
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
