import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { BadgeColors } from '@/constants/theme'

interface OccupancyBadgeProps {
  capacity: number
  currentReservations: number
  status?: string
  isDark: boolean
}

type BadgeState = 'available' | 'few_spots' | 'full' | 'cancelled'

function getBadgeState(
  capacity: number,
  currentReservations: number,
  status?: string
): BadgeState {
  if (status === 'cancelled') return 'cancelled'
  if (capacity <= 0 || currentReservations >= capacity) return 'full'

  const percentOccupied = (currentReservations / capacity) * 100
  if (percentOccupied > 60) return 'few_spots'
  return 'available'
}

function getLabel(state: BadgeState): string {
  switch (state) {
    case 'available':
      return 'Disponible'
    case 'few_spots':
      return 'Pocos cupos'
    case 'full':
      return 'Completo'
    case 'cancelled':
      return 'Cancelada'
  }
}

export function OccupancyBadge({
  capacity,
  currentReservations,
  status,
  isDark,
}: OccupancyBadgeProps) {
  const state = getBadgeState(capacity, currentReservations, status)
  const label = getLabel(state)

  const palette =
    state === 'available'
      ? BadgeColors.success[isDark ? 'dark' : 'light']
      : state === 'few_spots'
        ? BadgeColors.warning[isDark ? 'dark' : 'light']
        : state === 'cancelled'
          ? {
              bg: isDark ? 'rgba(161,161,170,0.22)' : '#e4e4e7',
              text: isDark ? '#d4d4d8' : '#52525b',
            }
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
