import { IconSymbol } from '@/components/ui/icon-symbol'
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface UnavailableBadgeProps {
  isDark: boolean
  showIcon?: boolean
}

export function UnavailableBadge({
  isDark,
  showIcon = true,
}: UnavailableBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2',
        },
      ]}
    >
      {showIcon && (
        <IconSymbol
          name="lock.fill"
          size={14}
          color={isDark ? '#fca5a5' : '#991b1b'}
        />
      )}
      <Text
        style={[styles.badgeText, { color: isDark ? '#fca5a5' : '#991b1b' }]}
      >
        No Disponible
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
