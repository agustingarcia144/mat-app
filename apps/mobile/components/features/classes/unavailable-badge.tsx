import { IconSymbol } from '@/components/ui/icon-symbol'
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { BadgeColors } from '@/constants/theme'

interface UnavailableBadgeProps {
  isDark: boolean
  showIcon?: boolean
}

export function UnavailableBadge({
  isDark,
  showIcon = true,
}: UnavailableBadgeProps) {
  const palette = BadgeColors.destructive[isDark ? 'dark' : 'light']

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg },
      ]}
    >
      {showIcon && (
        <IconSymbol
          name="lock.fill"
          size={14}
          color={palette.text}
        />
      )}
      <Text style={[styles.badgeText, { color: palette.text }]}>
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
