import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface OccupancyBadgeProps {
  /** Number of spots left (capacity - currentReservations) */
  spotsLeft: number
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

export function OccupancyBadge({ spotsLeft }: OccupancyBadgeProps) {
  const state = getBadgeState(spotsLeft)
  const label = getLabel(spotsLeft, state)

  const borderColor =
    state === 'available' ? '#166534' : state === 'last' ? '#92400e' : '#991b1b'
  const textColor =
    state === 'available' ? '#166534' : state === 'last' ? '#92400e' : '#991b1b'

  return (
    <View style={[styles.badge, { borderColor }]}>
      <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
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
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
})
