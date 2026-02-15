import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface ReservationBadgeProps {
  isDark: boolean
}

export function ReservationBadge({ isDark }: ReservationBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isDark ? 'rgba(234,88,12,0.2)' : '#ffedd5',
        },
      ]}
    >
      <Text
        style={[styles.badgeText, { color: isDark ? '#fdba74' : '#c2410c' }]}
      >
        Reservado
      </Text>
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
